"""
Prepare ATM Locations from RBI Banking Outlet & ATM Export
------------------------------------------------------------
Your raw RBI/DBIE export has District/Sub District/Center/Address as TEXT,
not coordinates. This script:
  1. Filters the export down to actual ATM rows (Sub Type == "ATMs")
  2. Joins each row to a District-level lat/lon lookup table
  3. Adds a small random jitter per ATM (so multiple ATMs in the same
     district don't all collapse onto one point) -- roughly matches
     "district ~= zone" granularity from your Zone -> Cluster -> ATM design
  4. Falls back to a state-level centroid if a district isn't found in
     the lookup table, so no rows get silently dropped
  5. Writes atm_locations.csv with columns: id,lat,lon,bank
     (this is exactly what mule_chain_generator.py --atm_csv expects)

You need TWO input files:
  --atm_export   : your raw RBI Banking Outlet & ATM export (the file you showed)
  --district_geo : a District,State,Latitude,Longitude CSV, e.g. download from
                    https://www.kaggle.com/datasets/sirpunch/district-level-longitude-latitude-for-india

Usage:
    python prepare_atm_dataset.py --atm_export atm_export.csv \
        --district_geo district_lat_long.csv --out atm_locations.csv
"""

import argparse
import random
import re

import pandas as pd

# Rough state/UT centroids used ONLY as a fallback when a district isn't
# found in the district_geo lookup file -- keeps every ATM row usable
# instead of silently dropping unmatched districts.
STATE_CENTROID_FALLBACK = {
    "andhra pradesh": (15.9129, 79.7400), "arunachal pradesh": (28.2180, 94.7278),
    "assam": (26.2006, 92.9376), "bihar": (25.0961, 85.3131),
    "chhattisgarh": (21.2787, 81.8661), "goa": (15.2993, 74.1240),
    "gujarat": (22.2587, 71.1924), "haryana": (29.0588, 76.0856),
    "himachal pradesh": (31.1048, 77.1734), "jharkhand": (23.6102, 85.2799),
    "karnataka": (15.3173, 75.7139), "kerala": (10.8505, 76.2711),
    "madhya pradesh": (22.9734, 78.6569), "maharashtra": (19.7515, 75.7139),
    "manipur": (24.6637, 93.9063), "meghalaya": (25.4670, 91.3662),
    "mizoram": (23.1645, 92.9376), "nagaland": (26.1584, 94.5624),
    "odisha": (20.9517, 85.0985), "punjab": (31.1471, 75.3412),
    "rajasthan": (27.0238, 74.2179), "sikkim": (27.5330, 88.5122),
    "tamil nadu": (11.1271, 78.6569), "telangana": (18.1124, 79.0193),
    "tripura": (23.9408, 91.9882), "uttar pradesh": (26.8467, 80.9462),
    "uttarakhand": (30.0668, 79.0193), "west bengal": (22.9868, 87.8550),
    "delhi": (28.7041, 77.1025), "jammu and kashmir": (33.7782, 76.5762),
    "ladakh": (34.1526, 77.5771), "puducherry": (11.9416, 79.8083),
    "chandigarh": (30.7333, 76.7794),
}


def norm(s):
    if pd.isna(s):
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def find_col(columns, *keywords):
    """Fuzzy-match a column name from the raw export by keyword, since
    exact header text/truncation can vary between RBI export batches."""
    for col in columns:
        c = norm(col)
        if all(kw in c for kw in keywords):
            return col
    return None


def read_table(path):
    """Reads .csv or .xlsx/.xls transparently based on file extension.
    For CSVs, tries multiple encodings since RBI/govt exports and
    Excel-saved CSVs are frequently NOT plain UTF-8 (common culprits:
    Windows-1252/Latin-1, or a UTF-8 file with a BOM)."""
    if str(path).lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(path)

    encodings_to_try = ["utf-8", "utf-8-sig", "cp1252", "latin1"]
    last_err = None
    for enc in encodings_to_try:
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError as e:
            last_err = e
            continue
    raise last_err


def load_district_geo(path):
    df = read_table(path)
    dcol = find_col(df.columns, "district")
    scol = find_col(df.columns, "state")
    latcol = find_col(df.columns, "lat")
    loncol = find_col(df.columns, "lon") or find_col(df.columns, "long")
    lookup = {}
    for _, row in df.iterrows():
        key = (norm(row[dcol]), norm(row[scol]))
        lookup[key] = (float(row[latcol]), float(row[loncol]))
    return lookup


def geocode_row(district, state, district_lookup):
    key = (norm(district), norm(state))
    if key in district_lookup:
        return district_lookup[key]
    # fallback: fuzzy partial match on district name within the same state
    for (d, s), coord in district_lookup.items():
        if s == norm(state) and (d in key[0] or key[0] in d):
            return coord
    # final fallback: state centroid
    return STATE_CENTROID_FALLBACK.get(norm(state), (22.0, 79.0))  # India centroid as last resort


def main(atm_export_path, district_geo_path, out_path, jitter_km=3.0):
    df = read_table(atm_export_path)

    subtype_col = find_col(df.columns, "sub", "type")
    district_col = find_col(df.columns, "district") 
    # avoid matching "sub district" when looking for the plain district column
    district_col = next((c for c in df.columns if norm(c) == "district"), district_col)
    state_col = find_col(df.columns, "state")
    bank_col = find_col(df.columns, "bank", "name")
    ifsc_col = find_col(df.columns, "ifsc")

    if subtype_col:
        atm_rows = df[df[subtype_col].astype(str).str.strip().str.lower() == "atms"].copy()
    else:
        print("WARNING: could not find a 'Sub Type' column -- using all rows.")
        atm_rows = df.copy()

    print(f"Loaded {len(df)} total rows, {len(atm_rows)} ATM rows after filtering.")

    district_lookup = load_district_geo(district_geo_path)

    random.seed(42)
    out_rows = []
    for i, row in atm_rows.reset_index(drop=True).iterrows():
        lat, lon = geocode_row(row[district_col], row[state_col], district_lookup)
        # jitter so co-located ATMs don't stack exactly -- ~1 degree lat ~= 111km
        jitter_deg = jitter_km / 111.0
        lat_j = lat + random.uniform(-jitter_deg, jitter_deg)
        lon_j = lon + random.uniform(-jitter_deg, jitter_deg)
        out_rows.append({
            "id": row[ifsc_col] if ifsc_col and pd.notna(row.get(ifsc_col)) else f"ATM_{i}",
            "lat": round(lat_j, 6),
            "lon": round(lon_j, 6),
            "bank": row[bank_col] if bank_col else "unknown",
        })

    out_df = pd.DataFrame(out_rows)
    out_df.to_csv(out_path, index=False)
    print(f"Wrote {len(out_df)} geocoded ATM locations to {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--atm_export", required=True, help="Raw RBI Banking Outlet & ATM export CSV")
    parser.add_argument("--district_geo", required=True, help="District,State,Latitude,Longitude CSV")
    parser.add_argument("--out", default="atm_locations.csv")
    parser.add_argument("--jitter_km", type=float, default=3.0)
    args = parser.parse_args()
    main(args.atm_export, args.district_geo, args.out, args.jitter_km)