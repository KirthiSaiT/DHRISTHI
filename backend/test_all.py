"""Run: python test_all.py   (uses a temporary database; no server needed)"""
import math
import os
import random
import tempfile

os.environ["DRISHTI_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")

import forecast
import geo
import positioning
from right_of_way import Claim, resolve_zone


# ---------------- positioning ----------------
def _ranges(pos, ids, noise=0.5, rnd=None):
    rnd = rnd or random.Random(1)
    return [{"id": i, "range_m": math.dist(pos, geo.BEACONS_M[i]) + rnd.gauss(0, noise)} for i in ids]


def test_trilateration_recovers_position_within_a_metre():
    rnd = random.Random(7)
    errs = []
    for d in range(int(geo.SHADOW_D[0]), int(geo.SHADOW_D[1]), 25):
        pos = geo.point_at(d)
        gps = (pos[0] + 18, pos[1] - 15)                          # ~23 m GPS error
        fix = positioning.fuse(gps, 20.0, _ranges(pos, ["BCN-1", "BCN-2", "BCN-3"], rnd=rnd), geo.BEACONS_M)
        assert fix["source"] == "BEACON"
        errs.append(math.dist(fix["xy"], pos))
    assert sum(errs) / len(errs) < 1.5, errs


def test_two_beacons_is_not_enough():
    pos = geo.point_at(0.6 * geo.ROUTE_LEN)
    fix = positioning.fuse((pos[0] + 20, pos[1]), 20.0, _ranges(pos, ["BCN-1", "BCN-2"]), geo.BEACONS_M)
    assert fix["source"] == "GPS_DEGRADED"


def test_good_gps_is_left_alone():
    fix = positioning.fuse((5.0, 5.0), 3.0, [], geo.BEACONS_M)
    assert fix["source"] == "GPS" and fix["xy"] == (5.0, 5.0)


# ---------------- forecast ----------------
def test_forecast_predicts_rising_humidity_and_ignores_stable():
    forecast._hist.clear()
    out = None
    for i in range(20):
        out = forecast.update("k", 1000 + i, 80 + i * 0.6, 4.0 - i * 0.12)   # rising humidity, closing spread
    assert out and 0 < out["eta_s"] < 120 and out["confidence"] > 0.9
    forecast._hist.clear()
    for i in range(20):
        out = forecast.update("s", 1000 + i, 75.0, 5.0)
    assert out is None


# ---------------- right-of-way (see test_right_of_way.py for the full rule set) ----------------
def test_loaded_first():
    r = resolve_zone([Claim("B", False, 0, 1, 1), Claim("A", True, 90, 5, 5)], False)
    assert r["winner"] == "A"


# ---------------- API: security + acknowledgement + report ----------------
def test_api_flow():
    from fastapi.testclient import TestClient
    import main
    c = TestClient(main.app)
    K = {"X-Operator-Key": "demo-operator-key"}

    # protected endpoints reject anonymous callers
    assert c.post("/api/load", json={"node_id": "NODE-A", "loaded": True, "tonnes": 90}).status_code == 401
    assert c.post("/api/override", json={"action": "clear_hazard", "node_id": "NODE-A"}).status_code == 401
    assert c.get("/api/state").status_code == 401
    assert c.get("/api/report").status_code == 401

    # operator PIN login
    assert c.post("/api/operator/login", json={"pin": "0000"}).status_code == 401
    op = c.post("/api/operator/login", json={"pin": "9999"}).json()["token"]
    assert c.get("/api/state", headers={"Authorization": f"Bearer {op}"}).status_code == 200

    # dispatch a load, send telemetry with an obstacle
    assert c.post("/api/load", json={"node_id": "NODE-A", "loaded": True, "tonnes": 90, "material": "Iron ore lump"}, headers=K).json()["ok"]
    body = {"node_id": "NODE-A", "seq": 1, "temp_c": 21, "humidity_pct": 97, "motion_detected": True, "lat": 18.6421, "lon": 81.2641, "gps_acc_m": 3, "speed_kmph": 30}
    r = c.post("/api/telemetry", json=body).json()
    assert r["accepted"] and r["advised_kmph"] <= 10                     # hazard -> crawl speed advisory

    # driver only sees own truck; can acknowledge the hazard instruction
    d = c.post("/api/login", json={"driver_id": "D-101", "pin": "1234"}).json()["token"]
    H = {"Authorization": f"Bearer {d}"}
    st = c.get("/api/state", headers=H).json()
    assert [n["node_id"] for n in st["nodes"]] == ["NODE-A"] and st["stations"] == []
    inst = st["nodes"][0]["instruction"]
    assert inst["key"] == "hazard" and inst["acked_at"] is None
    assert c.post("/api/ack", json={"key": "hazard"}, headers=H).json()["ok"]
    assert c.get("/api/state", headers=H).json()["nodes"][0]["instruction"]["acked_at"] is not None
    assert c.post("/api/ack", json={"key": "hazard"}, headers={"Authorization": f"Bearer {op}"}).status_code == 401  # operators can't ack for drivers

    # operator clears it; report + replay are available to operators only
    assert c.post("/api/override", json={"action": "clear_hazard", "node_id": "NODE-A"}, headers={"Authorization": f"Bearer {op}"}).json()["ok"]
    rep = c.get("/api/report", headers={"Authorization": f"Bearer {op}"}).json()
    assert rep["hazards_raised"] >= 1 and rep["hazards_cleared"] >= 1
    assert c.get("/api/report", headers=H).status_code == 401
    assert "frames" in c.get("/api/replay?seconds=60", headers=K).json()

    # regression: a NEW obstacle after an operator cleared the old one must raise a fresh hazard
    # even if the motion flag never dropped in between
    body["seq"] = 2
    assert c.post("/api/telemetry", json=body).json()["accepted"]
    st = c.get("/api/state", headers={"Authorization": f"Bearer {op}"}).json()
    assert [n for n in st["nodes"] if n["node_id"] == "NODE-A"][0]["hazard_active"] is True

    # websocket needs a token; drivers cannot use an operator-only view
    from starlette.websockets import WebSocketDisconnect
    try:
        with c.websocket_connect("/ws") as ws:
            ws.receive_json()
        assert False, "anonymous websocket should be refused"
    except WebSocketDisconnect as e:
        assert e.code == 4401
    with c.websocket_connect(f"/ws?token={d}") as ws:
        assert [n["node_id"] for n in ws.receive_json()["data"]["nodes"]] == ["NODE-A"]


