"""
"With vs without DRISHTI": replay the SAME fleet through the SAME fog under two policies and compare.

    baseline    today's practice as described in the problem statement: drivers slow down in fog
              and crawl or halt in dense fog; nobody coordinates at the blind curve, so two trucks
              can meet head-on inside it and have to stand off until one backs out.
    coord_only  today's fog speeds, but WITH the planned curve (isolates the value of coordination)
    drishti     speed advice instead of halting (the same limits the live backend gives), and the
              curve is planned ahead: the lower-priority truck (empty before loaded) eases off so the
              trucks never occupy the curve together, holds at the bay if it cannot, or, if it is
              empty and fog is dense, takes the bypass.

This is a SIMULATION built on stated assumptions, not field data. The assumptions are returned with
the result so they can be shown next to the numbers. Deterministic: same inputs, same outputs.
"""
import geo

L = geo.ROUTE_LEN
CURVE_D = geo.CURVE_D
R = geo.CURVE_RADIUS_M
DIV_ENTER, DIV_EXIT, BP_LEN = geo.BYPASS_ENTER_D, geo.BYPASS_EXIT_D, geo.BYPASS_LEN

BASE_KMPH = {True: 22.0, False: 32.0}       # loaded climbs slower than empty
TONNES = 90.0
DWELL_S = 20                                 # loading / dumping time
STANDOFF_S = 45                              # two trucks meet head-on in the curve: time lost sorting it out
MARGIN_S = 6                                 # safety gap when spacing trucks through the curve
MIN_KMPH = 8.0                               # below this a truck holds instead of crawling
FOG_HALF_WIDTH = 0.22 * L                    # the fog patch sits over the hilltop curve

# One 600 s weather cycle over the patch: (seconds, level). Same for both policies.
CYCLES = {
    "light": [(300, "LOW"), (80, "MEDIUM"), (60, "HIGH"), (80, "MEDIUM"), (80, "LOW")],
    "moderate": [(180, "LOW"), (90, "MEDIUM"), (120, "HIGH"), (90, "MEDIUM"), (120, "LOW")],
    "heavy": [(60, "LOW"), (100, "MEDIUM"), (300, "HIGH"), (100, "MEDIUM"), (40, "LOW")],
}


def fog_level(t: float, d: float, severity: str) -> str:
    if abs(d - CURVE_D) > FOG_HALF_WIDTH:
        return "LOW"
    phase = t % 600
    for dur, lvl in CYCLES[severity]:
        if phase < dur:
            return lvl
        phase -= dur
    return "LOW"


def _new_fleet():
    return [
        {"id": "A", "d": 0.18 * L, "dir": +1, "loaded": True, "path": "main", "bp": 0.0, "wait": 0, "standoff": 0, "bypass_plan": False, "last_delivery": None},
        {"id": "B", "d": 0.90 * L, "dir": -1, "loaded": False, "path": "main", "bp": 0.0, "wait": 0, "standoff": 0, "bypass_plan": False, "last_delivery": None},
        {"id": "C", "d": 0.40 * L, "dir": +1, "loaded": True, "path": "main", "bp": 0.0, "wait": 0, "standoff": 0, "bypass_plan": False, "last_delivery": None},
    ]


def _eq_d(tr) -> float:
    """Distance along the main road, also for a truck currently on the bypass."""
    if tr["path"] == "bypass":
        return DIV_ENTER + (DIV_EXIT - DIV_ENTER) * tr["bp"] / BP_LEN
    return tr["d"]


def _window(tr, v_kmph):
    """(metres to the curve entrance, seconds until entering, seconds until clear) or None if already past."""
    v = max(v_kmph, MIN_KMPH) / 3.6
    d = tr["d"]
    if tr["dir"] > 0:
        dist_in, dist_out = CURVE_D - R - d, CURVE_D + R - d
    else:
        dist_in, dist_out = d - (CURVE_D + R), d - (CURVE_D - R)
    if dist_out <= 0:
        return None
    return dist_in, max(0.0, dist_in) / v, dist_out / v


def _priority(tr, t_in):
    return (0 if tr["loaded"] else 1, t_in, tr["id"])


