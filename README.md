# DRISHTI — SIH26007, Team CyberNova

Predictive fog-safety system for NMDC's Bailadila haul roads: a **mobile app** (driver + control room),
a **backend** that decides who goes first at blind curves, and **truck-node hardware** (ESP32).

> **Status:** the software runs end to end on a **simulated fleet** (3 dumpers, 3 weather stations, 3 roadside
> beacons). The ESP32 node firmware is a skeleton and is not flashed and tested yet. Numbers from the
> simulator are design studies, not field data. See [Known limits](#known-limits).

## What it does

- **Predicts fog** from humidity and dew-point trends and warns before a truck enters it.
- **Fixes GPS where it fails.** In the GPS-shadow stretch a truck measures its distance to roadside beacons and
  the backend solves its true position (least-squares trilateration). With fewer than 3 beacons it says "GPS weak"
  instead of guessing.
- **Right-of-way at blind curves: the loaded truck goes first.** Loaded before empty, then heavier load, then first
  to arrive, then fixed order. Only trucks heading towards each other can conflict. The waiting truck holds, or an
  empty truck takes the bypass in dense fog.
- **Plans the curve ahead.** The lower-priority truck eases off so oncoming trucks never share the curve.
- **Shares obstacles between trucks (V2V)** with the distance, on the driver screen, the 3D view and the map.
- **See-through-fog driver view** (Three.js, Assist / Raw), full-screen alarm with acknowledgement, speed advice,
  proximity warning, Hindi and English, dark mode, offline cache.
- **Control room:** live map (OpenStreetMap), tap a truck for driver / vehicle / load, dispatch, reports, timeline
  replay, and a **with-vs-without-DRISHTI simulation** with editable assumptions.

## Repository layout

```
backend/    FastAPI server, algorithms, SQLite history, simulator, tests
frontend/   React mobile app (Vite). src/app/ = screens. android/ = Capacitor Android project
hardware/   ESP32 firmware skeleton, pin map, payload spec, signed-telemetry reference client
DRISHTI.bat / STOP-DRISHTI.bat   Windows one-click start / stop (server + demo fleet + app window)
```

Key backend files: `right_of_way.py`, `positioning.py`, `forecast.py`, `fog_logic.py`, `whatif.py`,
`geo.py` (illustrative road geometry), `driver_auth.py`, `security.py`, `db.py`, `simulator.py`.

## Run it

```bash
# 1. backend
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# 2. demo fleet (second terminal)
pip install requests
python simulator.py

# 3. app: build once, then the backend serves it at http://localhost:8000
cd frontend
npm install
npm run build
```

Or on Windows just run `DRISHTI.bat`. For frontend development use `npm run dev` (http://localhost:5173).

Open **http://localhost:8000** — Driver app at `/driver`, control room at `/control`.

## Demo sign-ins (demo only)

| Who | Sign-in |
|---|---|
| Driver D-101 / D-102 / D-103 | PIN 1234 / 2580 / 4321 |
| Control room operator | PIN 9999 |

These are demo defaults. Set environment variables before any real use:
`DRISHTI_OPERATOR_PIN`, `DRISHTI_OPERATOR_KEY`, `DRISHTI_TOKEN_SECRET`, `DRISHTI_HMAC_SECRET`.

## Tests

```bash
cd backend
python test_right_of_way.py
python test_all.py
```

18 tests: right-of-way rules, beacon positioning, fog forecast, shared obstacles, curve planning, the
with-vs-without simulation, and the API security model (sign-in, roles, WebSocket, acknowledgements).

## Android app

`frontend/android` is a Capacitor project (the same app, wrapped). To build an APK you need the Android SDK:

```bash
cd frontend
npm run build
npx cap sync android
# then open frontend/android in Android Studio, or run gradlew assembleDebug
```

On first launch the app asks for the backend address (the laptop's Wi-Fi IP, port 8000).

## Hardware

See [`hardware/README.md`](hardware/README.md) for the parts list, pin map, telemetry payload and signing.
The firmware in `hardware/firmware/drishti_node/` reads the DHT11 and motion sensor and sends signed telemetry;
GPS, fingerprint, RFID and OLED code are marked `TODO`.

## Known limits

- The fleet, weather stations, beacon ranges and GPS errors are **simulated**.
- The road, curve, bypass, beacons and stations are **illustrative shapes** near Kirandul, not surveyed data.
- The fog forecast is a transparent trend fit, not a trained model.
- The driver 3D view is symbolic, not a camera or radar picture.
- The with-vs-without comparison is a simulation on stated assumptions; its throughput gain depends on assumed
  dense-fog speeds. Curve planning alone improves safety, not tonnes.
- Map tiles need internet. Push notifications and offline map tiles are not built.
- Security is demo-grade: in-memory live state, no HTTPS, shared demo secrets.

## Credits

OpenStreetMap and Leaflet (maps), FastAPI, React, Three.js, Capacitor. Organic Maps is a native app with no web
SDK, so DRISHTI hands locations to it through standard `geo:` links instead of embedding it.
