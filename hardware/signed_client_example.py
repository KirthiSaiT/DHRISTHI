"""
Reference implementation of a signed telemetry reading, in Python, matching
backend/security.py exactly. Run this against the live backend to prove the
signing pipeline works end-to-end tonight, and use it as the spec for the
Arduino/ESP32 firmware tomorrow (ESP32 has mbedtls/md.h for HMAC-SHA256).

Usage:
    pip install requests
    python signed_client_example.py
"""
import hashlib
import hmac
import requests

BACKEND = "http://localhost:8000"
SECRET = b"sih26007-demo-secret-change-me"  # must match DRISHTI_HMAC_SECRET on the backend


def sign(node_id, seq, temp_c, humidity_pct, motion_detected):
    msg = f"{node_id}|{seq}|{temp_c:.2f}|{humidity_pct:.2f}|{int(motion_detected)}".encode()
    return hmac.new(SECRET, msg, hashlib.sha256).hexdigest()


def send(node_id, seq, temp_c, humidity_pct, motion_detected=False, zone=None):
    payload = {
        "node_id": node_id,
        "seq": seq,
        "temp_c": temp_c,
        "humidity_pct": humidity_pct,
        "motion_detected": motion_detected,
        "signature": sign(node_id, seq, temp_c, humidity_pct, motion_detected),
    }
    if zone:
        payload["zone"] = zone
    r = requests.post(f"{BACKEND}/api/telemetry", json=payload, timeout=5)
    print(payload, "->", r.json())


if __name__ == "__main__":
    send("NODE-A", 1, 24.6, 88.0)
    send("NODE-A", 2, 24.1, 96.5, motion_detected=True)

    # Try replaying seq=1 again -- the backend should reject it.
    payload = {
        "node_id": "NODE-A", "seq": 1, "temp_c": 24.6, "humidity_pct": 88.0,
        "motion_detected": False,
        "signature": sign("NODE-A", 1, 24.6, 88.0, False),
    }
    r = requests.post(f"{BACKEND}/api/telemetry", json=payload, timeout=5)
    print("replay attempt ->", r.json())
