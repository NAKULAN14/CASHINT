"""
Calibrate the Mule-Chain Generator Using Real PaySim Statistics
------------------------------------------------------------------
Download PaySim1 first (free, one file):
    https://www.kaggle.com/datasets/ntnu-testimon/paysim1

This script reads that CSV and fits real distributions for:
  - transaction amounts (TRANSFER + CASH_OUT, the two fraud-relevant types)
  - what fraction of the fraud chain's money ends up as CASH_OUT vs TRANSFER
  - hour-of-day pattern of fraudulent CASH_OUT events (PaySim's "step" field
    is 1 simulated hour, so step % 24 recovers hour of day)

It writes calibration.json, which mule_chain_generator.py can optionally
load with --calibration to replace hand-guessed distribution parameters
with ones grounded in a real (if synthetic-origin) fraud dataset.

Usage:
    python calibrate_from_paysim.py --paysim_csv PS_20174392719_1491204439457_log.csv --out calibration.json
"""

import argparse
import json

import numpy as np
import pandas as pd


def main(paysim_csv, out_path):
    df = pd.read_csv(paysim_csv)

    fraud = df[df["isFraud"] == 1]
    fraud_relevant = fraud[fraud["type"].isin(["TRANSFER", "CASH_OUT"])]

    print(f"Loaded {len(df)} total PaySim transactions, {len(fraud)} labeled fraud, "
          f"{len(fraud_relevant)} fraud TRANSFER/CASH_OUT rows.")

    # --- amount distribution (log-space mean/sigma) fit on fraud amounts ---
    amounts = fraud_relevant.loc[fraud_relevant["amount"] > 0, "amount"]
    log_amounts = np.log(amounts)
    amount_lognorm_mean = float(log_amounts.mean())
    amount_lognorm_sigma = float(log_amounts.std())

    # --- channel mix: within fraud chains, what fraction of relevant hops
    # are CASH_OUT (i.e. the terminal, money-leaves-the-system step) vs
    # TRANSFER (an intermediate hop)? Used to sanity check chain_len assumptions. ---
    type_counts = fraud_relevant["type"].value_counts(normalize=True).to_dict()

    # --- hour-of-day pattern for fraudulent CASH_OUT specifically ---
    cashouts = fraud_relevant[fraud_relevant["type"] == "CASH_OUT"].copy()
    cashouts["hour"] = cashouts["step"] % 24
    hour_counts = cashouts["hour"].value_counts().reindex(range(24), fill_value=0)
    hour_weights = (hour_counts / hour_counts.sum()).tolist()

    calibration = {
        "amount_lognorm_mean": round(amount_lognorm_mean, 4),
        "amount_lognorm_sigma": round(amount_lognorm_sigma, 4),
        "fraud_type_mix": {k: round(v, 4) for k, v in type_counts.items()},
        "hour_of_day_weights": [round(w, 5) for w in hour_weights],
        "source": "PaySim1 (fraud-labeled TRANSFER/CASH_OUT rows)",
        "n_rows_used": int(len(fraud_relevant)),
    }

    with open(out_path, "w") as f:
        json.dump(calibration, f, indent=2)

    print(f"amount_lognorm_mean={amount_lognorm_mean:.3f}, "
          f"amount_lognorm_sigma={amount_lognorm_sigma:.3f}")
    print(f"fraud type mix: {calibration['fraud_type_mix']}")
    print(f"Wrote calibration to {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--paysim_csv", required=True,
                         help="Path to the downloaded PaySim1 CSV")
    parser.add_argument("--out", default="calibration.json")
    args = parser.parse_args()
    main(args.paysim_csv, args.out)
