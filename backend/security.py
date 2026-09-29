"""
Lightweight tamper-detection for sensor telemetry.

Threat model: a safety system is only as trustworthy as its inputs. Anyone who
can reach the backend's HTTP endpoint could, in principle, POST a fake
"all clear" reading and mask a real fog event, or replay an old "safe" reading
on a loop. Real deployments would use TLS + per-device certs; for an ESP32
hackathon node, HMAC-SHA256 over the payload with a shared secret is the
practical equivalent: it stops casual spoofing and replay (via a nonce/seq
check) without needing a full PKI on a $5 microcontroller.

This is intentionally simple and documented as an MVP: the secret is shared
(symmetric), not per-device -- good enough to demonstrate the *pattern* for
judges, not a production key-management story.
"""
import hashlib
import hmac
import os
import time

# In a real deployment this comes from an env var / secrets manager, and is
# provisioned per-device rather than shared. For the hackathon demo it's one
# shared secret baked into both the ESP32 firmware and this backend.
SHARED_SECRET = os.environ.get("DRISHTI_HMAC_SECRET", "sih26007-demo-secret-change-me").encode()

# Replay protection: remember the last seen sequence number per node.
_last_seq: dict[str, int] = {}


def canonical_payload(node_id: str, seq: int, temp_c: float, humidity_pct: float, motion_detected: bool) -> bytes:
    """Deterministic byte string the signature covers. Field order matters --
    the ESP32 firmware must build this identically."""
    return f"{node_id}|{seq}|{temp_c:.2f}|{humidity_pct:.2f}|{int(motion_detected)}".encode()


def sign(node_id: str, seq: int, temp_c: float, humidity_pct: float, motion_detected: bool) -> str:
    msg = canonical_payload(node_id, seq, temp_c, humidity_pct, motion_detected)
    return hmac.new(SHARED_SECRET, msg, hashlib.sha256).hexdigest()


def verify(node_id: str, seq: int, temp_c: float, humidity_pct: float, motion_detected: bool, signature: str | None) -> tuple[bool, str | None]:
    """Returns (ok, reason_if_rejected). If no signature is present at all,
    the reading is accepted but flagged -- lets the demo run even before the
    real firmware signs payloads, while still surfacing the gap."""
    if signature is None:
        return True, "unsigned"

    expected = sign(node_id, seq, temp_c, humidity_pct, motion_detected)
    if not hmac.compare_digest(expected, signature):
        return False, "bad_signature"

    last = _last_seq.get(node_id)
    if last is not None and seq <= last:
        return False, "replay_or_stale_sequence"

    _last_seq[node_id] = seq
    return True, None
