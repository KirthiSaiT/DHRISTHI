"""
Hardware simulator — a virtual fleet on the demo road.

  * 3 dumpers haul Pit -> Crusher loaded and Crusher -> Pit empty, so they meet at the blind curve.
  * 3 pole-mounted weather stations report humidity/temperature; one ramps into fog on a cycle
    so the forecast + fog-coloured road segments have something to predict.
  * In the GPS-shadow stretch the trucks' GPS error jumps to 12-26 m and their radar ranges to the
    roadside beacons are reported, so the backend can trilaterate the true position.
  * A truck told to REROUTE leaves the main road onto the bypass and rejoins it.
  * NODE-C ignores the speed advisory now and then, so over-speed flagging has something to catch.
  * Obeys the operator's demo scenarios (force fog / drop an obstacle) sent back in the API replies.

Run (with the backend already running on :8000):
    pip install requests
    python simulator.py
"""
import math
import os
import random
import time
import requests

import geo

BASE = os.environ.get("DRISHTI_URL", "http://127.0.0.1:8000")   # 127.0.0.1, not "localhost": on Windows "localhost" tries IPv6 first and adds ~2 s per request
KEY = {"X-Operator-Key": os.environ.get("DRISHTI_OPERATOR_KEY", "demo-operator-key")}
SPEEDUP = 2.0          # demo time-compression: trucks cover ground faster than their reported speed
TICK_S = 1.0
MATERIALS = ["Iron ore lump", "Iron ore fines", "Blue dust"]

# dist = metres along the current path; dir +1 heads to the crusher (loaded), -1 heads back to the pit (empty)
TRUCKS = {
    "NODE-A": {"dist": 0.18 * geo.ROUTE_LEN, "dir": +1, "loaded": True, "tonnes": 96.0, "path": "main", "bp": 0.0, "speeder": False},
    "NODE-B": {"dist": 0.90 * geo.ROUTE_LEN, "dir": -1, "loaded": False, "tonnes": 0.0, "path": "main", "bp": 0.0, "speeder": False},
    "NODE-C": {"dist": 0.40 * geo.ROUTE_LEN, "dir": +1, "loaded": True, "tonnes": 88.0, "path": "main", "bp": 0.0, "speeder": True},
}
weather = {n: {"temp": random.uniform(23, 27), "hum": random.uniform(70, 82), "seq": 0} for n in TRUCKS}
st_weather = {s: {"temp": random.uniform(22, 26), "hum": random.uniform(72, 80), "phase": i * 70} for i, s in enumerate(geo.STATIONS)}
DRIVER_SCANS = [("D-101", "fingerprint"), ("D-102", "rfid"), ("D-103", "fingerprint")]
advised = {}
demo_fog = False
obstacle_for = set()


_http = requests.Session()   # keep-alive: no new connection per request


def post(path, payload, headers=None):
    try:
        return _http.post(f"{BASE}{path}", json=payload, headers=headers, timeout=3)
    except Exception as e:
        print(path, "failed:", e)


def set_load(node, loaded):
    t = TRUCKS[node]
    t["loaded"] = loaded
    t["tonnes"] = round(random.uniform(84, 100), 1) if loaded else 0.0
    post("/api/load", {"node_id": node, "loaded": loaded, "tonnes": t["tonnes"], "material": random.choice(MATERIALS) if loaded else None,
                       "origin": "Pit 14" if loaded else "Primary crusher", "destination": "Primary crusher" if loaded else "Pit 14"}, KEY)


def step_weather(w):
    if demo_fog:
        w["hum"] += (98.5 - w["hum"]) * 0.25
        w["temp"] += (20.5 - w["temp"]) * 0.1
    else:
        w["temp"] += random.uniform(-0.3, 0.2)
        w["hum"] += random.uniform(-1.0, 2.2)
    w["hum"] = max(50, min(99, w["hum"]))


def true_pos(t):
    return geo.bypass_point_at(t["bp"]) if t["path"] == "bypass" else geo.point_at(t["dist"])


def route_dist(t):
    """Approximate distance along the main route (used to know if we're inside the GPS-shadow stretch)."""
    if t["path"] == "bypass":
        return geo.BYPASS_ENTER_D + (geo.BYPASS_EXIT_D - geo.BYPASS_ENTER_D) * (t["bp"] / geo.BYPASS_LEN)
    return t["dist"]


def move(t, speed_kmph):
    step = speed_kmph / 3.6 * TICK_S * SPEEDUP
    if t["path"] == "bypass":
        t["bp"] += t["dir"] * step
        if t["bp"] >= geo.BYPASS_LEN or t["bp"] <= 0:       # rejoin the main road at the far end
            t["path"] = "main"
            t["dist"] = geo.BYPASS_EXIT_D if t["dir"] > 0 else geo.BYPASS_ENTER_D
            t["passed"] = True                              # already handled this curve: don't re-claim it
        return
    t["dist"] += t["dir"] * step


