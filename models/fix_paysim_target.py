"""
Fix for future_cashout_24h Target Generation
------------------------------------------------
ROOT CAUSE: PaySim's nameOrig field is (per published dataset analysis)
essentially a one-time-use random customer ID for ~99.85% of accounts --
only 0.15% of originators ever appear in more than one transaction.
nameDest, by contrast, recurs in 83% of cases.

If the target was computed by checking "does this same nameOrig reappear
as a CASH_OUT sender later", it will be ~always False, because the same
nameOrig almost never appears twice at all -- which matches the reported
0% positive rate exactly.

FIX: track each account across BOTH nameOrig and nameDest appearances
(a unified per-account ledger), and define the target on the RECEIVING
side: an account that just received money (appears as nameDest here) is
labeled 1 if that same account ID later appears as nameOrig in a CASH_OUT
within the next 24 steps (hours). This is also the actually-relevant
question for a mule-chain project: "will this account, which just
received funds, cash them out soon?"

Usage:
    python fix_paysim_target.py --input paysim_engineered.csv \
        --out paysim_with_fixed_target.csv --horizon_hours 24
"""

import argparse

import numpy as np
import pandas as pd


def compute_future_cashout_target(df: pd.DataFrame, horizon_hours: int = 24) -> pd.Series:
    df = df.reset_index(drop=True)

    # Step 1: for every account, the sorted steps at which IT appears as
    # nameOrig in a CASH_OUT (i.e. steps at which it "cashed out").
    cashout_rows = df[df["type"].astype(str).str.upper().isin(["CASH_OUT", "CASH-OUT"])]
    cashout_steps_by_account = (
        cashout_rows.groupby("nameOrig")["step"]
        .apply(lambda s: np.sort(s.to_numpy()))
        .to_dict()
    )

    # Step 2: for every row, look at the RECEIVING account (nameDest) and
    # ask: does that account's own future cash-out-step list contain a
    # step within (this_step, this_step + horizon]?
    steps = df["step"].to_numpy()
    dests = df["nameDest"].to_numpy()

    target = np.zeros(len(df), dtype=int)
    # group row indices by nameDest so we only do the searchsorted lookup
    # once per unique account, not once per row
    dest_groups = pd.Series(np.arange(len(df))).groupby(dests, sort=False)

    for account, idx in dest_groups:
        cashout_steps = cashout_steps_by_account.get(account)
        if cashout_steps is None or len(cashout_steps) == 0:
            continue
        row_steps = steps[idx.to_numpy()]
        # for each row's step S, find the first cashout_step > S
        pos = np.searchsorted(cashout_steps, row_steps, side="right")
        within_horizon = np.zeros(len(row_steps), dtype=bool)
        has_next = pos < len(cashout_steps)
        next_step = np.where(has_next, cashout_steps[np.clip(pos, 0, len(cashout_steps) - 1)], np.inf)
        within_horizon = has_next & (next_step - row_steps <= horizon_hours) & (next_step > row_steps)
        target[idx.to_numpy()[within_horizon]] = 1

    return pd.Series(target, index=df.index, name="future_cashout_24h")


def main(input_path, out_path, horizon_hours):
    df = pd.read_csv(input_path)
    required = {"step", "type", "nameOrig", "nameDest"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Input is missing required columns: {missing}")

    print(f"Loaded {len(df)} rows.")
    target = compute_future_cashout_target(df, horizon_hours)
    df["future_cashout_24h"] = target

    pos = target.sum()
    print(f"future_cashout_24h positive rate: {pos} / {len(df)} = {pos / len(df):.4%}")
    if pos == 0:
        print("WARNING: still 0 positives. Check that 'type' values match "
              "'CASH_OUT' (case-insensitive) and that nameDest actually "
              "overlaps with nameOrig values in this file.")
    elif pos / len(df) < 0.0005:
        print("NOTE: positive rate is very low (<0.05%) but nonzero -- this "
              "is plausible for PaySim (isFraud alone is only ~0.13%), but "
              "worth cross-checking against how many CASH_OUT transactions "
              "exist in total, and consider whether class-imbalance handling "
              "(e.g. class_weight, focal loss, or resampling) will be needed "
              "before training, per the class-imbalance section of your handoff doc.")

    df.to_csv(out_path, index=False)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", default="paysim_with_fixed_target.csv")
    parser.add_argument("--horizon_hours", type=int, default=24)
    args = parser.parse_args()
    main(args.input, args.out, args.horizon_hours)
