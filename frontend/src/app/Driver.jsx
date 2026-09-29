import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDrishti } from "../hooks/useDrishti.js";
import { api } from "../auth.js";
import { ackInstruction, flushAcks } from "../offlineQueue.js";
import { getLang, setLang, t, useLang } from "../i18n.js";
import { setVoiceEnabled, speak, vibrate, voiceEnabled } from "../voice.js";
import FogVision from "./FogVision.jsx";
import { Callout, Icon, LiveDot, Prop, StatusPill, TabBar, TopBar, levelChip } from "./ui.jsx";

const SESSION_KEY = "drishti_driver_session_v2";

export default function Driver() {
  useLang();
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  });
  const save = (s) => {
    try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
    setSession(s);
  };
  if (!session) return <SignIn onAuthed={save} />;
  return <Home token={session.token} nodeId={session.driver.node_id} driverName={session.driver.name} driverId={session.driver.driver_id} onSignOut={() => save(null)} />;
}

function LangToggle() {
  const l = useLang();
  return <button className="iconbtn" style={{ width: "auto", padding: "0 8px", fontSize: 13, fontWeight: 700 }} onClick={() => setLang(l === "en" ? "hi" : "en")} aria-label="Change language">{l === "en" ? "हिं" : "EN"}</button>;
}

/* ---------------- Sign-in: driver ID + PIN -> signed session token ---------------- */
function SignIn({ onAuthed }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [roster, setRoster] = useState([]);
  const [driverId, setDriverId] = useState((params.get("driver") || "").toUpperCase());
  const [pin, setPin] = useState("");
  const pinRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/drivers").then((r) => {
      if (!r.ok) { setError(r.data.detail || "Can't reach the DRISHTI server"); return; }
      setRoster(r.data);
      setDriverId((cur) => cur || r.data[0]?.driver_id || "");
    });
  }, []);

  async function submit(code) {
    if (busy || !driverId) return;
    setBusy(true); setError("");
    const r = await api("/api/login", { method: "POST", body: { driver_id: driverId, pin: code } });
    setBusy(false);
    if (!r.ok) { setError(r.data.detail || "Sign-in failed"); pinRef.current = ""; setPin(""); return; }
    onAuthed({ token: r.data.token, driver: r.data.driver });
  }
  function press(k) {
    if (busy) return;
    if (k === "del") { pinRef.current = pinRef.current.slice(0, -1); setPin(pinRef.current); return; }
    const next = (pinRef.current + k).slice(0, 4);
    pinRef.current = next;
    setPin(next);
    if (next.length === 4) submit(next);
  }

  return (
    <div className="shell">
      <TopBar onBrand={() => nav("/")} right={<LangToggle />} />
      <div className="scroll">
        <div className="page" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>🔐</div>
          <h1 className="h1" style={{ marginTop: 14 }}>{t("signin_t")}</h1>
          <p className="lede muted" style={{ marginTop: 8, fontSize: 15 }}>{t("signin_d")}</p>

          <label className="label" htmlFor="did">{t("driver")}</label>
          <select id="did" className="input" value={driverId} onChange={(e) => { setDriverId(e.target.value); pinRef.current = ""; setPin(""); setError(""); }}>
            {roster.map((d) => <option key={d.driver_id} value={d.driver_id}>{d.driver_id} · {d.name} · {d.node_id}</option>)}
          </select>

          <div style={{ display: "flex", justifyContent: "center", gap: 14, margin: "26px 0 6px" }} aria-label={`PIN, ${pin.length} of 4 digits entered`}>
            {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--ink)", background: i < pin.length ? "var(--ink)" : "transparent" }} />)}
          </div>
          <div role="alert" style={{ minHeight: 22, textAlign: "center", fontSize: 13, color: "var(--red-ink)", fontWeight: 600 }}>{error}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 300, margin: "8px auto 0" }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) => k === "" ? <span key={i} /> : (
              <button key={k} onClick={() => press(k)} disabled={busy} aria-label={k === "del" ? "Delete" : k}
                style={{ height: 58, borderRadius: 12, border: "1px solid var(--line)", background: k === "del" ? "transparent" : "var(--bg-soft)", fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>
                {k === "del" ? "⌫" : k}
              </button>
            ))}
          </div>

          <div className="callout blue" style={{ marginTop: 22 }}>
            <span className="ic">🧪</span>
            <div><b>Demo PINs</b><span>D-101 → 1234 · D-102 → 2580 · D-103 → 4321. After 5 wrong tries a driver is locked for 5 minutes. On the real truck the fingerprint/RFID scan comes first.</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 90 ? t("ago_s", { n: s }) : t("ago_m", { n: Math.round(s / 60) }); };
