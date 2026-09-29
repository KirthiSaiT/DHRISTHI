"""
DRISHTI backend — FastAPI.

One process holds the live state of every truck node and weather station,
scores fog risk + forecasts it, fixes position when GPS is shadowed, decides
right-of-way (loaded truck first), advises speed, warns of nearby trucks,
tracks driver acknowledgements, persists history to SQLite, and pushes
everything to connected apps over a WebSocket.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000
"""
import math
import os
import time
from collections import deque
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import db
import driver_auth
import fleet
import forecast
import geo
import positioning
import right_of_way
import security
import whatif
from fog_logic import compute_fog_risk

app = FastAPI(title="DRISHTI Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])  # demo only — lock down for real use

db.init()

# ---------------------------------------------------------------------------
# Live state (history lives in SQLite)
# ---------------------------------------------------------------------------
nodes: dict[str, dict] = {}
stations: dict[str, dict] = {}
alerts: deque = deque(db.recent_alerts(60), maxlen=200)   # newest first
auth_log: deque = deque(maxlen=100)
loads: dict[str, dict] = {}
_last_row_sig: dict[str, tuple] = {}
_row_logged: dict[tuple, float] = {}       # (zone, loser, winner, action) -> when last announced/logged
ROW_REPEAT_S = 30                           # don't re-announce the same decision more often than this
_instr: dict[str, dict] = {}                 # node_id -> current driver instruction {key,text,since,acked_at}
_prev_overspeed: dict[str, bool] = {}
_prev_dist: dict[tuple, float] = {}
_hazard_pos: dict[str, dict] = {}            # node_id -> where its obstacle was raised (route distance, lat, lon)
_dir_score: dict[str, float] = {}            # node_id -> smoothed direction of travel (+ towards crusher, - towards pit)
_hz_seen: set = set()                        # (hazard node, receiving node) pairs already announced
_slot_last: dict[tuple, float] = {}          # (loser, winner) -> when a speed-nudge was last announced
SLOT_HORIZON_M = 600                         # start planning the curve this far out
SLOT_MIN_KMPH = 8
HAZARD_SHARE_M = 500                         # warn trucks heading towards an obstacle from this far away
_prox_last: dict[tuple, float] = {}
failed_auth_streak: dict[str, int] = {}
demo = {"fog": False, "obstacle_node": None}
_auth_id = 0
RISK_COLOR = {"LOW": "#34D399", "MEDIUM": "#FBBF24", "HIGH": "#F87171"}
SPEED_LIMIT = {"LOW": 40, "MEDIUM": 30, "HIGH": 15}    # km/h advisory by fog level
BEACON_XY = geo.BEACONS_M


def _now() -> float:
    return time.time()


def _push_alert(text: str, level: str, color: str, node_id: Optional[str] = None):
    aid = db.log_alert(text, level, color, node_id)
    alerts.appendleft({"id": aid, "text": text, "level": level, "color": color, "node_id": node_id, "time": time.strftime("%H:%M:%S")})


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def _claims(authorization: Optional[str]) -> Optional[dict]:
    return driver_auth.verify_token((authorization or "").removeprefix("Bearer ").strip())


def require_operator(authorization: Optional[str], x_operator_key: Optional[str] = None):
    if driver_auth.key_ok(x_operator_key):
        return
    c = _claims(authorization)
    if not c or c.get("role") != "operator":
        raise HTTPException(status_code=401, detail="operator sign-in required")


# ---------------------------------------------------------------------------
# Snapshot + WebSocket fan-out (drivers see only their truck; operators see all)
# ---------------------------------------------------------------------------
def segment_risks() -> list[str]:
    return [stations.get(s["station"], {}).get("risk", {}).get("risk_level", "LOW") for s in geo.SEGMENTS]


def snapshot(ident: dict) -> dict:
    if ident.get("role") == "operator":
        return {"nodes": list(nodes.values()), "stations": list(stations.values()), "segments": segment_risks(),
                "hazards": [{"node_id": k, "fleet_id": fleet.vehicle_info(k)["fleet_id"], "lat": v["lat"], "lon": v["lon"]} for k, v in _hazard_pos.items()],
                "alerts": list(alerts)[:40], "auth_log": list(auth_log)[:20], "demo": demo}
    node = ident["node"]
    return {"nodes": [n for n in nodes.values() if n["node_id"] == node], "stations": [], "segments": segment_risks(),
            "alerts": [a for a in alerts if a.get("node_id") in (None, node)][:30], "auth_log": [], "demo": {}}


class ConnectionManager:
    def __init__(self):
        self.active: list[tuple[WebSocket, dict]] = []

    async def connect(self, ws: WebSocket, ident: dict):
        await ws.accept()
        self.active.append((ws, ident))
        await ws.send_json({"type": "snapshot", "data": snapshot(ident)})

    def disconnect(self, ws: WebSocket):
        self.active = [(w, i) for (w, i) in self.active if w is not ws]

    async def broadcast(self):
        dead = []
        for ws, ident in list(self.active):
            try:
                await ws.send_json({"type": "snapshot", "data": snapshot(ident)})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class BeaconRange(BaseModel):
    id: str
    range_m: float


class TelemetryIn(BaseModel):
    node_id: str
    seq: int = 0
    temp_c: float
    humidity_pct: float
    motion_detected: bool = False
    lat: Optional[float] = None            # raw GPS
    lon: Optional[float] = None
    gps_acc_m: Optional[float] = None      # receiver's own accuracy estimate
    beacon_ranges: Optional[list[BeaconRange]] = None
    battery_pct: Optional[float] = None
    speed_kmph: Optional[float] = None
    zone: Optional[str] = None
    signature: Optional[str] = None


class StationIn(BaseModel):
    station_id: str
    temp_c: float
    humidity_pct: float
    battery_pct: Optional[float] = None


class AuthEventIn(BaseModel):
    node_id: str
    driver_id: str
    method: str
    success: bool


class OverrideIn(BaseModel):
    action: str
    node_id: Optional[str] = None


class LoginIn(BaseModel):
    driver_id: str
    pin: str


class OperatorLoginIn(BaseModel):
    pin: str


class LoadIn(BaseModel):
    node_id: str
    loaded: bool
    tonnes: float = 0
    material: Optional[str] = None
    origin: str = "Pit 14"
    destination: str = "Primary crusher"


class AckIn(BaseModel):
    key: str


class DemoIn(BaseModel):
    scenario: str            # fog_on | fog_off | obstacle | reset
    node_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers: distance, advisory, instruction
# ---------------------------------------------------------------------------
def _haversine_m(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def _advised_speed(level: str, loaded: bool, hazard: bool) -> int:
    v = SPEED_LIMIT.get(level, 40) * (0.85 if loaded else 1.0)
    if hazard:
        v = min(v, 10)
    return int(round(v))


def _curve_window(route_d: float, direction: int, speed_kmph: float):
    """(metres to the curve entrance, seconds until entering, seconds until clear) or None if already past it."""
    v = max(speed_kmph or 0, SLOT_MIN_KMPH) / 3.6
    R = geo.CURVE_RADIUS_M
    if direction > 0:
        dist_in, dist_out = geo.CURVE_D - R - route_d, geo.CURVE_D + R - route_d
    else:
        dist_in, dist_out = route_d - (geo.CURVE_D + R), route_d - (geo.CURVE_D - R)
    if dist_out <= 0:
        return None
    return dist_in, max(0.0, dist_in) / v, dist_out / v


def _update_shared_hazards(node_id: str):
    """V2V: tell every truck heading towards someone else's obstacle how far away it is."""
    me = nodes[node_id]
    me["hazards_ahead"] = []
    if me.get("route_d") is None:
        return
    for hid, hp in list(_hazard_pos.items()):
        if hid == node_id or hp.get("route_d") is None:
            continue
        gap = (hp["route_d"] - me["route_d"]) * me["travel_dir"]      # positive: the obstacle is in front of me
        dist = abs(hp["route_d"] - me["route_d"])
        if gap > 0 and dist <= HAZARD_SHARE_M:
            me["hazards_ahead"].append({"node_id": hid, "fleet_id": fleet.vehicle_info(hid)["fleet_id"], "distance_m": round(dist), "lat": hp["lat"], "lon": hp["lon"]})
            if (hid, node_id) not in _hz_seen:
                _hz_seen.add((hid, node_id))
                _push_alert(f"Obstacle reported by {fleet.vehicle_info(hid)['fleet_id']} is {round(dist)} m ahead of {fleet.vehicle_info(node_id)['fleet_id']}", "warning", "#FBBF24", node_id)
                db.log_event("hazard_shared", node_id, source=hid, distance_m=round(dist))
    me["hazards_ahead"].sort(key=lambda h: h["distance_m"])


def _update_slot(node_id: str):
    """Plan the blind curve ahead of time: if I would meet an oncoming truck in it and I have lower priority,
    ease off so it clears first. If that is not possible the right-of-way hold takes over."""
    me = nodes[node_id]
    me["slot"] = None
    if me.get("route_d") is None or me.get("travel_dir") is None or me["pos_src"] == "GPS_DEGRADED":
        return
    mine = _curve_window(me["route_d"], me["travel_dir"], me.get("speed_kmph"))
    if mine is None or mine[0] <= 0 or mine[0] > SLOT_HORIZON_M:
        return
    my_key = (0 if me["load"]["state"] == "LOADED" else 1, -(me["load"].get("tonnes") or 0), mine[1], node_id)
    best = None
    for oid, o in nodes.items():
        if oid == node_id or o.get("route_d") is None or o.get("travel_dir") in (None, me["travel_dir"]) or _now() - o["last_seen"] > 10:
            continue
        if (o.get("row") or {}).get("action") == "reroute":
            continue                                                  # it is leaving the road for the bypass
        theirs = _curve_window(o["route_d"], o["travel_dir"], o.get("speed_kmph"))
        if theirs is None:
            continue
        if not (mine[1] < theirs[2] + right_of_way.MARGIN_S and theirs[1] < mine[2] + right_of_way.MARGIN_S):
            continue                                                  # already spaced apart in time
        their_key = (0 if o["load"]["state"] == "LOADED" else 1, -(o["load"].get("tonnes") or 0), theirs[1], oid)
        if my_key < their_key:
            continue                                                  # I have priority: the other truck adapts
        target = mine[0] / (theirs[2] + right_of_way.MARGIN_S) * 3.6
        if target >= SLOT_MIN_KMPH and (best is None or target < best["target_kmph"]):
            best = {"winner": oid, "winner_fleet": fleet.vehicle_info(oid)["fleet_id"], "target_kmph": max(SLOT_MIN_KMPH, int(target)),
                    "curve_in_s": round(mine[1]), "gap_s": right_of_way.MARGIN_S}
    if not best:
        return
    me["slot"] = best
    me["advised_kmph"] = min(me["advised_kmph"], best["target_kmph"])
    key = (node_id, best["winner"])
    if _now() - _slot_last.get(key, 0) > 60:
        _slot_last[key] = _now()
        _push_alert(f"Curve planned: {me['vehicle']['fleet_id']} eases to {best['target_kmph']} km/h so {best['winner_fleet']} clears the curve first", "info", "#22C3B6", node_id)
        db.log_event("slot_advice", node_id, winner=best["winner"], target_kmph=best["target_kmph"])


def _update_proximity(node_id: str):
    me = nodes[node_id]
    best = None
    for oid, o in nodes.items():
        if oid == node_id or o.get("lat") is None or _now() - o["last_seen"] > 10:
            continue
        d = _haversine_m((me["lat"], me["lon"]), (o["lat"], o["lon"]))
        if best is None or d < best[1]:
            best = (oid, d)
    me["nearest"] = None
    if not best:
        return
    oid, d = best
    key = tuple(sorted((node_id, oid)))
    prev = _prev_dist.get((node_id, oid))
    closing = prev is not None and d < prev - 0.5
    _prev_dist[(node_id, oid)] = d
    me["nearest"] = {"node_id": oid, "fleet_id": nodes[oid]["vehicle"]["fleet_id"], "distance_m": round(d), "closing": closing}
    if d < 90 and closing and _now() - _prox_last.get(key, 0) > 20:
        _prox_last[key] = _now()
        _push_alert(f"Proximity: {node_id} and {oid} are {round(d)} m apart and closing", "warning", "#FBBF24", node_id)
        db.log_event("proximity", node_id, other=oid, distance_m=round(d))


def _update_instructions():
    for nid, n in nodes.items():
        key = text = None
        if n.get("hazard_active"):
            key, text = "hazard", "Obstacle ahead — reduce speed"
        elif n.get("row") and n["row"]["decision"] == "yield":
            key, text = f"yield:{n['row']['winner']}:{n['row']['action']}", n["row"]["action_text"]
        cur = _instr.get(nid)
        if key is None:
            _instr.pop(nid, None)
            n["instruction"] = None
        elif cur and cur["key"] == key:
            n["instruction"] = cur
        else:
            cur = {"key": key, "text": text, "since": _now(), "acked_at": None}
            _instr[nid] = cur
            n["instruction"] = cur


def _recompute_right_of_way():
    fog_high = {n["node_id"] for n in nodes.values() if n.get("risk", {}).get("risk_level") == "HIGH"}
    resolutions = right_of_way.resolve_all(_now(), fog_high)
    for n in nodes.values():
        n["right_of_way"] = None
        n["row"] = None
    for zone, res in resolutions.items():
        for node_id, v in res["verdicts"].items():
            if node_id in nodes:
                nodes[node_id]["right_of_way"] = v["decision"]
                nodes[node_id]["row"] = {**v, "zone": zone}
        losers = tuple(sorted(k for k, v in res["verdicts"].items() if v["decision"] == "yield"))
        sig = (res["winner"], losers)
        if losers and _last_row_sig.get(zone) != sig:
            fresh = []
            for ln in losers:
                lv = res["verdicts"][ln]
                key = (zone, ln, res["winner"], lv["action"])
                if _now() - _row_logged.get(key, 0) > ROW_REPEAT_S:
                    _row_logged[key] = _now()
                    fresh.append(ln)
                    db.log_event("row", ln, zone=zone, winner=res["winner"], rule=lv["rule"], action=lv["action"])
                    if lv["action"] == "reroute":
                        db.log_event("reroute", ln, zone=zone)
            if fresh:
                v = res["verdicts"][fresh[0]]
                _push_alert(f"Right-of-way at {zone}: {res['winner']} goes first ({v['reason']}). {', '.join(fresh)}: {v['action_text']}", "warning", "#FBBF24")
        _last_row_sig[zone] = sig
    for zone in [z for z in _last_row_sig if z not in resolutions]:
        del _last_row_sig[zone]
    _update_instructions()


# ---------------------------------------------------------------------------
# Device ingestion (trucks, weather stations)
# ---------------------------------------------------------------------------
@app.post("/api/telemetry")
async def post_telemetry(t: TelemetryIn):
    ok, reason = security.verify(t.node_id, t.seq, t.temp_c, t.humidity_pct, t.motion_detected, t.signature)
    if not ok:
        _push_alert(f"REJECTED reading from {t.node_id} — {reason}", "danger", "#F87171", t.node_id)
        await manager.broadcast()
        return {"accepted": False, "reason": reason}

    risk = compute_fog_risk(t.node_id, t.temp_c, t.humidity_pct)
    prev = nodes.get(t.node_id, {})
    prev_level = prev.get("risk", {}).get("risk_level")

    # --- position: GPS, or beacon trilateration when GPS is shadowed ---
    pos = {"source": None, "err_m": None}
    lat, lon, raw = t.lat, t.lon, None
    if t.lat is not None and t.lon is not None:
        raw = [t.lat, t.lon]
        fix = positioning.fuse(geo.to_local(t.lat, t.lon), t.gps_acc_m, [r.model_dump() for r in (t.beacon_ranges or [])], BEACON_XY)
        lat, lon = geo.to_latlon(fix["xy"])
        pos = {"source": fix["source"], "err_m": fix["err_m"]}
        if fix["source"] == "BEACON" and prev.get("pos_src") != "BEACON":
            _push_alert(f"{t.node_id} — GPS shadowed (±{t.gps_acc_m:.0f} m); position corrected from {len(t.beacon_ranges or [])} beacons", "info", "#22C3B6", t.node_id)
            db.log_event("beacon_fix", t.node_id, gps_acc_m=t.gps_acc_m)
        elif fix["source"] == "GPS_DEGRADED" and prev.get("pos_src") != "GPS_DEGRADED":
            _push_alert(f"{t.node_id} — GPS shadowed and fewer than 3 beacons in range: position unreliable", "warning", "#FBBF24", t.node_id)

    load = loads.setdefault(t.node_id, fleet.default_load(t.node_id))
    loaded = load["state"] == "LOADED"

    # --- where on the road, and which way is it heading? (snap to the route; smooth the direction) ---
    route_d = travel_dir = None
    if lat is not None:
        route_d, _off = geo.project_route(lat, lon)
        score = _dir_score.get(t.node_id, 1.0 if loaded else -1.0)
        pd = prev.get("route_d")
        if pd is not None and abs(route_d - pd) >= 1:
            score = 0.7 * score + 0.3 * (1 if route_d > pd else -1)
        _dir_score[t.node_id] = score
        travel_dir = 1 if score >= 0 else -1

    hazard = prev.get("hazard_active", False)
    if t.motion_detected and not hazard:
        hazard = True
        _push_alert(f"{t.node_id} — obstacle detected (motion trigger)", "danger", "#F87171", t.node_id)
        db.log_event("hazard_raised", t.node_id)
        if route_d is not None:
            _hazard_pos[t.node_id] = {"route_d": route_d, "lat": lat, "lon": lon}
    if not hazard:
        _hazard_pos.pop(t.node_id, None)

    advised = _advised_speed(risk["risk_level"], loaded, hazard)

    nodes[t.node_id] = node_state = {
        "node_id": t.node_id, "temp_c": t.temp_c, "humidity_pct": t.humidity_pct, "motion_detected": t.motion_detected,
        "lat": lat, "lon": lon, "raw_gps": raw, "pos_src": pos["source"], "pos_err_m": pos["err_m"],
        "battery_pct": t.battery_pct, "speed_kmph": t.speed_kmph, "advised_kmph": advised, "overspeed": False,
        "route_d": route_d, "travel_dir": travel_dir, "hazards_ahead": [], "slot": None,
        "vehicle": fleet.vehicle_info(t.node_id), "driver": fleet.driver_info(t.node_id), "load": load,
        "risk": risk, "forecast": forecast.update(t.node_id, _now(), t.humidity_pct, risk["dew_point_spread_c"]),
        "hazard_active": hazard, "signed": t.signature is not None, "last_seen": _now(),
        "nearest": None, "right_of_way": None, "row": None, "instruction": None,
    }

    _update_shared_hazards(t.node_id)
    _update_slot(t.node_id)
    advised = node_state["advised_kmph"]
    over = t.speed_kmph is not None and t.speed_kmph > advised + 3
    node_state["overspeed"] = over
    if over and not _prev_overspeed.get(t.node_id):
        _push_alert(f"{t.node_id} — over advised speed ({t.speed_kmph:g} vs {advised} km/h)", "warning", "#FBBF24", t.node_id)
        db.log_event("overspeed", t.node_id, speed=t.speed_kmph, advised=advised)
    _prev_overspeed[t.node_id] = over

    if risk["risk_level"] != prev_level:
        level = "info" if risk["risk_level"] == "LOW" else ("warning" if risk["risk_level"] == "MEDIUM" else "danger")
        _push_alert(f"{t.node_id} — fog risk changed to {risk['risk_level']}", level, RISK_COLOR[risk["risk_level"]], t.node_id)

    if lat is not None:
        db.log_position(t.node_id, lat, lon, risk["risk_level"], load["state"], load.get("tonnes") or 0, hazard, pos["source"], t.speed_kmph)
        _update_proximity(t.node_id)

    if t.zone:
        w = _curve_window(route_d, travel_dir, t.speed_kmph) if route_d is not None else None
        right_of_way.register(t.zone, t.node_id, loaded, load.get("tonnes") or 0, _now(), travel_dir, w[1] if w else None, w[2] if w else None)
    _recompute_right_of_way()
    await manager.broadcast()

    resp = {"accepted": True, "risk": risk, "right_of_way": node_state.get("right_of_way"), "row": node_state.get("row"),
            "advised_kmph": advised, "demo": {"fog": demo["fog"], "obstacle": False}}
    if demo["obstacle_node"] == t.node_id:
        resp["demo"]["obstacle"] = True
        demo["obstacle_node"] = None
    return resp


@app.post("/api/station")
async def post_station(s: StationIn):
    meta = geo.STATIONS.get(s.station_id)
    if not meta:
        raise HTTPException(status_code=404, detail="unknown station")
    risk = compute_fog_risk(s.station_id, s.temp_c, s.humidity_pct)
    prev = stations.get(s.station_id, {})
    fc = forecast.update(s.station_id, _now(), s.humidity_pct, risk["dew_point_spread_c"])
    stations[s.station_id] = {"station_id": s.station_id, "name": meta["name"], "pos": meta["pos"], "temp_c": s.temp_c,
                              "humidity_pct": s.humidity_pct, "battery_pct": s.battery_pct, "risk": risk, "forecast": fc, "last_seen": _now()}
    db.log_station(s.station_id, risk["risk_level"], s.humidity_pct, s.temp_c)
    if risk["risk_level"] != prev.get("risk", {}).get("risk_level"):
        lv = risk["risk_level"]
        _push_alert(f"Station {meta['name']} — fog risk {lv}", "info" if lv == "LOW" else "warning" if lv == "MEDIUM" else "danger", RISK_COLOR[lv])
    if fc and fc["eta_s"] < 300 and not (prev.get("forecast")):
        _push_alert(f"Forecast: dense fog at {meta['name']} in ~{max(1, round(fc['eta_s'] / 60))} min — reroute before trucks arrive", "warning", "#FBBF24")
    await manager.broadcast()
    return {"accepted": True, "demo": {"fog": demo["fog"]}}


@app.post("/api/auth")
async def post_auth(a: AuthEventIn):
    global _auth_id
    _auth_id += 1
    auth_log.appendleft({"id": _auth_id, "driver_id": a.driver_id, "node_id": a.node_id, "method": a.method, "success": a.success, "time": time.strftime("%H:%M:%S")})
    if a.success:
        failed_auth_streak[a.node_id] = 0
        _push_alert(f"{a.driver_id} authenticated via {a.method} — {a.node_id}", "info", "#22C3B6", a.node_id)
    else:
        failed_auth_streak[a.node_id] = failed_auth_streak.get(a.node_id, 0) + 1
        _push_alert(f"Failed {a.method} attempt on {a.node_id}", "warning", "#FBBF24", a.node_id)
        if failed_auth_streak[a.node_id] >= 3:
            _push_alert(f"SECURITY: {failed_auth_streak[a.node_id]} consecutive failed logins on {a.node_id} — possible tailgating/brute force", "danger", "#F87171", a.node_id)
    await manager.broadcast()
    return {"ok": True}


# ---------------------------------------------------------------------------
# People: driver + operator login, acknowledgement
# ---------------------------------------------------------------------------
@app.get("/api/drivers")
def get_drivers():
    return driver_auth.public_roster()


@app.post("/api/login")
async def post_login(body: LoginIn):
    global _auth_id
    d, reason = driver_auth.login(body.driver_id.strip().upper(), body.pin)
    node_id = d["node_id"] if d else "-"
    _auth_id += 1
    auth_log.appendleft({"id": _auth_id, "driver_id": body.driver_id, "node_id": node_id, "method": "pin", "success": d is not None, "time": time.strftime("%H:%M:%S")})
    if d:
        failed_auth_streak[node_id] = 0
        _push_alert(f"{d['name']} signed in — {node_id}", "info", "#22C3B6", node_id)
    else:
        _push_alert(f"Failed driver login for {body.driver_id} — {reason}", "warning", "#FBBF24")
    await manager.broadcast()
    if not d:
        raise HTTPException(status_code=401, detail=reason)
    return {"token": driver_auth.issue_token(d), "driver": {"driver_id": d["driver_id"], "name": d["name"], "node_id": d["node_id"]}}


@app.post("/api/operator/login")
def post_operator_login(body: OperatorLoginIn):
    ok, reason = driver_auth.operator_login(body.pin)
    if not ok:
        _push_alert(f"Failed operator sign-in — {reason}", "warning", "#FBBF24")
        raise HTTPException(status_code=401, detail=reason)
    return {"token": driver_auth.issue_operator_token()}


@app.get("/api/me")
def get_me(authorization: Optional[str] = Header(None)):
    c = _claims(authorization)
    if not c:
        raise HTTPException(status_code=401, detail="invalid or expired session")
    return {"role": c.get("role", "driver"), "driver_id": c.get("sub"), "name": c.get("name"), "node_id": c.get("node")}


@app.post("/api/ack")
async def post_ack(a: AckIn, authorization: Optional[str] = Header(None)):
    c = _claims(authorization)
    if not c or c.get("role") != "driver":
        raise HTTPException(status_code=401, detail="driver sign-in required")
    cur = _instr.get(c["node"])
    if not cur or cur["key"] != a.key:
        return {"ok": False, "reason": "instruction no longer current"}
    if cur["acked_at"] is None:
        cur["acked_at"] = _now()
        db.log_event("ack", c["node"], key=a.key, seconds=round(cur["acked_at"] - cur["since"], 1))
        await manager.broadcast()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Operator actions (protected)
# ---------------------------------------------------------------------------
@app.post("/api/override")
async def post_override(o: OverrideIn, authorization: Optional[str] = Header(None), x_operator_key: Optional[str] = Header(None)):
    require_operator(authorization, x_operator_key)
    if o.action == "clear_hazard" and o.node_id in nodes:
        nodes[o.node_id]["hazard_active"] = False
        _hazard_pos.pop(o.node_id, None)
        _hz_seen.difference_update({k for k in _hz_seen if k[0] == o.node_id})
        _push_alert(f"Hazard cleared on {o.node_id} by operator", "info", "#8B98A5", o.node_id)
        db.log_event("hazard_cleared", o.node_id)
        _update_instructions()
    elif o.action == "simulate_reroute":
        _push_alert("What-if: reroute simulated — projected delay avoided vs. no-action baseline", "info", "#22C3B6", o.node_id)
    else:
        return {"ok": False, "reason": "unknown action or missing node_id"}
    await manager.broadcast()
    return {"ok": True}


@app.post("/api/load")
async def post_load(l: LoadIn, authorization: Optional[str] = Header(None), x_operator_key: Optional[str] = Header(None)):
    """Dispatch / weighbridge sets what a truck is carrying."""
    require_operator(authorization, x_operator_key)
    old = loads.get(l.node_id)
    new = {"state": "LOADED" if l.loaded else "EMPTY", "tonnes": round(l.tonnes, 1) if l.loaded else 0,
           "material": l.material if l.loaded else None, "origin": l.origin, "destination": l.destination}
    if old and old["state"] == "LOADED" and not l.loaded:
        db.log_event("delivery", l.node_id, tonnes=old.get("tonnes", 0), material=old.get("material"))
    elif l.loaded and (not old or old["state"] != "LOADED"):
        db.log_event("loaded", l.node_id, tonnes=new["tonnes"], material=new["material"])
    loads[l.node_id] = new
    if l.node_id in nodes:
        nodes[l.node_id]["load"] = new
    await manager.broadcast()
    return {"ok": True}


@app.post("/api/demo")
async def post_demo(d: DemoIn, authorization: Optional[str] = Header(None), x_operator_key: Optional[str] = Header(None)):
    """Scripted scenarios for demos; the simulator obeys them via its telemetry replies."""
    require_operator(authorization, x_operator_key)
    if d.scenario == "fog_on":
        demo["fog"] = True
        _push_alert("DEMO: dense fog forced on all sensors", "warning", "#FBBF24")
    elif d.scenario == "fog_off":
        demo["fog"] = False
        _push_alert("DEMO: fog released", "info", "#8B98A5")
    elif d.scenario == "obstacle":
        demo["obstacle_node"] = d.node_id or next(iter(nodes), None)
        _push_alert(f"DEMO: obstacle dropped in front of {demo['obstacle_node']}", "danger", "#F87171", demo["obstacle_node"])
    elif d.scenario == "reset":
        demo.update(fog=False, obstacle_node=None)
        for n in nodes.values():
            n["hazard_active"] = False
        _hazard_pos.clear()
        _hz_seen.clear()
        _update_instructions()
    else:
        raise HTTPException(status_code=400, detail="unknown scenario")
    await manager.broadcast()
    return {"ok": True, "demo": demo}


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
@app.get("/api/map")
def get_map():
    return geo.map_payload()


@app.get("/api/state")
def get_state(authorization: Optional[str] = Header(None)):
    c = _claims(authorization)
    if not c:
        raise HTTPException(status_code=401, detail="sign-in required")
    return snapshot(c)


@app.get("/api/report")
def get_report(hours: float = 24, authorization: Optional[str] = Header(None), x_operator_key: Optional[str] = Header(None)):
    require_operator(authorization, x_operator_key)
    r = db.report(hours * 3600)
    r["fleet"] = {k: {"vehicle_no": fleet.vehicle_info(k)["vehicle_no"], "fleet_id": fleet.vehicle_info(k)["fleet_id"], "driver": fleet.driver_info(k)["name"]} for k in fleet.FLEET}
    r["stations"] = {k: v["name"] for k, v in geo.STATIONS.items()}
    return r


@app.get("/api/replay")
def get_replay(seconds: float = 300, authorization: Optional[str] = Header(None), x_operator_key: Optional[str] = Header(None)):
    require_operator(authorization, x_operator_key)
    r = db.replay(min(seconds, 3600))
    r["fleet"] = {k: fleet.vehicle_info(k) for k in fleet.FLEET}
    return r


@app.get("/api/whatif")
def get_whatif(minutes: float = 30, severity: str = "moderate", dense_kmph: float = 5, standoff_s: float = 45,
               authorization: Optional[str] = Header(None), x_operator_key: Optional[str] = Header(None)):
    """Same fleet, same fog, with vs without DRISHTI. A simulation on stated assumptions, not field data."""
    require_operator(authorization, x_operator_key)
    try:
        return whatif.compare(minutes, severity, dense_kmph, standoff_s)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: Optional[str] = None):
    # Every socket needs a valid token: driver -> own truck only, operator -> whole fleet.
    ident = driver_auth.verify_token(token) if token else None
    if ident is None:
        await ws.accept()            # accept first so the client actually receives the 4401 code
        await ws.close(code=4401)
        return
    ident.setdefault("role", "driver")
    await manager.connect(ws, ident)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ---------------------------------------------------------------------------
# Serve the built app (frontend/dist) so ONE process runs the whole thing on a
# laptop: http://localhost:8000 . Defined last so every /api and /ws route wins.
# ---------------------------------------------------------------------------
_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")


@app.get("/{path:path}", include_in_schema=False)
def serve_app(path: str):
    if not os.path.isdir(_DIST) or path.startswith(("api/", "ws")):
        raise HTTPException(status_code=404, detail="Not Found")
    full = os.path.abspath(os.path.join(_DIST, path))
    if path and full.startswith(_DIST + os.sep) and os.path.isfile(full):
        return FileResponse(full)
    return FileResponse(os.path.join(_DIST, "index.html"))