def start_bypass(t):
    """Enter the bypass from whichever end matches our direction of travel (traversed in the same sense)."""
    if t["path"] == "bypass":
        return
    t["path"] = "bypass"
    t["bp"] = 0.0 if t["dir"] > 0 else geo.BYPASS_LEN


def gps_and_ranges(t, pos):
    """Return (raw lat/lon, accuracy estimate, beacon ranges) for the truck's true position."""
    if geo.in_shadow(route_dist(t)):
        bx, by = random.gauss(0, 1), random.gauss(0, 1)
        err = random.uniform(12, 26)
        gx, gy = pos[0] + err * math.cos(bx * 3), pos[1] + err * math.sin(by * 3)
        acc = round(err + random.uniform(0, 4), 1)
        ranges = [{"id": k, "range_m": round(math.dist(pos, v) + random.gauss(0, 0.5), 2)}
                  for k, v in geo.BEACONS_M.items() if math.dist(pos, v) <= geo.BEACON_RANGE_M]
    else:
        gx, gy = pos[0] + random.gauss(0, 1.5), pos[1] + random.gauss(0, 1.5)
        acc, ranges = round(random.uniform(2.0, 4.5), 1), []
    return geo.to_latlon((gx, gy)), acc, ranges


def tick():
    global demo_fog
    # weather stations
    for sid, w in st_weather.items():
        if not demo_fog:
            w["phase"] += 1
            # one station cycles into fog on a ~3 min loop so the forecast has something to predict
            if sid == "WS-2":
                cyc = w["phase"] % 200
                w["hum"] = 74 + (cyc / 120) * 25 if cyc < 120 else 99 - ((cyc - 120) / 80) * 25
                w["temp"] = 24.5 - (w["hum"] - 74) * 0.18
            else:
                step_weather(w)
        else:
            step_weather(w)
        r = post("/api/station", {"station_id": sid, "temp_c": round(w["temp"], 2), "humidity_pct": round(w["hum"], 2), "battery_pct": round(random.uniform(70, 99), 1)})
        if r is not None and r.ok:
            demo_fog = r.json().get("demo", {}).get("fog", False)

    for node, t in TRUCKS.items():
        base = 22 if t["loaded"] else 32
        adv = advised.get(node)
        speed = base if (t["speeder"] and random.random() < 0.35) or adv is None else min(base, adv)   # NODE-C sometimes ignores the advisory
        move(t, speed)
        if t["path"] == "main":
            if t["dist"] >= geo.ROUTE_LEN:
                t["dist"], t["dir"] = geo.ROUTE_LEN, -1
                set_load(node, False)
            elif t["dist"] <= 0:
                t["dist"], t["dir"] = 0, +1
                set_load(node, True)

        pos = true_pos(t)
        (lat, lon), acc, ranges = gps_and_ranges(t, pos)
        w = weather[node]
        step_weather(w)
        w["seq"] += 1
        payload = {
            "node_id": node, "seq": w["seq"], "temp_c": round(w["temp"], 2), "humidity_pct": round(w["hum"], 2),
            "motion_detected": node in obstacle_for, "battery_pct": round(random.uniform(60, 95), 1),
            "lat": lat, "lon": lon, "gps_acc_m": acc, "speed_kmph": speed,
        }
        if ranges:
            payload["beacon_ranges"] = ranges
        obstacle_for.discard(node)
        # Claim the curve early enough to still be able to take the bypass.
        near = geo.dist_to_curve(pos) <= geo.APPROACH_M
        if not near:
            t["passed"] = False
        if near and t["path"] == "main" and not t.get("passed"):
            payload["zone"] = "blind-curve-1"
        r = post("/api/telemetry", payload)
        if r is not None and r.ok:
            d = r.json()
            advised[node] = d.get("advised_kmph")
            demo_fog = d.get("demo", {}).get("fog", demo_fog)
            if d.get("demo", {}).get("obstacle"):
                obstacle_for.add(node)
            row = d.get("row")
            if row and row.get("action") == "reroute" and t["path"] == "main":
                start_bypass(t)


def main():
    print(f"Simulating {len(TRUCKS)} trucks + {len(geo.STATIONS)} stations against {BASE} — Ctrl+C to stop")
    for node, t in TRUCKS.items():
        post("/api/load", {"node_id": node, "loaded": t["loaded"], "tonnes": t["tonnes"], "material": random.choice(MATERIALS) if t["loaded"] else None,
                           "origin": "Pit 14" if t["loaded"] else "Primary crusher", "destination": "Primary crusher" if t["loaded"] else "Pit 14"}, KEY)
    n = 0
    while True:
        n += 1
        tick()
        if n % 45 == 0:
            did, method = random.choice(DRIVER_SCANS)
            node = {"D-101": "NODE-A", "D-102": "NODE-B", "D-103": "NODE-C"}[did]
            post("/api/auth", {"node_id": node, "driver_id": did, "method": method, "success": random.random() > 0.15})
        time.sleep(TICK_S)


if __name__ == "__main__":
    main()