const inTime = (s) => (s < 90 ? t("in_s", { n: s }) : t("in_m", { n: Math.round(s / 60) }));

/* Speaks and vibrates when something the driver must act on changes. Built from data, so it can be translated. */
function useAnnouncer(node) {
  const prev = useRef({});
  useEffect(() => {
    const p = prev.current;
    const ins = node?.instruction;
    const key = ins?.key || null;
    if (key && key !== p.key) {
      if (key === "hazard") { speak(`${t("obstacle_t")}. ${t("obstacle_d")}`); vibrate([300, 150, 300, 150, 300]); }
      else if (node.row?.action === "reroute") { speak(t("reroute_t")); vibrate([200, 100, 200]); }
      else { speak(t("hold_t")); vibrate([200, 100, 200]); }
    }
    const go = node?.row?.decision === "proceed" && node.row.rule !== "CLEAR";
    if (go && !p.go) speak(t("go_t"));
    if (node?.risk?.forming_soon && !p.forming) speak(`${t("forming_t")}. ${t("forming_d")}`);
    if (node?.overspeed && !p.over) { speak(t("speed_t")); vibrate(150); }
    const near = node?.nearest?.closing && node.nearest.distance_m < 120;
    if (near && !p.near) { speak(t("prox_t", { f: node.nearest.fleet_id, d: node.nearest.distance_m })); vibrate([120, 80, 120]); }
    if (node?.forecast && !p.fc) speak(t("fc_t"));
    const sh = node?.hazards_ahead?.[0] ? node.hazards_ahead[0].fleet_id : null;
    if (sh && sh !== p.sh) { speak(t("hz_t", { d: node.hazards_ahead[0].distance_m })); vibrate([200, 100, 200]); }
    const slotKey = node?.slot ? node.slot.winner : null;
    if (slotKey && slotKey !== p.slot) speak(t("slot_t", { v: node.slot.target_kmph }));
    prev.current = { key, go, forming: node?.risk?.forming_soon, over: node?.overspeed, near, fc: Boolean(node?.forecast), sh, slot: slotKey };
  }, [node]);
}

/* ---------------- Home (tabs: Drive / Alerts / Me) ---------------- */
function Home({ token, nodeId, driverName, driverId, onSignOut }) {
  const nav = useNavigate();
  useLang();
  const { nodes, alerts, live, lastUpdate } = useDrishti(token, onSignOut);
  const [tab, setTab] = useState("drive");
  const [localAck, setLocalAck] = useState(() => new Set());

  const node = nodes.find((n) => n.node_id === nodeId);
  const level = node?.risk?.risk_level;
  const hazard = Boolean(node?.hazard_active);
  const myAlerts = useMemo(() => alerts.filter((a) => !a.node_id || a.node_id === nodeId), [alerts, nodeId]);
  const [seen, setSeen] = useState(0);
  const unread = tab === "alerts" ? 0 : Math.max(0, myAlerts.length - seen);
  useEffect(() => { if (tab === "alerts") setSeen(myAlerts.length); }, [tab, myAlerts.length]);

  useAnnouncer(node);
  useEffect(() => { if (live) flushAcks(token); }, [live, token]);
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 5000); return () => clearInterval(id); }, []);

  const ins = node?.instruction;
  const acked = Boolean(ins && (ins.acked_at || localAck.has(ins.key)));
  async function ack() {
    if (!ins) return;
    setLocalAck((s) => new Set(s).add(ins.key));   // optimistic; queued if we're offline
    vibrate(40);
    await ackInstruction(token, ins.key);
  }

  return (
    <div className="shell">
      <TopBar onBrand={() => nav("/")} right={<><LangToggle /><LiveDot live={live} /><button className="iconbtn" onClick={onSignOut} aria-label={t("sign_out")}><Icon name="logout" size={18} /></button></>} />
      {!live && <div className="banner">{lastUpdate ? t("cached", { t: ago(lastUpdate) }) : "Connecting…"}</div>}

      <div className="scroll">
        {tab === "drive" && <Drive node={node} nodeId={nodeId} driverName={driverName} level={level} hazard={hazard} ins={ins} acked={acked} ack={ack} />}
        {tab === "alerts" && <Alerts alerts={myAlerts} />}
        {tab === "me" && <Me nodeId={nodeId} driverName={driverName} driverId={driverId} onSignOut={onSignOut} />}
      </div>

      {hazard && ins?.key === "hazard" && !acked && tab !== "me" && (
        <div className="alarm" role="alertdialog" aria-label={t("obstacle_t")}>
          <div style={{ fontSize: 76 }}>🚧</div>
          <h2>{t("obstacle_t")}</h2>
          <p>{t("obstacle_d")}</p>
          <button onClick={ack}>{t("ack")}</button>
        </div>
      )}

      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "drive", label: t("tab_drive"), icon: "home" },
          { id: "alerts", label: t("tab_alerts"), icon: "bell", badge: unread },
          { id: "me", label: t("tab_me"), icon: "user" },
        ]}
      />
    </div>
  );
}

