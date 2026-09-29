# DRISHTI hardware node — notes for tomorrow's build

**Firmware skeleton:** `firmware/drishti_node/drishti_node.ino` — WiFi, DHT11 read,
RCWL-0516 motion, HMAC-signed telemetry POST, auth POST, and buzzer/LED driven
by the server's computed risk level. Fingerprint/RFID match logic are stubs
(clearly marked `TODO`) to fill in with Adafruit_Fingerprint / MFRC522 once
you've confirmed which exact sensor variant you have and its wiring. Open it
in Arduino IDE, install the libraries listed at the top of the file, set your
WiFi credentials and your laptop's LAN IP (not `localhost` — the ESP32 is a
separate device on the network) in the CONFIG section, and flash.

## Parts (confirmed) → role

| Part | Role |
|---|---|
| ESP32 devkit | brain — reads sensors, talks WiFi to the backend |
| DHT11 | temp/humidity → fog-risk input |
| RCWL-0516 | motion/obstacle proxy (no range/angle — binary trigger only) |
| NEO-6M GPS | position tag on readings |
| Fingerprint sensor (R307/AS608-style, UART) | driver login before the node "arms" |
| RC522 + RFID tag/card (SPI) | secondary/faster driver ID |
| Ra-02 (SX1278) LoRa module (SPI) | wired in for the long-range story; **not** used for the live demo data path (no second LoRa node to receive it) — demo sends over WiFi instead |
| OLED (SSD1306, I2C) | local screen: risk level, GPS lock, driver-auth status |
| Buzzer + LED | local alert |
| Solar panel + 2×18650 + holder | power |

## Suggested ESP32 pin map (adjust to your board's silkscreen)

- I2C (OLED): SDA=21, SCL=22
- UART2 (GPS): RX=16, TX=17
- UART1 (Fingerprint sensor): RX=4, TX=2 *(pick pins that aren't strapping pins on your specific board)*
- SPI (shared bus — LoRa + RC522, different CS): SCK=18, MOSI=23, MISO=19; LoRa CS=5, RC522 CS=15
- RCWL-0516 output: GPIO 27 (digital in)
- Buzzer: GPIO 26 (digital out)
- Status LED: GPIO 25
- DHT11 data: GPIO 32

## Telemetry payload the backend expects

`POST {BACKEND_URL}/api/telemetry`

```json
{
  "node_id": "NODE-A",
  "seq": 1,
  "temp_c": 24.6,
  "humidity_pct": 88.0,
  "motion_detected": false,
  "lat": 18.6298,
  "lon": 81.3623,
  "battery_pct": 91.0,
  "zone": "blind-curve-1",
  "signature": "<hex HMAC-SHA256, see below — optional for now>"
}
```

`seq` must increase on every reading from that node (replay protection). `zone` is only set when the node is approaching a shared hazard zone another node might also be approaching — that's what triggers the right-of-way demo.

## Signing a reading (tamper-detection module)

The backend verifies (or flags, if unsigned) an HMAC-SHA256 over:

```
"<node_id>|<seq>|<temp_c to 2dp>|<humidity_pct to 2dp>|<0 or 1 for motion_detected>"
```

keyed with the shared secret (`DRISHTI_HMAC_SECRET` env var on the backend, default `sih26007-demo-secret-change-me` — change this before the real demo). `backend/security.py` has the exact reference implementation, and `hardware/signed_client_example.py` shows it in Python end-to-end against the running backend — useful to prove the pipeline tonight, and as the algorithm to port into the Arduino sketch tomorrow (Arduino has `mbedtls/md.h` for HMAC-SHA256 on ESP32).

Readings sent without a `signature` field are still accepted (so the demo isn't blocked before firmware signs things) but are marked `unsigned` in the dashboard's node-health strip.

## Driver auth event

`POST {BACKEND_URL}/api/auth`

```json
{ "node_id": "NODE-A", "driver_id": "R. Kumar", "method": "fingerprint", "success": true }
```

Fire this from the ESP32 the moment the fingerprint sensor (or RC522) confirms/rejects a match.
