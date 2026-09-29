"""
DRISHTI fog-risk scoring.

No ML model runs on the sensor node itself (it's an ESP32), so this is a
transparent, explainable rule-based scorer -- the same "deterministic and
explainable" philosophy the project doc uses for sensor fusion. It's built
from two signals:

1. Dew-point spread: how close the air temperature is to its dew point.
   A small spread means the air is close to saturated -- fog-forming
   conditions. This uses the Magnus-Tetens approximation, which is the
   same family of formula real fog-nowcasting studies use.
2. A short rolling trend: is humidity climbing and the spread shrinking
   over the last few readings? That's what turns this from a reactive
   "it's foggy now" reading into a predictive "fog is forming" warning --
   matching the 15-30 min lead-time claim in the pitch deck (this MVP
   estimates trend direction, not a calibrated lead time -- that needs a
   real trained model against real weather-station history).
"""
import math
from collections import deque
from dataclasses import dataclass, field


def dew_point_c(temp_c: float, humidity_pct: float) -> float:
    """Magnus-Tetens approximation of dew point in Celsius."""
    a, b = 17.62, 243.12
    humidity_pct = max(0.1, min(100.0, humidity_pct))
    gamma = (a * temp_c) / (b + temp_c) + math.log(humidity_pct / 100.0)
    return (b * gamma) / (a - gamma)


@dataclass
class NodeHistory:
    """Rolling window of recent readings for one sensor node, used for trend detection."""
    readings: deque = field(default_factory=lambda: deque(maxlen=12))

    def push(self, temp_c: float, humidity_pct: float, spread: float):
        self.readings.append((temp_c, humidity_pct, spread))

    def trend(self) -> str:
        """Very simple trend: compare the average of the first half of the
        window to the second half. Good enough for a live demo; a real
        deployment would fit this against minutes-scale weather-station data."""
        if len(self.readings) < 4:
            return "insufficient_data"
        mid = len(self.readings) // 2
        first, second = list(self.readings)[:mid], list(self.readings)[mid:]
        avg_hum_first = sum(r[1] for r in first) / len(first)
        avg_hum_second = sum(r[1] for r in second) / len(second)
        avg_spread_first = sum(r[2] for r in first) / len(first)
        avg_spread_second = sum(r[2] for r in second) / len(second)
        humidity_rising = avg_hum_second - avg_hum_first > 1.5
        spread_shrinking = avg_spread_first - avg_spread_second > 0.3
        if humidity_rising and spread_shrinking:
            return "fog_forming"
        if avg_hum_second - avg_hum_first < -1.5:
            return "clearing"
        return "stable"


# One history buffer per node_id, kept in process memory.
_histories: dict[str, NodeHistory] = {}


def compute_fog_risk(node_id: str, temp_c: float, humidity_pct: float) -> dict:
    spread = round(temp_c - dew_point_c(temp_c, humidity_pct), 2)

    history = _histories.setdefault(node_id, NodeHistory())
    history.push(temp_c, humidity_pct, spread)
    trend = history.trend()

    if humidity_pct >= 95 and spread <= 1.0:
        level = "HIGH"
    elif humidity_pct >= 85 and spread <= 3.0:
        level = "MEDIUM"
    else:
        level = "LOW"

    forming_soon = trend == "fog_forming" and level != "HIGH"
    if forming_soon and level == "LOW":
        level = "MEDIUM"  # predictive bump: don't wait for it to already be foggy

    return {
        "dew_point_c": round(dew_point_c(temp_c, humidity_pct), 2),
        "dew_point_spread_c": spread,
        "risk_level": level,
        "trend": trend,
        "forming_soon": forming_soon,
    }