# ---------------- what-if replay ----------------
def test_whatif_is_deterministic_and_honest():
    import whatif
    a, b = whatif.compare(30, "moderate", 5), whatif.compare(30, "moderate", 5)
    assert a == b
    assert a["drishti"]["head_on_meetings"] <= a["baseline"]["head_on_meetings"]
    assert a["drishti"]["stopped_min"] <= a["baseline"]["stopped_min"]
    assert a["assumptions"] and a["insights"]
    for sev in ("light", "moderate", "heavy"):
        r = whatif.compare(20, sev, 5)
        assert r["baseline"]["tonnes"] > 0 and r["drishti"]["tonnes"] > 0


# ---------------- shared hazards + curve slot planning (through the real API) ----------------
def _tel(c, node, d, speed, motion=False, seq=[0]):
    seq[0] += 1
    lat, lon = geo.to_latlon(geo.point_at(d))
    return c.post("/api/telemetry", json={"node_id": node, "seq": seq[0], "temp_c": 24, "humidity_pct": 70, "motion_detected": motion,
                                          "lat": lat, "lon": lon, "gps_acc_m": 3.0, "speed_kmph": speed}).json()


def _reset(main):
    import right_of_way as row
    main.nodes.clear(); main.loads.clear(); main._hazard_pos.clear(); main._hz_seen.clear(); main._dir_score.clear()
    row._claims.clear(); main._instr.clear()


def test_obstacle_is_shared_with_trucks_heading_towards_it():
    from fastapi.testclient import TestClient
    import main
    c = TestClient(main.app); K = {"X-Operator-Key": "demo-operator-key"}
    _reset(main)
    for n, ld in (("NODE-A", True), ("NODE-B", False), ("NODE-C", True)):
        c.post("/api/load", json={"node_id": n, "loaded": ld, "tonnes": 90 if ld else 0}, headers=K)
    # A loaded, heading to the crusher (+); it is at d=600. C heading the same way but already PAST the obstacle (d=1100).
    for d in (590, 600):
        _tel(c, "NODE-A", d, 20)
    for d in (1090, 1100):
        _tel(c, "NODE-C", d, 20)
    # B (empty, heading towards the pit) raises an obstacle at d=900
    for d in (910, 900):
        _tel(c, "NODE-B", d, 20, motion=(d == 900))
    _tel(c, "NODE-A", 610, 20)
    _tel(c, "NODE-C", 1110, 20)
    a, cc = main.nodes["NODE-A"], main.nodes["NODE-C"]
    assert a["hazards_ahead"] and a["hazards_ahead"][0]["node_id"] == "NODE-B"
    assert 250 <= a["hazards_ahead"][0]["distance_m"] <= 320          # roughly 900 - 610
    assert cc["hazards_ahead"] == []                                   # C already passed it, moving away
    assert not main.nodes["NODE-B"]["hazards_ahead"]                   # a truck is not warned about its own obstacle
    # once cleared, nobody is warned any more
    op = {"X-Operator-Key": "demo-operator-key"}
    assert c.post("/api/override", json={"action": "clear_hazard", "node_id": "NODE-B"}, headers=op).json()["ok"]
    _tel(c, "NODE-A", 620, 20)
    assert main.nodes["NODE-A"]["hazards_ahead"] == []


def test_curve_slot_planning_eases_off_the_lower_priority_truck():
    from fastapi.testclient import TestClient
    import main
    c = TestClient(main.app); K = {"X-Operator-Key": "demo-operator-key"}
    _reset(main)
    c.post("/api/load", json={"node_id": "NODE-A", "loaded": True, "tonnes": 90}, headers=K)
    c.post("/api/load", json={"node_id": "NODE-B", "loaded": False}, headers=K)
    ca, cb = geo.CURVE_D - 450, geo.CURVE_D + 450
    for k in range(2):
        _tel(c, "NODE-A", ca + k * 5, 20)
        rb = _tel(c, "NODE-B", cb - k * 5, 30)
    a, b = main.nodes["NODE-A"], main.nodes["NODE-B"]
    assert a["slot"] is None                                           # the loaded truck keeps its speed
    assert b["slot"] and b["slot"]["winner"] == "NODE-A"               # the empty truck eases off
    assert b["slot"]["target_kmph"] < 30 and b["advised_kmph"] <= b["slot"]["target_kmph"]
    assert rb["advised_kmph"] == b["advised_kmph"]                     # the device is told the eased-off speed
    # trucks that would never meet (same direction) get no slot advice
    _reset(main)
    for n in ("NODE-A", "NODE-C"):
        c.post("/api/load", json={"node_id": n, "loaded": True, "tonnes": 90}, headers=K)
    for k in range(2):
        _tel(c, "NODE-A", ca + k * 5, 20)
        _tel(c, "NODE-C", ca - 200 + k * 5, 20)
    assert main.nodes["NODE-C"]["slot"] is None and main.nodes["NODE-A"]["slot"] is None


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f()
            print("ok", k)