function AckButton({ acked, ack }) {
  return acked
    ? <div style={{ marginTop: 8, fontWeight: 700, color: "var(--green-ink)", fontSize: 14 }}>{t("acked")}</div>
    : <button className="btn primary" style={{ height: 38, marginTop: 10 }} onClick={ack}>{t("ack")}</button>;
}

function Drive({ node, nodeId, driverName, level, hazard, ins, acked, ack }) {
  const r = node?.risk;
  const row = node?.right_of_way;
  const near = node?.nearest && node.nearest.closing && node.nearest.distance_m < 120 ? node.nearest : null;
  const shared = !hazard && node?.hazards_ahead?.length ? node.hazards_ahead[0] : null;
  const slot = node?.slot || null;
  const fc = node?.forecast && node.forecast.eta_s < 300 ? node.forecast : null;
  const src = node?.pos_src;
  const rlabel = level ? t(`risk_${level}`) : t("risk_none");

  return (
    <div className="page">
      <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>{t("hi_name", { name: driverName })}</div>
      <h1 className="h1" style={{ marginTop: 6, fontSize: 36 }}>
        {t("fog_is")} <StatusPill level={level}>{rlabel}</StatusPill>
      </h1>
      <p className="lede muted" style={{ marginTop: 8, fontSize: 15 }}>
        {node ? `${nodeId} · ${t("spread", { v: r.dew_point_spread_c })}` : t("waiting", { n: nodeId })}
      </p>

      {shared && <Callout tone="red" icon="🚧" title={t("hz_t", { d: shared.distance_m })}>{t("hz_d", { f: shared.fleet_id })}</Callout>}
      {slot && !row && <Callout tone="blue" icon="🕒" title={t("slot_t", { v: slot.target_kmph })}>{t("slot_d", { f: slot.winner_fleet })}</Callout>}
      {hazard && <Callout tone="red" icon="🚧" title={t("obstacle_t")}>{t("obstacle_d")}<AckButton acked={acked} ack={ack} /></Callout>}
      {row === "yield" && (
        <Callout tone="amber" icon={node.row?.action === "reroute" ? "↪️" : "✋"} title={node.row?.action === "reroute" ? t("reroute_t") : t("hold_t")}>
          {node.row?.reason ? `${node.row.reason}. ` : ""}{node.row?.action_text}.
          {!hazard && <AckButton acked={acked} ack={ack} />}
        </Callout>
      )}
      {row === "proceed" && (
        <Callout tone="green" icon="✅" title={node.row && ["CLEAR", "FOLLOW", "SPACED"].includes(node.row.rule) ? t("go_free_t") : t("go_t")}>
          {node.row && node.row.rule !== "CLEAR" ? `${node.row.reason}.` : t("go_clear")}
        </Callout>
      )}
      {node?.overspeed && <Callout tone="amber" icon="🐢" title={t("speed_t")}>{t("speed_d", { v: node.advised_kmph, s: node.speed_kmph })}</Callout>}
      {near && <Callout tone="amber" icon="🚚" title={t("prox_t", { f: near.fleet_id, d: near.distance_m })}>{t("prox_d")}</Callout>}
      {fc && !hazard && <Callout tone="amber" icon="📈" title={t("fc_t")}>{t("fc_d", { when: inTime(fc.eta_s) })}</Callout>}
      {r?.forming_soon && !hazard && !fc && <Callout tone="amber" icon="📈" title={t("forming_t")}>{t("forming_d")}</Callout>}
      {level === "HIGH" && !hazard && <Callout tone="red" icon="🌫️" title={t("dense_t")}>{t("dense_d")}</Callout>}

      <div className="card" style={{ marginTop: 16 }}>
        <FogVision level={level || "LOW"} hazard={hazard} rightOfWay={row} forming={Boolean(r?.forming_soon)} sharedDist={shared ? shared.distance_m : null} />
        <div className="muted" style={{ fontSize: 12, padding: "8px 12px", borderTop: "1px solid var(--line)" }}>{t("view_note")}</div>
      </div>

      <div className="h2">{t("readings")}</div>
      <div className="props">
        <Prop icon="therm" k={t("temp")}><span className="mono">{node ? `${node.temp_c}°C` : "—"}</span></Prop>
        <Prop icon="drop" k={t("hum")}><span className="mono">{node ? `${node.humidity_pct}%` : "—"}</span></Prop>
        <Prop icon="trend" k={t("trend")}>{r ? t(`tr_${r.trend}`) : "—"}</Prop>
        <Prop icon="trend" k={t("speed")}>{node?.speed_kmph != null ? `${node.speed_kmph} km/h` : "—"}{node?.advised_kmph != null && <span className="muted"> · {t("advised")} ≤ {node.advised_kmph}</span>}</Prop>
        <Prop icon="antenna" k={t("position")}>{src ? <span>{t(`src_${src}`)}{node.pos_err_m != null && <span className="muted"> · ±{Number(node.pos_err_m).toFixed(1)} m</span>}</span> : "—"}</Prop>
        <Prop icon="truck" k={t("vehicle")}>{node?.vehicle?.vehicle_no || "—"}</Prop>
        <Prop icon="folder" k={t("load")}>{node ? (node.load?.state === "LOADED" ? `${node.load.tonnes} t ${node.load.material || ""}` : t("empty")) : "—"}</Prop>
        <Prop icon="battery" k={t("battery")}>{node?.battery_pct != null ? `${Math.round(node.battery_pct)}%` : "—"}</Prop>
      </div>
    </div>
  );
}

