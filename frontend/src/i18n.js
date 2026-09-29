import { useSyncExternalStore } from "react";

/* English / Hindi for the driver-facing screens. Server-sent free text stays English;
   spoken alerts are built here from structured data so they can be translated. */
const KEY = "drishti_lang";
const listeners = new Set();
let lang = "en";
try { lang = localStorage.getItem(KEY) || "en"; } catch { /* storage blocked */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export const useLang = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLang);

const D = {
  en: {
    tab_drive: "Drive", tab_alerts: "Alerts", tab_me: "Me",
    hi_name: "Hi {name} 👋", fog_is: "Fog risk is", risk_LOW: "Clear", risk_MEDIUM: "Fog risk", risk_HIGH: "Dense fog", risk_none: "—",
    waiting: "Waiting for {n} to report…", spread: "dew-point spread {v}°C",
    obstacle_t: "Obstacle ahead", obstacle_d: "Reduce speed and proceed with caution.",
    hold_t: "Hold at the bay", reroute_t: "Take the bypass", go_t: "You have right-of-way", go_clear: "The blind curve is clear — proceed.",
    forming_t: "Fog is forming", forming_d: "Humidity is rising and the dew-point gap is closing — slow down early.",
    dense_t: "Dense fog on your segment", dense_d: "Keep low speed and headlights on.",
    speed_t: "Slow down", speed_d: "Advised max {v} km/h — you are doing {s}.",
    prox_t: "Truck {f} is {d} m away", prox_d: "Closing in — keep your distance.",
    fc_t: "Dense fog expected", fc_d: "Forecast: dense fog on this stretch in about {when}.",
    hz_t: "Obstacle {d} m ahead", hz_d: "Reported by {f}. Slow down before you reach it.",
    slot_t: "Ease off to {v} km/h", slot_d: "{f} reaches the blind curve first. Arriving a little later keeps you both moving without stopping.",
    go_free_t: "Curve clear for you", note_shared: "Obstacle reported by another truck",
    ack: "Understood", acked: "Acknowledged ✓",
    readings: "Live readings", temp: "Temperature", hum: "Humidity", trend: "Trend", battery: "Battery", vehicle: "Vehicle", load: "Load",
    speed: "Speed", advised: "Advised speed", position: "Position", updated: "Updated", empty: "Empty", none: "None",
    tr_fog_forming: "Fog forming", tr_clearing: "Clearing", tr_stable: "Stable", tr_insufficient_data: "Collecting data",
    src_GPS: "GPS", src_BEACON: "Beacon-corrected", src_GPS_DEGRADED: "GPS weak",
    cached: "Cached · last update {t} ago", live_synced: "Live",
    view_note: "Symbolic view driven by live sensor data — not a camera feed.",
    alerts_t: "🔔 Alerts", alerts_d: "Fog changes, hazards and right-of-way calls for your truck.", alerts_none: "Nothing yet. All quiet on the road.",
    me_role: "Driver · NMDC Bailadila", session: "Session", truck: "Truck", driver_id: "Driver ID", signed_via: "Signed in via", pin_session: "PIN · 8-hour session",
    voice: "Voice alerts", voice_on: "On", voice_off: "Off", language: "Language", theme: "Dark mode", sign_out: "Sign out",
    signin_t: "Sign in to your truck", signin_d: "Pick your driver ID and enter your 4-digit PIN.", driver: "Driver",
    ago_s: "{n} s", ago_m: "{n} min", in_s: "{n} sec", in_m: "{n} min",
    assist: "Assist", raw: "Raw", clear_road: "Road clear",
    note_haz_assist: "Obstacle outlined through the fog", note_haz_raw: "Obstacle hidden by fog — switch to Assist", note_yield: "Truck crossing ahead — yield",
    note_go: "Curve clear — you have right-of-way", note_fog_assist: "Fog bank marked ahead", note_fog_raw: "Fog closing in",
    welcome_h1a: "Where trucks and control rooms", ship: "Ship", welcome_h1b: "together.",
    welcome_lede: "Predict fog, guide drivers, and coordinate haul roads in real time — built for NMDC Bailadila.",
    open_driver: "Open driver app", open_control: "Open control room", server: "Server",
  },
  hi: {
    tab_drive: "ड्राइव", tab_alerts: "अलर्ट", tab_me: "मेरा",
    hi_name: "नमस्ते {name} 👋", fog_is: "कोहरे का जोखिम", risk_LOW: "साफ़", risk_MEDIUM: "कोहरा संभव", risk_HIGH: "घना कोहरा", risk_none: "—",
    waiting: "{n} से डेटा का इंतज़ार…", spread: "ओस-बिंदु अंतर {v}°C",
    obstacle_t: "आगे रुकावट", obstacle_d: "गति कम करें और सावधानी से चलें।",
    hold_t: "बे में रुकें", reroute_t: "बाईपास लें", go_t: "आपको पहले जाना है", go_clear: "मोड़ खाली है — आगे बढ़ें।",
    forming_t: "कोहरा बन रहा है", forming_d: "नमी बढ़ रही है — पहले से गति कम करें।",
    dense_t: "आपके रास्ते पर घना कोहरा", dense_d: "धीमी गति रखें और हेडलाइट जलाएँ।",
    speed_t: "गति कम करें", speed_d: "अधिकतम सुझाई गति {v} किमी/घंटा — आप {s} पर हैं।",
    prox_t: "ट्रक {f} सिर्फ़ {d} मीटर दूर है", prox_d: "पास आ रहा है — दूरी बनाए रखें।",
    fc_t: "घना कोहरा संभावित", fc_d: "पूर्वानुमान: इस हिस्से में लगभग {when} में घना कोहरा।",
    hz_t: "आगे {d} मीटर पर रुकावट", hz_d: "{f} ने बताया है। वहाँ पहुँचने से पहले गति कम करें।",
    slot_t: "गति घटाकर {v} किमी/घंटा करें", slot_d: "{f} पहले मोड़ पार करेगा। थोड़ा देर से पहुँचने पर दोनों बिना रुके चलते रहेंगे।",
    go_free_t: "आपके लिए मोड़ खाली है", note_shared: "दूसरे ट्रक ने रुकावट बताई है",
    ack: "समझ गया", acked: "पुष्टि हो गई ✓",
    readings: "लाइव रीडिंग", temp: "तापमान", hum: "नमी", trend: "रुझान", battery: "बैटरी", vehicle: "वाहन", load: "लोड",
    speed: "गति", advised: "सुझाई गई गति", position: "स्थिति", updated: "अपडेट", empty: "खाली", none: "कोई नहीं",
    tr_fog_forming: "कोहरा बन रहा है", tr_clearing: "साफ़ हो रहा है", tr_stable: "स्थिर", tr_insufficient_data: "डेटा जुटा रहे हैं",
    src_GPS: "जीपीएस", src_BEACON: "बीकन से सुधारा गया", src_GPS_DEGRADED: "जीपीएस कमज़ोर",
    cached: "सेव किया हुआ · {t} पहले का अपडेट", live_synced: "लाइव",
    view_note: "यह प्रतीकात्मक दृश्य लाइव सेंसर डेटा से बनता है — कैमरा फ़ीड नहीं।",
    alerts_t: "🔔 अलर्ट", alerts_d: "आपके ट्रक के लिए कोहरा, रुकावट और रास्ते के अधिकार की सूचनाएँ।", alerts_none: "अभी कुछ नहीं। सड़क शांत है।",
    me_role: "ड्राइवर · NMDC बैलाडीला", session: "सत्र", truck: "ट्रक", driver_id: "ड्राइवर आईडी", signed_via: "साइन-इन", pin_session: "पिन · 8 घंटे का सत्र",
    voice: "आवाज़ वाले अलर्ट", voice_on: "चालू", voice_off: "बंद", language: "भाषा", theme: "डार्क मोड", sign_out: "साइन आउट",
    signin_t: "अपने ट्रक में साइन इन करें", signin_d: "अपनी ड्राइवर आईडी चुनें और 4 अंकों का पिन डालें।", driver: "ड्राइवर",
    ago_s: "{n} सेकंड", ago_m: "{n} मिनट", in_s: "{n} सेकंड", in_m: "{n} मिनट",
    assist: "सहायता", raw: "सामान्य", clear_road: "सड़क साफ़",
    note_haz_assist: "कोहरे के बीच रुकावट चिह्नित है", note_haz_raw: "रुकावट कोहरे में छिपी है — 'सहायता' चुनें", note_yield: "आगे ट्रक पार कर रहा है — रुकें",
    note_go: "मोड़ खाली है — आपको पहले जाना है", note_fog_assist: "आगे कोहरे की परत चिह्नित है", note_fog_raw: "कोहरा घिर रहा है",
    welcome_h1a: "जहाँ ट्रक और कंट्रोल रूम", ship: "साथ", welcome_h1b: "चलते हैं।",
    welcome_lede: "कोहरे का पूर्वानुमान, ड्राइवरों को मार्गदर्शन और हॉल रोड का रियल-टाइम समन्वय — NMDC बैलाडीला के लिए।",
    open_driver: "ड्राइवर ऐप खोलें", open_control: "कंट्रोल रूम खोलें", server: "सर्वर",
  },
};

export function t(key, vars = {}, l = lang) {
  const s = (D[l] && D[l][key]) ?? D.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}