def run(policy: str, minutes: float, severity: str, dense_kmph: float, standoff_s: float = STANDOFF_S) -> dict:
    fleet = _new_fleet()
    steps = int(minutes * 60)
    delivered, stopped_s, fog_speed_sum, fog_speed_n = 0, 0, 0.0, 0
    cycles, overlaps, bypass_uses, spaced = [], 0, 0, 0
    in_overlap = False
    series = []

    for step in range(steps):
        t = float(step)
        speeds = {}
        for tr in fleet:
            lvl = fog_level(t, _eq_d(tr), severity)
            base = BASE_KMPH[tr["loaded"]]
            if policy in ("baseline", "coord_only"):
                v = base if lvl == "LOW" else 0.6 * base if lvl == "MEDIUM" else min(base, dense_kmph)
            else:
                cap = {"LOW": 99, "MEDIUM": 30, "HIGH": 15}[lvl] * (0.85 if tr["loaded"] else 1.0)
                v = min(base, cap)
            speeds[tr["id"]] = v

        if policy in ("drishti", "coord_only"):
            for tr in fleet:
                if tr["path"] != "main" or t < tr["wait"]:
                    continue
                me = _window(tr, speeds[tr["id"]])
                if me is None or me[0] <= 0 or me[0] > 600:
                    continue                                   # already inside / past, or far away
                for ot in fleet:
                    if ot is tr or ot["dir"] == tr["dir"] or ot["path"] != "main":
                        continue
                    other = _window(ot, speeds[ot["id"]])
                    if other is None:
                        continue
                    if not (me[1] < other[2] + MARGIN_S and other[1] < me[2] + MARGIN_S):
                        continue                               # spaced in time already
                    if _priority(tr, me[1]) < _priority(ot, other[1]):
                        continue                               # I have priority; the other truck adapts
                    dense_at_curve = fog_level(t, CURVE_D, severity) == "HIGH"
                    div_dist = (DIV_ENTER - tr["d"]) if tr["dir"] > 0 else (tr["d"] - DIV_EXIT)
                    if not tr["loaded"] and dense_at_curve and div_dist > 0:
                        tr["bypass_plan"] = True
                        continue
                    target = me[0] / (other[2] + MARGIN_S) * 3.6
                    if target >= MIN_KMPH:
                        speeds[tr["id"]] = min(speeds[tr["id"]], target)
                        spaced += 1
                    else:
                        speeds[tr["id"]] = 0.0 if me[0] <= 20 else min(speeds[tr["id"]], MIN_KMPH)

        # standoffs and dwell
        for tr in fleet:
            if t < tr["standoff"] or t < tr["wait"]:
                speeds[tr["id"]] = 0.0

        # move
        for tr in fleet:
            v = speeds[tr["id"]]
            dwelling = t < tr["wait"]
            if v < 1.0 and not dwelling:
                stopped_s += 1
            lvl = fog_level(t, _eq_d(tr), severity)
            if lvl != "LOW":
                fog_speed_sum += v
                fog_speed_n += 1
            m = v / 3.6
            if tr["path"] == "bypass":
                tr["bp"] += tr["dir"] * m
                if tr["bp"] >= BP_LEN or tr["bp"] <= 0:
                    tr["path"] = "main"
                    tr["d"] = DIV_EXIT if tr["dir"] > 0 else DIV_ENTER
                    tr["bypass_plan"] = False
                continue
            new_d = tr["d"] + tr["dir"] * m
            if tr["bypass_plan"]:
                cross = DIV_ENTER if tr["dir"] > 0 else DIV_EXIT
                if (tr["d"] - cross) * (new_d - cross) <= 0:   # reached the divergence point: leave the main road
                    tr["path"], tr["bp"] = "bypass", (0.0 if tr["dir"] > 0 else BP_LEN)
                    bypass_uses += 1
                    continue
            tr["d"] = new_d

        # arrivals
        for tr in fleet:
            if tr["path"] != "main":
                continue
            if tr["loaded"] and tr["d"] >= L:
                tr["d"], tr["dir"], tr["loaded"], tr["wait"] = L, -1, False, t + DWELL_S
                delivered += 1
                if tr["last_delivery"] is not None:
                    cycles.append(t - tr["last_delivery"])
                tr["last_delivery"] = t
            elif not tr["loaded"] and tr["d"] <= 0:
                tr["d"], tr["dir"], tr["loaded"], tr["wait"] = 0.0, +1, True, t + DWELL_S

        # head-on meeting inside the curve (counted the same way for both policies)
        inside = [tr for tr in fleet if tr["path"] == "main" and abs(tr["d"] - CURVE_D) <= R]
        clash = any(a["dir"] != b["dir"] for a in inside for b in inside if a is not b)
        if clash and not in_overlap:
            overlaps += 1
            for tr in inside:
                tr["standoff"] = t + standoff_s
        in_overlap = clash

        if step % 30 == 0:
            series.append([step, round(delivered * TONNES)])

    return {
        "deliveries": delivered,
        "tonnes": round(delivered * TONNES),
        "stopped_min": round(stopped_s / 60, 1),
        "avg_cycle_s": round(sum(cycles) / len(cycles)) if cycles else None,
        "head_on_meetings": overlaps,
        "bypass_uses": bypass_uses,
        "speed_nudge_seconds": spaced,
        "avg_speed_in_fog_kmph": round(fog_speed_sum / fog_speed_n, 1) if fog_speed_n else None,
        "series": series,
    }