function Alerts({ alerts }) {
  return (
    <div className="page">
      <h1 className="h1" style={{ marginTop: 6 }}>{t("alerts_t")}</h1>
      <p className="lede muted" style={{ fontSize: 15, marginTop: 6 }}>{t("alerts_d")}</p>
      <div style={{ marginTop: 14 }}>
        {alerts.length === 0 && <div className="empty">{t("alerts_none")}</div>}
        {alerts.map((a) => (
          <div className="row" key={a.id}>
            <span className={`chip ${levelChip(a.level)}`}>{a.level}</span>
            <div className="grow"><div>{a.text}</div></div>
            <span className="muted mono" style={{ fontSize: 11 }}>{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Me({ nodeId, driverName, driverId, onSignOut }) {
  const lang = useLang();
  const [voice, setVoice] = useState(voiceEnabled());
  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
        <span className="avatar" style={{ width: 64, height: 64, borderColor: "#2383e2", margin: 0, fontWeight: 800, fontSize: 22 }}>{driverName.slice(0, 1).toUpperCase()}</span>
        <div>
          <h1 className="h1" style={{ fontSize: 24 }}>{driverName}</h1>
          <div className="muted" style={{ fontSize: 14 }}>{t("me_role")}</div>
        </div>
      </div>

      <div className="h2">{t("session")}</div>
      <div className="props">
        <Prop icon="truck" k={t("truck")}>{nodeId}</Prop>
        <Prop icon="user" k={t("driver_id")}>{driverId}</Prop>
        <Prop icon="shield" k={t("signed_via")}>{t("pin_session")}</Prop>
      </div>

      <div className="h2">{t("voice")}</div>
      <div className="seg">
        <button className={voice ? "on" : ""} onClick={() => { setVoiceEnabled(true); setVoice(true); speak(t("voice_on")); }}>{t("voice_on")}</button>
        <button className={!voice ? "on" : ""} onClick={() => { setVoiceEnabled(false); setVoice(false); }}>{t("voice_off")}</button>
      </div>
      <div className="h2">{t("language")}</div>
      <div className="seg">
        <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>English</button>
        <button className={lang === "hi" ? "on" : ""} onClick={() => setLang("hi")}>हिन्दी</button>
      </div>

      <InstallCard />
      <button className="btn ghost block" style={{ marginTop: 22 }} onClick={onSignOut}><Icon name="logout" size={18} /> {t("sign_out")}</button>
    </div>
  );
}

/* Install-as-app card: native prompt on Android/Chrome, manual hint on iOS. */
function InstallCard() {
  const [deferred, setDeferred] = useState(null);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (standalone) return null;
  return (
    <Callout tone="blue" icon="📲" title="Install DRISHTI">
      {deferred ? "Runs full-screen and still opens when signal drops." : ios ? "Tap Share, then Add to Home Screen." : "Open this page in Chrome on your phone to install it."}
      {deferred && (
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" style={{ height: 36 }} onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null); }}>Install</button>
        </div>
      )}
    </Callout>
  );
}
