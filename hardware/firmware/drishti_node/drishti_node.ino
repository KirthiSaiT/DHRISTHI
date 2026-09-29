/*
  DRISHTI sensor node — ESP32 firmware skeleton.

  Matches backend/main.py exactly:
    - POSTs signed telemetry to /api/telemetry (fog-risk inputs + motion trigger)
    - POSTs driver-auth events to /api/auth (fingerprint or RFID)
    - Reads the server's computed risk_level back from the telemetry response
      and drives the local buzzer/LED/OLED from it -- the node doesn't
      recompute risk itself, the backend is the single source of truth.

  This is a working skeleton, not a finished product: pin numbers match
  hardware/README.md's suggested map but MUST be checked against your actual
  board's silkscreen before wiring anything up, and the fingerprint/RFID
  match logic below are stubs to fill in with your sensor library's real
  enrollment/match calls once the hardware is in hand.

  Libraries needed (Arduino Library Manager):
    - ArduinoJson (by Benoit Blanchon)
    - Adafruit Fingerprint Sensor Library   (if using the R307/AS608 UART sensor)
    - MFRC522                                (for the RC522 RFID reader)
    - Adafruit SSD1306 + Adafruit GFX        (for the OLED)
    - DHT sensor library (by Adafruit)       (for the DHT11)

  Board setting: any ESP32 Dev Module.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <mbedtls/md.h>

// ---------------------------------------------------------------------------
// CONFIG — fill these in before flashing
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL   = "http://192.168.1.100:8000"; // your laptop's LAN IP, not localhost
const char* NODE_ID       = "NODE-A";
const char* HMAC_SECRET   = "sih26007-demo-secret-change-me"; // MUST match DRISHTI_HMAC_SECRET on the backend

// ---------------------------------------------------------------------------
// PIN MAP — see hardware/README.md; adjust to your board
// ---------------------------------------------------------------------------
#define PIN_DHT11        32
#define PIN_RCWL0516     27
#define PIN_BUZZER       26
#define PIN_LED          25
// I2C (OLED): default SDA=21 SCL=22 on most ESP32 devkits
// GPS / fingerprint UARTs: wire up with HardwareSerial once the board is in hand

DHT dht(PIN_DHT11, DHT11);

uint32_t seq = 0;
unsigned long lastTelemetry = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// HMAC-SHA256 signing — must byte-match backend/security.py's canonical_payload
// ---------------------------------------------------------------------------
String hmacSha256Hex(const String& key, const String& msg) {
  byte hmacResult[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_setup(&ctx, info, 1 /* use hmac */);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, hmacResult);
  mbedtls_md_free(&ctx);

  String hex = "";
  char buf[3];
  for (int i = 0; i < 32; i++) {
    sprintf(buf, "%02x", hmacResult[i]);
    hex += buf;
  }
  return hex;
}

// Field order and %.2f formatting must match security.py's canonical_payload exactly.
String signReading(const String& nodeId, uint32_t s, float tempC, float humPct, bool motion) {
  char tempBuf[8], humBuf[8];
  dtostrf(tempC, 0, 2, tempBuf);
  dtostrf(humPct, 0, 2, humBuf);
  String msg = nodeId + "|" + String(s) + "|" + String(tempBuf) + "|" + String(humBuf) + "|" + String(motion ? 1 : 0);
  return hmacSha256Hex(HMAC_SECRET, msg);
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println(" connected: " + WiFi.localIP().toString());
}

// Returns the parsed risk_level from the backend ("LOW"/"MEDIUM"/"HIGH"), or "" on failure.
String postTelemetry(float tempC, float humPct, bool motion) {
  seq++;
  String signature = signReading(NODE_ID, seq, tempC, humPct, motion);

  StaticJsonDocument<256> doc;
  doc["node_id"] = NODE_ID;
  doc["seq"] = seq;
  doc["temp_c"] = tempC;
  doc["humidity_pct"] = humPct;
  doc["motion_detected"] = motion;
  doc["signature"] = signature;
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(BACKEND_URL) + "/api/telemetry");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  String risk = "";
  if (code == 200) {
    StaticJsonDocument<512> resp;
    deserializeJson(resp, http.getString());
    risk = resp["risk"]["risk_level"] | "";
    Serial.println("telemetry ok, risk=" + risk);
  } else {
    Serial.println("telemetry failed, code=" + String(code));
  }
  http.end();
  return risk;
}

void postAuth(const String& driverId, const String& method, bool success) {
  StaticJsonDocument<256> doc;
  doc["node_id"] = NODE_ID;
  doc["driver_id"] = driverId;
  doc["method"] = method;
  doc["success"] = success;
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(BACKEND_URL) + "/api/auth");
  http.addHeader("Content-Type", "application/json");
  http.POST(body);
  http.end();
}

// ---------------------------------------------------------------------------
// Local alert (buzzer/LED) driven by the server's risk_level, not a local guess
// ---------------------------------------------------------------------------
void applyLocalAlert(const String& riskLevel, bool motion) {
  if (motion || riskLevel == "HIGH") {
    digitalWrite(PIN_LED, HIGH);
    tone(PIN_BUZZER, 2000, 300);
  } else {
    digitalWrite(PIN_LED, riskLevel == "MEDIUM" ? HIGH : LOW);
    noTone(PIN_BUZZER);
  }
}

// ---------------------------------------------------------------------------
// Fingerprint / RFID stubs -- replace with your library's real match calls
// ---------------------------------------------------------------------------
void checkFingerprint() {
  // TODO: swap in Adafruit_Fingerprint's getImage()/image2Tz()/fingerFastSearch().
  // On a confirmed match:
  //   postAuth("R. Kumar", "fingerprint", true);
  // On a rejected/unknown finger:
  //   postAuth("unknown", "fingerprint", false);
}

void checkRfid() {
  // TODO: swap in MFRC522's PICC_IsNewCardPresent()/PICC_ReadCardSerial(),
  // map the UID to a known driver, then:
  //   postAuth(driverName, "rfid", true/false);
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_RCWL0516, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  dht.begin();
  connectWiFi();
}

void loop() {
  checkFingerprint();
  checkRfid();

  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = millis();

    float tempC = dht.readTemperature();
    float humPct = dht.readHumidity();
    bool motion = digitalRead(PIN_RCWL0516) == HIGH;

    if (isnan(tempC) || isnan(humPct)) {
      Serial.println("DHT11 read failed, skipping this cycle");
      return;
    }

    String risk = postTelemetry(tempC, humPct, motion);
    applyLocalAlert(risk, motion);

    // TODO: push tempC/humPct/risk/motion to the OLED (Adafruit_SSD1306) here.
  }
}
