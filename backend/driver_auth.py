"""
Driver login: roster + PIN check + short-lived signed session tokens.

Stdlib only (no JWT dependency): a token is base64url(json claims) + "." +
HMAC-SHA256 signature. Claims bind the session to one driver and one truck
(node_id), so a driver's app can only ever be served that truck's data.

Demo scope: the roster is seeded in code and PINs are stored as salted
PBKDF2 hashes (never compared in plain text). In production the roster lives
in the database, and the on-truck fingerprint/RFID scan (signed /api/auth
event from the ESP32) becomes the first factor, with this PIN as the second.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

TOKEN_TTL_S = 8 * 3600          # one shift
MAX_FAILS = 5
LOCKOUT_S = 300

_SECRET = os.environ.get("DRISHTI_TOKEN_SECRET", "sih26007-token-secret-change-me").encode()


def _hash_pin(pin: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 120_000).hex()


def _seed(driver_id: str, name: str, node_id: str, pin: str) -> dict:
    salt = os.urandom(16)
    return {"driver_id": driver_id, "name": name, "node_id": node_id, "salt": salt, "pin_hash": _hash_pin(pin, salt)}


# Demo roster (PINs are shown on the login screen for the demo only).
DRIVERS: dict[str, dict] = {d["driver_id"]: d for d in [
    _seed("D-101", "R. Kumar", "NODE-A", "1234"),
    _seed("D-102", "S. Verma", "NODE-B", "2580"),
    _seed("D-103", "A. Rao", "NODE-C", "4321"),
]}

_fails: dict[str, list] = {}    # driver_id -> [count, locked_until]


def public_roster() -> list[dict]:
    return [{"driver_id": d["driver_id"], "name": d["name"], "node_id": d["node_id"]} for d in DRIVERS.values()]


def login(driver_id: str, pin: str) -> tuple[Optional[dict], str]:
    """Returns (driver, reason). driver is None on failure."""
    now = time.time()
    rec = _fails.setdefault(driver_id, [0, 0.0])
    if rec[1] > now:
        return None, f"locked — try again in {int(rec[1] - now)}s"

    d = DRIVERS.get(driver_id)
    # Always run the hash so unknown IDs and wrong PINs take the same time.
    salt = d["salt"] if d else b"\x00" * 16
    ok = hmac.compare_digest(_hash_pin(pin, salt), d["pin_hash"] if d else "0" * 64) and d is not None
    if not ok:
        rec[0] += 1
        if rec[0] >= MAX_FAILS:
            rec[0], rec[1] = 0, now + LOCKOUT_S
            return None, f"too many attempts — locked for {LOCKOUT_S // 60} min"
        return None, "wrong driver ID or PIN"
    rec[0], rec[1] = 0, 0.0
    return d, "ok"


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def issue_token(d: dict) -> str:
    claims = {"role": "driver", "sub": d["driver_id"], "name": d["name"], "node": d["node_id"], "exp": int(time.time()) + TOKEN_TTL_S}
    body = _b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_token(token: Optional[str]) -> Optional[dict]:
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    good = _b64(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, good):
        return None
    try:
        claims = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except Exception:
        return None
    if claims.get("exp", 0) < time.time():
        return None
    return claims


# ---- Operator (control room) login ---------------------------------------------------------------------
OPERATOR_PIN = os.environ.get("DRISHTI_OPERATOR_PIN", "9999")
OPERATOR_KEY = os.environ.get("DRISHTI_OPERATOR_KEY", "demo-operator-key")   # for machine callers (simulator, scripts)
_OP_SALT = os.urandom(16)
_OP_HASH = _hash_pin(OPERATOR_PIN, _OP_SALT)


def operator_login(pin: str) -> tuple[bool, str]:
    now = time.time()
    rec = _fails.setdefault("__OPERATOR__", [0, 0.0])
    if rec[1] > now:
        return False, f"locked — try again in {int(rec[1] - now)}s"
    if hmac.compare_digest(_hash_pin(pin, _OP_SALT), _OP_HASH):
        rec[0], rec[1] = 0, 0.0
        return True, "ok"
    rec[0] += 1
    if rec[0] >= MAX_FAILS:
        rec[0], rec[1] = 0, now + LOCKOUT_S
        return False, f"too many attempts — locked for {LOCKOUT_S // 60} min"
    return False, "wrong PIN"


def issue_operator_token() -> str:
    claims = {"role": "operator", "sub": "operator", "name": "Operator", "exp": int(time.time()) + TOKEN_TTL_S}
    body = _b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def key_ok(key) -> bool:
    return bool(key) and hmac.compare_digest(str(key), OPERATOR_KEY)
