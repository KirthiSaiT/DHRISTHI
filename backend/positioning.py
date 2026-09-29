"""
Local position correction when GPS can't be trusted (pit-wall "satellite shading").

The truck's radar ranges off fixed radar-reflector beacons at surveyed positions.
With 3+ beacon ranges the truck position is solved by least-squares
trilateration (plain geometry, no ML). With only 2 ranges there are two
mirror-image solutions, so we do NOT pretend to know the position: the truck
is reported as degraded GPS.

    GPS        receiver reports a good fix (estimated accuracy <= GPS_OK_M)
    BEACON     GPS is degraded AND >= 3 beacon ranges were solved
    GPS_DEGRADED  GPS is degraded and fewer than 3 usable ranges
"""
import math

GPS_OK_M = 8.0          # receiver-estimated accuracy at or below this is trusted
MIN_BEACONS = 3
BEACON_ERR_M = 0.5      # typical residual with radar ranging (assumed)


def trilaterate(anchors):
    """anchors: [(x, y, range_m), ...] in metres. Returns (x, y) or None if under-determined."""
    if len(anchors) < 3:
        return None
    x0, y0, r0 = anchors[0]
    a11 = a12 = a22 = b1 = b2 = 0.0
    for xi, yi, ri in anchors[1:]:
        ax, ay = 2 * (xi - x0), 2 * (yi - y0)
        rhs = r0 ** 2 - ri ** 2 + xi ** 2 + yi ** 2 - x0 ** 2 - y0 ** 2
        a11 += ax * ax
        a12 += ax * ay
        a22 += ay * ay
        b1 += ax * rhs
        b2 += ay * rhs
    det = a11 * a22 - a12 * a12
    if abs(det) < 1e-6:          # beacons (nearly) in a line: no unique answer
        return None
    return ((a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det)


def fuse(gps_xy, gps_acc_m, ranges, beacon_xy):
    """
    gps_xy: (x, y) raw GPS in local metres; gps_acc_m: receiver's own accuracy estimate;
    ranges: [{"id", "range_m"}]; beacon_xy: {id: (x, y)}.
    Returns {"xy", "source", "err_m"}.
    """
    if gps_acc_m is None or gps_acc_m <= GPS_OK_M:
        return {"xy": gps_xy, "source": "GPS", "err_m": gps_acc_m}
    anchors = [(*beacon_xy[r["id"]], r["range_m"]) for r in (ranges or []) if r.get("id") in beacon_xy]
    sol = trilaterate(anchors)
    if sol is not None:
        return {"xy": sol, "source": "BEACON", "err_m": BEACON_ERR_M}
    return {"xy": gps_xy, "source": "GPS_DEGRADED", "err_m": gps_acc_m}
