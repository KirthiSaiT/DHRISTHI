"""
Right-of-way at shared single-lane zones (blind curves).

Plain-language rules, applied in this order. The FIRST rule that separates two
trucks decides who goes; everyone else in the zone waits.

  1. LOADED     A loaded truck goes before an empty one.
                (It is heavier, needs far more braking distance, climbs slower,
                and its cargo is the reason the road exists.)
  2. HEAVIER    Both loaded: the heavier load goes first (longer stopping distance).
  3. FIRST      Same load: whoever entered the zone first goes first.
  4. ID         Still tied: lowest node id goes first, so the answer is never random
                and both trucks always compute the same result.

What the waiting truck is told to do:
  - HOLD    stop at the bay before the curve until the winner has cleared it.
  - REROUTE if fog is dense (HIGH) at the zone and the waiting truck is empty, don't
            sit blind in the fog: take the bypass road instead.

Pure functions + a tiny claim table, so the logic is easy to test and to explain.
"""
from dataclasses import dataclass
from typing import Optional

CLAIM_TTL_S = 8   # a truck "holds" a claim while it keeps reporting inside the zone
MARGIN_S = 6      # safety gap (seconds) between one truck leaving the curve and the next entering


@dataclass
class Claim:
    node_id: str
    loaded: bool
    load_t: float
    arrived_at: float
    last_seen: float
    direction: Optional[int] = None    # +1 towards the crusher, -1 towards the pit (None = unknown)
    t_in: Optional[float] = None       # predicted seconds until the truck enters the curve
    t_out: Optional[float] = None      # predicted seconds until it has cleared the curve


_claims: dict[str, dict[str, Claim]] = {}   # zone -> node_id -> Claim


def register(zone: str, node_id: str, loaded: bool, load_t: float, now: float,
             direction: Optional[int] = None, t_in: Optional[float] = None, t_out: Optional[float] = None):
    zc = _claims.setdefault(zone, {})
    old = zc.get(node_id)
    arrived = old.arrived_at if old and now - old.last_seen <= CLAIM_TTL_S else now
    zc[node_id] = Claim(node_id, loaded, load_t or 0, arrived, now, direction, t_in, t_out)


def priority_key(c: Claim):
    """Lower sorts first = goes first."""
    return (0 if c.loaded else 1, -c.load_t, c.arrived_at, c.node_id)


def deciding_rule(win: Claim, lose: Claim) -> tuple[str, str]:
    if win.loaded != lose.loaded:
        return "LOADED", f"{win.node_id} is loaded and {lose.node_id} is empty — the loaded truck goes first"
    if win.load_t != lose.load_t:
        return "HEAVIER", f"both loaded — {win.node_id} carries more ({win.load_t:g} t vs {lose.load_t:g} t)"
    if win.arrived_at != lose.arrived_at:
        return "FIRST", f"same load — {win.node_id} reached the curve first"
    return "ID", f"exact tie — {win.node_id} goes first by fixed order"


def _opposite(a: Claim, b: Claim) -> bool:
    """Only trucks heading towards each other can meet head-on. Unknown direction is treated as opposite (be safe)."""
    return a.direction is None or b.direction is None or a.direction != b.direction


def _overlap(a: Claim, b: Claim) -> bool:
    """Would both trucks be inside the curve at the same time (with a safety margin)? Unknown timing counts as yes."""
    if None in (a.t_in, a.t_out, b.t_in, b.t_out):
        return True
    return a.t_in < b.t_out + MARGIN_S and b.t_in < a.t_out + MARGIN_S


def _free(c: Claim, win: Claim, alone: bool) -> dict:
    if alone:
        why, rule = "Nobody else is at the curve", "CLEAR"
    elif not _opposite(win, c):
        why, rule = "Same direction as the other truck: no head-on conflict", "FOLLOW"
    else:
        why, rule = "Spaced apart in time: the curve will be clear when you arrive", "SPACED"
    return {"decision": "proceed", "winner": win.node_id, "rule": rule, "reason": why, "action": None, "action_text": "No conflict: proceed"}


def resolve_zone(claims: list[Claim], fog_high: bool, has_bypass: bool = True) -> dict:
    """Returns {"winner": node_id, "verdicts": {node_id: {...}}} for one zone."""
    ordered = sorted(claims, key=priority_key)
    win = ordered[0]
    if len(ordered) == 1:
        return {"winner": win.node_id, "verdicts": {win.node_id: _free(win, win, True)}}

    # A truck only has to give way if it is heading the opposite way AND would be in the curve at the same time.
    contested = [c for c in ordered[1:] if _opposite(win, c) and _overlap(win, c)]
    verdicts = {}
    if not contested:
        for c in ordered:
            verdicts[c.node_id] = _free(c, win, False)
        return {"winner": win.node_id, "verdicts": verdicts}

    rule, why = deciding_rule(win, contested[0])
    verdicts[win.node_id] = {"decision": "proceed", "winner": win.node_id, "rule": rule, "reason": why, "action": None, "action_text": "You have right-of-way: proceed"}
    for c in ordered[1:]:
        if c not in contested:
            verdicts[c.node_id] = _free(c, win, False)
            continue
        r, w = deciding_rule(win, c)
        if fog_high and has_bypass and not c.loaded:
            action, text = "reroute", "Dense fog: take the bypass road instead of waiting blind"
        else:
            action, text = "hold", f"Hold at the bay until {win.node_id} clears the curve"
        verdicts[c.node_id] = {"decision": "yield", "winner": win.node_id, "rule": r, "reason": w, "action": action, "action_text": text}
    return {"winner": win.node_id, "verdicts": verdicts}


def resolve_all(now: float, fog_high_nodes: set[str]) -> dict[str, dict]:
    """Prune expired claims, resolve every zone. Returns zone -> resolution."""
    out = {}
    for zone, zc in list(_claims.items()):
        for nid in [n for n, c in zc.items() if now - c.last_seen > CLAIM_TTL_S]:
            del zc[nid]
        if not zc:
            del _claims[zone]
            continue
        fog = any(n in fog_high_nodes for n in zc)
        out[zone] = resolve_zone(list(zc.values()), fog)
    return out
