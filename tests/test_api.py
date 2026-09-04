import json
import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"


@pytest.fixture(scope="session")
def client():
    # Verify the backend server is reachable on BASE_URL
    try:
        with httpx.Client(base_url=BASE_URL, timeout=5.0) as c:
            resp = c.get("/health")
            if resp.status_code != 200:
                pytest.skip("Backend server not running on http://127.0.0.1:8000")
    except Exception:
        pytest.skip("Backend server not running on http://127.0.0.1:8000")

    with httpx.Client(base_url=BASE_URL, timeout=10.0) as c:
        yield c


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["models_loaded"] is True


def test_get_cases_no_ground_truth(client):
    response = client.get("/api/cases?limit=10")
    assert response.status_code == 200
    cases = response.json()
    assert len(cases) == 10
    for c in cases:
        assert "case_id" in c
        assert "stolen_amount" in c
        assert "urban" in c
        assert "complaint_timestamp" in c
        assert "n_total_snapshots" in c
        # Strict Rule 1: NEVER expose ground_truth
        assert "ground_truth" not in c
        assert "true_channel" not in c
        assert "true_location_id" not in c


def test_get_case_detail_no_ground_truth(client):
    cases_resp = client.get("/api/cases?limit=1")
    first_case = cases_resp.json()[0]
    cid = first_case["case_id"]

    response = client.get(f"/api/cases/{cid}")
    assert response.status_code == 200
    detail = response.json()
    assert detail["case_id"] == cid
    assert "accounts" in detail
    assert "transactions" in detail
    # Strict Rule 1: NEVER expose ground_truth
    assert "ground_truth" not in detail


def test_case_not_found(client):
    response = client.get("/api/cases/non-existent-case-id-12345")
    assert response.status_code == 404


def test_get_snapshots(client):
    cases_resp = client.get("/api/cases?limit=1")
    cid = cases_resp.json()[0]["case_id"]

    response = client.get(f"/api/cases/{cid}/snapshots")
    assert response.status_code == 200
    snapshots = response.json()
    assert len(snapshots) >= 1
    assert snapshots[0]["snapshot_index"] == 0
    # Strict Rule 1: No ground truth
    assert "ground_truth" not in snapshots[0]

    single_resp = client.get(f"/api/cases/{cid}/snapshots/0")
    assert single_resp.status_code == 200
    assert single_resp.json()["snapshot_index"] == 0


def test_predict_endpoint(client):
    cases_resp = client.get("/api/cases?limit=1")
    cid = cases_resp.json()[0]["case_id"]
    snap0 = client.get(f"/api/cases/{cid}/snapshots/0").json()

    response = client.post("/api/predict", json={
        "snapshot": snap0,
        "location_mode": "baseline"
    })
    assert response.status_code == 200
    pred = response.json()

    assert pred["case_id"] == cid
    assert pred["snapshot_index"] == 0
    assert "channel" in pred
    assert "time_window" in pred
    assert "location" in pred
    assert "confidence" in pred
    assert "supporting_signals" in pred

    # Check Channel predictions
    assert len(pred["channel"]["predictions"]) == 5
    probs_sum = sum(p["probability"] for p in pred["channel"]["predictions"])
    assert 0.99 <= probs_sum <= 1.01

    # Check Time Window (np.expm1 applied, lower <= median <= upper)
    tw = pred["time_window"]
    assert tw["lower_hours"] >= 0
    assert tw["median_hours"] >= 0
    assert tw["upper_hours"] >= tw["lower_hours"]
    assert "cashout_window_start" in tw
    assert "cashout_window_end" in tw

    # Check Confidence
    conf = pred["confidence"]
    assert conf["level"] in ["LOW", "MEDIUM", "HIGH"]
    assert 0.0 <= conf["overall_score"] <= 1.0

    # Top location candidate check
    assert len(pred["location"]["top_locations"]) == 3
    assert pred["location"]["top_locations"][0]["dist_victim_km"] > 0


def test_predict_with_none_fields_safely(client):
    cases_resp = client.get("/api/cases?limit=1")
    cid = cases_resp.json()[0]["case_id"]
    snap = client.get(f"/api/cases/{cid}/snapshots/0").json()

    # Intentionally set optional fields to None
    snap["terminal_account_readiness"] = None
    snap["time_since_last_hop_hours"] = None

    response = client.post("/api/predict", json={
        "snapshot": snap,
        "location_mode": "baseline"
    })
    assert response.status_code == 200
    pred = response.json()
    assert pred["confidence"]["level"] in ["LOW", "MEDIUM", "HIGH"]


def test_atms_endpoint(client):
    response = client.get("/api/atms?limit=5")
    assert response.status_code == 200
    atms = response.json()
    assert len(atms) == 5
    for a in atms:
        assert "id" in a
        assert "lat" in a
        assert "lon" in a


def test_models_status_endpoint(client):
    response = client.get("/api/models/status")
    assert response.status_code == 200
    data = response.json()
    assert "channel_model" in data
    assert "time_model" in data
    assert "location_model" in data
    assert data["location_model"]["production_mode"] == "baseline"
    assert "disclaimer" in data["location_model"]
