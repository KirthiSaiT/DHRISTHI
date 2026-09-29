"""Fleet registry: which vehicle / driver each sensor node is mounted on, and the current load.

Vehicle data is static registry data. Load state is dispatch data: it is set through
POST /api/load (the simulator today; the loading-point weighbridge / dispatch system later).
"""
import driver_auth

FLEET = {
    "NODE-A": {"vehicle_no": "CG-18-MT-4021", "fleet_id": "DMP-21", "model": "BEML BH100 rigid dumper", "capacity_t": 100, "driver_id": "D-101"},
    "NODE-B": {"vehicle_no": "CG-18-MT-4037", "fleet_id": "DMP-37", "model": "Komatsu HD785-7", "capacity_t": 91, "driver_id": "D-102"},
    "NODE-C": {"vehicle_no": "CG-18-MT-4112", "fleet_id": "DMP-12", "model": "CAT 777G", "capacity_t": 100, "driver_id": "D-103"},
}


def vehicle_info(node_id: str) -> dict:
    v = FLEET.get(node_id)
    if not v:
        return {"vehicle_no": node_id, "fleet_id": None, "model": "Unregistered", "capacity_t": None}
    return {k: v[k] for k in ("vehicle_no", "fleet_id", "model", "capacity_t")}


def driver_info(node_id: str) -> dict:
    v = FLEET.get(node_id)
    d = driver_auth.DRIVERS.get(v["driver_id"]) if v else None
    return {"driver_id": d["driver_id"], "name": d["name"]} if d else {"driver_id": None, "name": "Unassigned"}


def default_load(node_id: str) -> dict:
    return {"state": "EMPTY", "tonnes": 0, "material": None, "origin": "Primary crusher", "destination": "Pit 14"}
