"""
Incremental Evidence Stream Builder
--------------------------------------
Takes the fully-resolved cases from mule_chain_generator.py (cases.jsonl,
where the whole chain + ground truth already exists) and slices each case
into a TIME-ORDERED sequence of snapshots -- "what an investigator would
have known as of this moment" -- for the live "watch the prediction
update as new evidence arrives" demo.

Design principle: ground truth is written to a SEPARATE file, keyed only
by case_id. The snapshot file never contains it. This isn't just tidiness
-- it prevents an easy mistake where your model/demo accidentally reads
the answer while pretending to predict it.

Two ways to use this:
  1. Batch, for pre-materializing a demo dataset:
       python build_incremental_snapshots.py --cases cases.jsonl \
           --snapshots_out snapshots.jsonl --labels_out labels.jsonl

  2. Live, inside a demo app -- import stream_case() and call next() on it
     each time you want to reveal the next piece of evidence:
       from build_incremental_snapshots import stream_case
       gen = stream_case(case)
       snapshot = next(gen)   # call again for the next snapshot
"""

import argparse
import json
from datetime import datetime


def _parse(ts):
    return datetime.fromisoformat(ts)


def stream_case(case: dict):
    """Yields snapshots for ONE case, in chronological order, one per new
    piece of evidence (a transaction or the account it introduces).
    Each snapshot only contains what's been "revealed" up to that point --
    no ground truth, no future transactions."""

    txs = sorted(case["transactions"], key=lambda t: t["timestamp"])
    accounts_by_id = {a["account_id"]: a for a in case["accounts"]}

    revealed_tx = []
    revealed_accounts = {}   # account_id -> account dict, in order revealed
    snapshot_idx = 0

    for tx in txs:
        revealed_tx.append(tx)
        for acc_id in (tx["from_account"], tx["to_account"]):
            if acc_id != "VICTIM" and acc_id not in revealed_accounts:
                revealed_accounts[acc_id] = accounts_by_id[acc_id]

        # "current terminal account" = the most recently revealed account
        # that has not (yet) sent money onward in what we've seen so far --
        # this is the anchor for "where is the money right now"
        senders = {t["from_account"] for t in revealed_tx}
        terminal_candidates = [a for a in revealed_accounts if a not in senders]
        # most recently revealed among the candidates
        terminal_account_id = None
        for acc_id in reversed(list(revealed_accounts.keys())):
            if acc_id in terminal_candidates:
                terminal_account_id = acc_id
                break

        as_of_time = tx["timestamp"]
        time_since_last_hop_hours = None
        if len(revealed_tx) >= 2:
            prev_t = _parse(revealed_tx[-2]["timestamp"])
            cur_t = _parse(revealed_tx[-1]["timestamp"])
            time_since_last_hop_hours = round((cur_t - prev_t).total_seconds() / 3600, 3)

        terminal_account = revealed_accounts.get(terminal_account_id)

        snapshot = {
            "case_id": case["case_id"],
            "snapshot_index": snapshot_idx,
            "as_of_time": as_of_time,
            "n_hops_observed": len(revealed_accounts),
            "visible_transactions": list(revealed_tx),
            "visible_accounts": list(revealed_accounts.values()),
            "terminal_account_id": terminal_account_id,
            "terminal_account_readiness": (
                terminal_account["cashout_readiness"] if terminal_account else None),
            "time_since_last_hop_hours": time_since_last_hop_hours,
            "victim_lat": case["victim_lat"],
            "victim_lon": case["victim_lon"],
            "stolen_amount": case["stolen_amount"],
            "urban": case["urban"],
            "is_final_snapshot": tx is txs[-1],
        }
        snapshot_idx += 1
        yield snapshot


def build_files(cases_path, snapshots_out, labels_out):
    n_cases = 0
    n_snapshots = 0
    with open(cases_path) as fin, \
         open(snapshots_out, "w") as fsnap, \
         open(labels_out, "w") as flabel:
        for line in fin:
            case = json.loads(line)
            n_cases += 1
            for snapshot in stream_case(case):
                fsnap.write(json.dumps(snapshot) + "\n")
                n_snapshots += 1
            flabel.write(json.dumps({
                "case_id": case["case_id"],
                "ground_truth": case["ground_truth"],
            }) + "\n")

    print(f"Processed {n_cases} cases into {n_snapshots} snapshots.")
    print(f"Snapshots (no ground truth): {snapshots_out}")
    print(f"Labels (ground truth, kept separate): {labels_out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", required=True, help="cases.jsonl from mule_chain_generator.py")
    parser.add_argument("--snapshots_out", default="snapshots.jsonl")
    parser.add_argument("--labels_out", default="labels.jsonl")
    args = parser.parse_args()
    build_files(args.cases, args.snapshots_out, args.labels_out)
