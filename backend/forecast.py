"""
Fog nowcast: "when will this spot hit dense fog?"

Fits straight lines to the recent humidity and dew-point-spread readings of one
sensor (least squares over time) and extrapolates to the HIGH-fog thresholds
(humidity >= 95 % AND spread <= 1 C, same as fog_logic). Returns an ETA in
seconds plus a confidence (R^2 of the humidity fit). Transparent and
explainable on purpose; a model trained on a real monsoon season replaces it.
"""
from collections import deque

HUM_HIGH = 95.0
SPREAD_HIGH = 1.0
MIN_SAMPLES = 8
MIN_SPAN_S = 6.0
MAX_ETA_S = 30 * 60
MIN_CONF = 0.5

_hist: dict[str, deque] = {}


def _fit(ts, ys):
    n = len(ts)
    mt, my = sum(ts) / n, sum(ys) / n
    sxx = sum((t - mt) ** 2 for t in ts)
    if sxx == 0:
        return 0.0, my, 0.0
    slope = sum((t - mt) * (y - my) for t, y in zip(ts, ys)) / sxx
    icpt = my - slope * mt
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (icpt + slope * t)) ** 2 for t, y in zip(ts, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot > 1e-9 else 0.0
    return slope, icpt, max(0.0, r2)


def update(key: str, now: float, humidity: float, spread: float):
    h = _hist.setdefault(key, deque(maxlen=40))
    h.append((now, humidity, spread))
    return predict(key, now)


def predict(key: str, now: float):
    h = _hist.get(key)
    if not h or len(h) < MIN_SAMPLES or h[-1][0] - h[0][0] < MIN_SPAN_S:
        return None
    ts = [x[0] - h[-1][0] for x in h]          # seconds relative to "now" (<= 0)
    hum_slope, hum_icpt, r2 = _fit(ts, [x[1] for x in h])
    sp_slope, _, _ = _fit(ts, [x[2] for x in h])
    hum_now, sp_now = h[-1][1], h[-1][2]

    def eta(cur, slope, target, rising):
        if (rising and cur >= target) or (not rising and cur <= target):
            return 0.0                        # condition already met
        if (rising and slope <= 1e-4) or (not rising and slope >= -1e-4):
            return None                       # moving the wrong way / flat
        return (target - cur) / slope

    e_h = eta(hum_now, hum_slope, HUM_HIGH, True)
    e_s = eta(sp_now, sp_slope, SPREAD_HIGH, False)
    if e_h is None or e_s is None:
        return None
    e = max(e_h, e_s)
    if e <= 0 or e > MAX_ETA_S or r2 < MIN_CONF:
        return None
    return {"eta_s": round(e), "confidence": round(r2, 2), "rate_hum_pct_per_min": round(hum_slope * 60, 2)}
