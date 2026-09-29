"""Run: python test_right_of_way.py"""
from right_of_way import Claim, resolve_zone


def c(n, loaded, t, arr): return Claim(n, loaded, t, arr, arr)


def test_loaded_beats_empty_even_if_empty_arrived_first():
    r = resolve_zone([c("B", False, 0, 1), c("A", True, 90, 5)], fog_high=False)
    assert r["winner"] == "A"
    assert r["verdicts"]["A"]["decision"] == "proceed" and r["verdicts"]["A"]["rule"] == "LOADED"
    assert r["verdicts"]["B"]["decision"] == "yield" and r["verdicts"]["B"]["action"] == "hold"


def test_heavier_load_wins_when_both_loaded():
    assert resolve_zone([c("A", True, 80, 1), c("B", True, 95, 9)], False)["winner"] == "B"


def test_first_arrived_wins_on_equal_load():
    assert resolve_zone([c("A", False, 0, 7), c("B", False, 0, 3)], False)["winner"] == "B"


def test_id_tiebreak_is_deterministic():
    assert resolve_zone([c("B", True, 90, 1), c("A", True, 90, 1)], False)["winner"] == "A"


def test_dense_fog_reroutes_empty_loser_but_loaded_loser_holds():
    r = resolve_zone([c("A", True, 95, 1), c("B", False, 0, 1)], fog_high=True)
    assert r["verdicts"]["B"]["action"] == "reroute"
    r = resolve_zone([c("A", True, 95, 1), c("B", True, 80, 1)], fog_high=True)
    assert r["verdicts"]["B"]["action"] == "hold"


def test_lone_truck_proceeds():
    r = resolve_zone([c("A", False, 0, 1)], False)
    assert r["verdicts"]["A"]["decision"] == "proceed"


def cd(n, loaded, t, arr, direction, t_in=None, t_out=None): return Claim(n, loaded, t, arr, arr, direction, t_in, t_out)


def test_same_direction_trucks_do_not_conflict():
    r = resolve_zone([cd("A", True, 90, 1, +1), cd("C", True, 88, 2, +1)], fog_high=False)
    assert all(v["decision"] == "proceed" for v in r["verdicts"].values())
    assert r["verdicts"]["C"]["rule"] == "FOLLOW"


def test_opposite_trucks_spaced_in_time_do_not_conflict():
    r = resolve_zone([cd("A", True, 90, 1, +1, 0, 20), cd("B", False, 0, 1, -1, 40, 60)], fog_high=False)
    assert all(v["decision"] == "proceed" for v in r["verdicts"].values())
    assert r["verdicts"]["B"]["rule"] == "SPACED"


def test_opposite_overlapping_trucks_still_conflict():
    r = resolve_zone([cd("A", True, 90, 1, +1, 0, 20), cd("B", False, 0, 1, -1, 5, 25)], fog_high=False)
    assert r["verdicts"]["B"]["decision"] == "yield" and r["verdicts"]["A"]["decision"] == "proceed"


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