def compare(minutes: float = 30, severity: str = "moderate", dense_kmph: float = 5.0, standoff_s: float = STANDOFF_S) -> dict:
    if severity not in CYCLES:
        raise ValueError("severity must be light, moderate or heavy")
    minutes = max(5.0, min(float(minutes), 120.0))
    dense_kmph = max(0.0, min(float(dense_kmph), 15.0))
    standoff_s = max(0.0, min(float(standoff_s), 120.0))
    base = run("baseline", minutes, severity, dense_kmph, standoff_s)
    coord = run("coord_only", minutes, severity, dense_kmph, standoff_s)
    dr = run("drishti", minutes, severity, dense_kmph, standoff_s)

    def pct(x):
        return round((x["tonnes"] - base["tonnes"]) / base["tonnes"] * 100) if base["tonnes"] else None

    # Plain-English takeaways written from the numbers themselves (so they can never disagree with them).
    insights = []
    cp, fp = pct(coord), pct(dr)
    meetings = base["head_on_meetings"]
    if meetings > dr["head_on_meetings"]:
        insights.append(f"Safety: head-on meetings in the curve fall from {meetings} to {dr['head_on_meetings']}. Planning the curve is what removes them.")
    if cp is not None:
        if cp <= -1:
            insights.append(f"Planning the curve alone costs about {abs(cp)} percent of tonnes at this meeting cost, because the lower-priority truck eases off. That is the price of the safety gain.")
        elif cp < 2:
            insights.append("Planning the curve alone leaves tonnes about the same, so its value here is safety, not throughput.")
        else:
            insights.append(f"Planning the curve alone adds about {cp} percent tonnes.")
    if fp is not None and cp is not None:
        insights.append(f"Full DRISHTI moves {fp:+d} percent tonnes versus today. Most of that comes from keeping trucks moving in fog instead of crawling, which relies on the assumption that assisted drivers can safely run the advised speeds.")
    if dr["stopped_min"] < base["stopped_min"]:
        insights.append(f"Trucks spend {base['stopped_min']:g} minutes stopped today versus {dr['stopped_min']:g} with DRISHTI.")

    return {
        "minutes": minutes, "severity": severity, "dense_kmph": dense_kmph, "standoff_s": standoff_s,
        "baseline": base, "coord_only": coord, "drishti": dr,
        "delta": {
            "tonnes": dr["tonnes"] - base["tonnes"], "tonnes_pct": pct(dr), "coord_only_pct": pct(coord),
            "stopped_min": round(dr["stopped_min"] - base["stopped_min"], 1),
            "head_on_meetings": dr["head_on_meetings"] - base["head_on_meetings"],
        },
        "insights": insights,
        "assumptions": [
            "Same 3 trucks, same road, same fog timeline in every run; 90 t per load; 20 s to load or dump.",
            f"Without DRISHTI: drivers run at 60 percent speed in fog risk and only {dense_kmph:g} km/h in dense fog (the problem statement says they slow or halt). Nothing plans the blind curve.",
            "With DRISHTI: drivers follow the same advice limits the live app gives (30 km/h in fog risk, 15 km/h in dense fog, 15 percent less when loaded). This is our design assumption, not yet proven in the field.",
            f"A head-on meeting inside the curve costs both trucks {standoff_s:g} s to sort out (assumed). Real mines may use radio calls that make this cheaper.",
            "The middle column keeps today's fog speeds and only adds the planned curve, so you can see how much of the gain comes from coordination alone.",
            "This is a simulation to show the mechanism, not field data. Change the assumptions and the numbers change.",
        ],
    }
