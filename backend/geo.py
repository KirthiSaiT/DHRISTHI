"""
Haul-road geometry for the demo (Kirandul / Bailadila area).

The road below is an ILLUSTRATIVE polyline placed near the real mining area,
not surveyed haul-road data. Replace ROUTE_M / BYPASS_M / CURVE_M / BEACONS_M /
STATIONS with the mine's real GIS survey; everything else (simulator, map,
positioning, right-of-way, fog segments) reads from here.
"""
import math

ORIGIN = (18.6420, 81.2640)  # lat, lon of local (0, 0)

# Local metres (east, north) from ORIGIN, listed Pit -> Crusher.
ROUTE_M = [(0, 0), (120, -60), (260, -90), (400, -200), (520, -330), (600, -470),
           (720, -560), (860, -600), (1010, -540), (1120, -620), (1240, -760)]
CURVE_M = (600, -470)                 # the blind curve
CURVE_RADIUS_M = 140                  # drawn zone
APPROACH_M = 360                      # trucks inside this radius contest the curve (early enough to still use the bypass)
BYPASS_M = [(400, -200), (370, -330), (430, -460), (530, -570), (650, -640), (720, -560)]

PIT_M = ROUTE_M[0]
CRUSHER_M = ROUTE_M[-1]


def _seg_lengths(pts):
    return [math.dist(a, b) for a, b in zip(pts, pts[1:])]


def _cum(pts):
    out, s = [0.0], 0.0
    for n in _seg_lengths(pts):
        s += n
        out.append(s)
    return out


ROUTE_CUM = _cum(ROUTE_M)
ROUTE_LEN = ROUTE_CUM[-1]
BYPASS_CUM = _cum(BYPASS_M)
BYPASS_LEN = BYPASS_CUM[-1]
BYPASS_ENTER_D = ROUTE_CUM[ROUTE_M.index(BYPASS_M[0])]   # route distance where the bypass leaves the road...
BYPASS_EXIT_D = ROUTE_CUM[ROUTE_M.index(BYPASS_M[-1])]   # ...and where it rejoins
CURVE_D = ROUTE_CUM[ROUTE_M.index(CURVE_M)]              # route distance of the blind curve


def to_latlon(p):
    dx, dy = p
    lat = ORIGIN[0] + dy / 111_320
    lon = ORIGIN[1] + dx / (111_320 * math.cos(math.radians(ORIGIN[0])))
    return [round(lat, 6), round(lon, 6)]


def to_local(lat, lon):
    dy = (lat - ORIGIN[0]) * 111_320
    dx = (lon - ORIGIN[1]) * 111_320 * math.cos(math.radians(ORIGIN[0]))
    return (dx, dy)


def _point_on(pts, cum, d):
    d = max(0.0, min(cum[-1], d))
    for i in range(len(pts) - 1):
        if d <= cum[i + 1]:
            n = cum[i + 1] - cum[i]
            t = (d - cum[i]) / n if n else 0
            a, b = pts[i], pts[i + 1]
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    return pts[-1]


def point_at(d: float):
    """Local (east, north) metres at distance d along the main route (clamped)."""
    return _point_on(ROUTE_M, ROUTE_CUM, d)


def bypass_point_at(d: float):
    return _point_on(BYPASS_M, BYPASS_CUM, d)


_ROUTE_SAMPLES = None


def project_route(lat, lon):
    """Snap a lat/lon onto the main road: returns (distance along route in m, sideways offset in m)."""
    global _ROUTE_SAMPLES
    if _ROUTE_SAMPLES is None:
        _ROUTE_SAMPLES = [(d, point_at(d)) for d in range(0, int(ROUTE_LEN) + 1, 5)]
    x, y = to_local(lat, lon)
    d, p = min(_ROUTE_SAMPLES, key=lambda s: (s[1][0] - x) ** 2 + (s[1][1] - y) ** 2)
    return float(d), math.dist(p, (x, y))


def dist_to_curve(p) -> float:
    return math.dist(p, CURVE_M)


def route_slice(d0: float, d1: float, step: float = 20.0):
    """Lat/lon polyline of the main route between two distances."""
    n = max(2, int((d1 - d0) / step) + 1)
    return [to_latlon(point_at(d0 + (d1 - d0) * i / (n - 1))) for i in range(n)]


# --- GPS-shadow stretch (pit-wall shading) with radar-reflector beacons ---------------------------------
SHADOW_D = (0.58 * ROUTE_LEN, 0.80 * ROUTE_LEN)
BEACON_RANGE_M = 200.0


def _beacon(d, side):
    """Beacon 30 m off the road centreline at route distance d (alternating sides so the geometry isn't collinear)."""
    x, y = point_at(d)
    x2, y2 = point_at(d + 5)
    dx, dy = x2 - x, y2 - y
    n = math.hypot(dx, dy) or 1
    return (x + side * 30 * (-dy / n), y + side * 30 * (dx / n))


BEACONS_M = {
    "BCN-1": _beacon(0.60 * ROUTE_LEN, +1),
    "BCN-2": _beacon(0.69 * ROUTE_LEN, -1),
    "BCN-3": _beacon(0.78 * ROUTE_LEN, +1),
}


def in_shadow(d_along_route: float) -> bool:
    return SHADOW_D[0] <= d_along_route <= SHADOW_D[1]


# --- Weather stations on poles along the road ---------------------------------------------------------------
STATIONS = {
    "WS-1": {"name": "Dip (pit side)", "d": 0.16 * ROUTE_LEN},
    "WS-2": {"name": "Hilltop bend", "d": 0.52 * ROUTE_LEN},
    "WS-3": {"name": "Near water (crusher side)", "d": 0.86 * ROUTE_LEN},
}
for _s in STATIONS.values():
    _s["pos"] = to_latlon(point_at(_s["d"]))

# Fog is shown per road segment, each coloured by the nearest weather station.
N_SEGMENTS = 6
SEGMENTS = []
for _i in range(N_SEGMENTS):
    _d0, _d1 = ROUTE_LEN * _i / N_SEGMENTS, ROUTE_LEN * (_i + 1) / N_SEGMENTS
    _mid = (_d0 + _d1) / 2
    _st = min(STATIONS, key=lambda k: abs(STATIONS[k]["d"] - _mid))
    SEGMENTS.append({"station": _st, "path": route_slice(_d0, _d1)})


def map_payload() -> dict:
    return {
        "route": [to_latlon(p) for p in ROUTE_M],
        "bypass": [to_latlon(p) for p in BYPASS_M],
        "zones": [{"id": "blind-curve-1", "name": "Blind curve 1", "center": to_latlon(CURVE_M), "radius_m": CURVE_RADIUS_M}],
        "pit": {"name": "Pit 14 (loading)", "pos": to_latlon(PIT_M)},
        "crusher": {"name": "Primary crusher (dump)", "pos": to_latlon(CRUSHER_M)},
        "shadow": route_slice(*SHADOW_D),
        "beacons": [{"id": k, "pos": to_latlon(v)} for k, v in BEACONS_M.items()],
        "stations": [{"id": k, "name": v["name"], "pos": v["pos"]} for k, v in STATIONS.items()],
        "segments": [{"station": s["station"], "path": s["path"]} for s in SEGMENTS],
    }
