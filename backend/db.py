"""
SQLite persistence (stdlib). Live state stays in memory for speed; everything that
matters later is written here so a restart no longer wipes history:
alerts, position history (for replay), station readings + events (for reports).
"""
import json
import os
import sqlite3
import threading
import time
from typing import Optional

PATH = os.environ.get("DRISHTI_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "drishti.db"))
_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def init(path: Optional[str] = None):
    global _conn
    _conn = sqlite3.connect(path or PATH, check_same_thread=False, isolation_level=None)
    _conn.execute("PRAGMA journal_mode=WAL")
    _conn.execute("PRAGMA synchronous=NORMAL")
    _conn.executescript("""
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, text TEXT, level TEXT, color TEXT, node_id TEXT);
    CREATE TABLE IF NOT EXISTS positions(ts REAL, node_id TEXT, lat REAL, lon REAL, risk TEXT, load_state TEXT, load_t REAL, hazard INTEGER, pos_src TEXT, speed REAL);
    CREATE INDEX IF NOT EXISTS ix_pos_ts ON positions(ts);
    CREATE TABLE IF NOT EXISTS station_readings(ts REAL, station_id TEXT, risk TEXT, hum REAL, temp REAL);
    CREATE INDEX IF NOT EXISTS ix_st_ts ON station_readings(ts);
    CREATE TABLE IF NOT EXISTS events(ts REAL, kind TEXT, node_id TEXT, data TEXT);
    CREATE INDEX IF NOT EXISTS ix_ev_ts ON events(ts);
    """)


def _x(sql, args=()):
    with _lock:
        return _conn.execute(sql, args)


def log_alert(text, level, color, node_id) -> int:
    return _x("INSERT INTO alerts(ts,text,level,color,node_id) VALUES(?,?,?,?,?)", (time.time(), text, level, color, node_id)).lastrowid


def recent_alerts(n=60):
    with _lock:
        rows = _conn.execute("SELECT id,ts,text,level,color,node_id FROM alerts ORDER BY id DESC LIMIT ?", (n,)).fetchall()
    return [{"id": r[0], "text": r[2], "level": r[3], "color": r[4], "node_id": r[5], "time": time.strftime("%H:%M:%S", time.localtime(r[1]))} for r in rows]


def log_position(node_id, lat, lon, risk, load_state, load_t, hazard, pos_src, speed):
    _x("INSERT INTO positions VALUES(?,?,?,?,?,?,?,?,?,?)", (time.time(), node_id, lat, lon, risk, load_state, load_t, int(bool(hazard)), pos_src, speed))


def log_station(station_id, risk, hum, temp):
    _x("INSERT INTO station_readings VALUES(?,?,?,?,?)", (time.time(), station_id, risk, hum, temp))


def log_event(kind, node_id=None, **data):
    _x("INSERT INTO events VALUES(?,?,?,?)", (time.time(), kind, node_id, json.dumps(data)))


def _rows(sql, args=()):
    with _lock:
        return _conn.execute(sql, args).fetchall()


def report(since_s: float) -> dict:
    t0 = time.time() - since_s
    fog = {}
    for sid in {r[0] for r in _rows("SELECT DISTINCT station_id FROM station_readings WHERE ts>=?", (t0,))}:
        rows = _rows("SELECT ts,risk FROM station_readings WHERE station_id=? AND ts>=? ORDER BY ts", (sid, t0))
        secs = {"LOW": 0.0, "MEDIUM": 0.0, "HIGH": 0.0}
        for (a, ra), (b, _) in zip(rows, rows[1:]):
            secs[ra] = secs.get(ra, 0.0) + min(b - a, 10.0)   # cap gaps so a paused sim isn't counted as fog time
        fog[sid] = {k: round(v) for k, v in secs.items()}

    ev = [(r[0], r[1], r[2], json.loads(r[3])) for r in _rows("SELECT ts,kind,node_id,data FROM events WHERE ts>=? ORDER BY ts", (t0,))]
    count = lambda k: sum(1 for e in ev if e[1] == k)

    rules = {}
    for e in ev:
        if e[1] == "row":
            rules[e[3].get("rule", "?")] = rules.get(e[3].get("rule", "?"), 0) + 1

    trucks = {}
    for ts, kind, node, d in ev:
        if not node:
            continue
        t = trucks.setdefault(node, {"deliveries": 0, "tonnes": 0.0, "overspeed": 0, "acks": 0, "ack_secs": 0.0, "_del_ts": []})
        if kind == "delivery":
            t["deliveries"] += 1
            t["tonnes"] += d.get("tonnes", 0)
            t["_del_ts"].append(ts)
        elif kind == "overspeed":
            t["overspeed"] += 1
        elif kind == "ack":
            t["acks"] += 1
            t["ack_secs"] += d.get("seconds", 0)
    for t in trucks.values():
        ds = t.pop("_del_ts")
        t["avg_cycle_s"] = round(sum(b - a for a, b in zip(ds, ds[1:])) / (len(ds) - 1)) if len(ds) > 1 else None
        ack_secs = t.pop("ack_secs")
        t["avg_ack_s"] = round(ack_secs / t["acks"], 1) if t["acks"] else None
        t["tonnes"] = round(t["tonnes"], 1)

    return {
        "window_s": round(since_s),
        "fog_seconds_by_station": fog,
        "hazards_raised": count("hazard_raised"), "hazards_cleared": count("hazard_cleared"),
        "right_of_way_decisions": count("row"), "by_rule": rules,
        "reroutes": count("reroute"), "holds": sum(1 for e in ev if e[1] == "row" and e[3].get("action") == "hold"),
        "overspeed_events": count("overspeed"), "proximity_warnings": count("proximity"),
        "gps_shadow_corrections": count("beacon_fix"),
        "hazards_shared": count("hazard_shared"), "speed_nudges": count("slot_advice"),
        "trucks": trucks,
    }


def replay(seconds: float, max_frames=600) -> dict:
    t0 = time.time() - seconds
    frames = {}
    for ts, node, lat, lon, risk, ls, lt, hz, src, sp in _rows("SELECT * FROM positions WHERE ts>=? ORDER BY ts", (t0,)):
        f = frames.setdefault(int(ts), {})
        f[node] = {"node_id": node, "lat": lat, "lon": lon, "risk": risk, "load_state": ls, "load_t": lt, "hazard": bool(hz), "pos_src": src, "speed": sp}
    keys = sorted(frames)
    if len(keys) > max_frames:
        step = len(keys) / max_frames
        keys = [keys[int(i * step)] for i in range(max_frames)]
    events = [{"t": r[0], "text": r[1], "level": r[2]} for r in _rows("SELECT ts,text,level FROM alerts WHERE ts>=? ORDER BY ts", (t0,))]
    return {"frames": [{"t": k, "nodes": list(frames[k].values())} for k in keys], "events": events}
