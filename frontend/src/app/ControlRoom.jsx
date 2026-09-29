import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignIn, useAuth, useUser } from "@clerk/react";
import { useDrishti } from "../hooks/useDrishti.js";
import { api, getOperatorToken, setOperatorToken } from "../auth.js";
import { apiBase } from "../config.js";
import LeafletMap from "./LeafletMap.jsx";
import TruckSheet from "./TruckSheet.jsx";
import Dispatch from "./Dispatch.jsx";
import Reports from "./Reports.jsx";
import { openInOrganicMaps } from "./organic.js";
import { Callout, Icon, LiveDot, StatusPill, TabBar, TopBar, levelChip, riskOf, secsAgo } from "./ui.jsx";

const RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const fmtEta = (s) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

export default function ControlRoom({ clerkEnabled }) {
  // If a Clerk key is configured the person signs in with Clerk first; the operator PIN then protects the API.
  return clerkEnabled ? <ClerkGate /> : <OperatorGate who="Operator" />;
}

function ClerkGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  if (!isLoaded) return <div className="shell"><div className="empty" style={{ margin: "auto" }}>Loading…</div></div>;
  if (!isSignedIn) {
    return (
      <div className="shell"><div className="scroll" style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <SignIn routing="hash" appearance={{ variables: { colorPrimary: "#0075de", borderRadius: "8px", fontFamily: "Inter, sans-serif" } }} />
      </div></div>
    );
  }
  return <OperatorGate who={user?.firstName || user?.username || "Operator"} />;
}

/* ---------------- Operator PIN sign-in ---------------- */
function OperatorGate({ who }) {
  const [token, setToken] = useState(getOperatorToken());
  const save = (t) => { setOperatorToken(t); setToken(t); };
  if (!token) return <OperatorSignIn onAuthed={save} />;
  return <Console who={who} token={token} onSignOut={() => save("")} />;
}

function OperatorSignIn({ onAuthed }) {
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const pinRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(code) {
    setBusy(true); setError("");
    const r = await api("/api/operator/login", { method: "POST", body: { pin: code } });
    setBusy(false);
    if (!r.ok) { setError(r.data.detail || "Sign-in failed"); pinRef.current = ""; setPin(""); return; }
    onAuthed(r.data.token);
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
      <TopBar onBrand={() => nav("/")} right={<span className="chip">Control room</span>} />
      <div className="scroll">
        <div className="page" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>🛰️</div>
          <h1 className="h1" style={{ marginTop: 14 }}>Operator sign-in</h1>
          <p className="lede muted" style={{ marginTop: 8, fontSize: 15 }}>Enter the 4-digit control-room PIN.</p>
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
            <div><b>Demo PIN</b><span>9999. Set <span className="mono">DRISHTI_OPERATOR_PIN</span> on the server to change it. Five wrong tries lock sign-in for 5 minutes.</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Console ---------------- */
function Console({ who, token, onSignOut }) {
  const nav = useNavigate();
  const { nodes, stations, segments, hazards: hazardPins, alerts, auth_log: authLog, demo, live, sendOverride } = useDrishti(token, onSignOut);
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    let dead = false;
    const load = () => fetch(`${apiBase()}/api/map`).then((r) => r.json()).then((m) => !dead && setMapData(m)).catch(() => !dead && setTimeout(load, 3000));
    load();
    return () => { dead = true; };
  }, []);

  const sheetNode = nodes.find((n) => n.node_id === selected) || null;
  const worst = useMemo(() => {
    if (!nodes.length) return null;
    return nodes.find((n) => n.hazard_active) || [...nodes].sort((a, b) => (RANK[b.risk?.risk_level] ?? -1) - (RANK[a.risk?.risk_level] ?? -1))[0];
  }, [nodes]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const dangerCount = alerts.filter((a) => a.level === "danger").length;
  const [seenDanger, setSeenDanger] = useState(0);
  useEffect(() => { if (tab === "alerts") setSeenDanger(dangerCount); }, [tab, dangerCount]);
  const badge = tab === "alerts" ? 0 : Math.max(0, dangerCount - seenDanger);

  async function act(action, node_id, msg) {
    const r = await sendOverride(action, node_id);
    setToast(r?.ok ? msg : "Couldn't complete that action");
  }
  async function scenario(name, node_id, msg) {
    const r = await api("/api/demo", { method: "POST", token, body: { scenario: name, node_id } });
    setToast(r.ok ? msg : r.data.detail || "Couldn't run that scenario");
  }

  return (
    <div className="shell">
      <TopBar onBrand={() => nav("/")} right={<><LiveDot live={live} /><button className="avatar" onClick={onSignOut} aria-label="Sign out" title={`${who} — tap to sign out`} style={{ width: 30, height: 30, margin: "0 0 0 4px", borderWidth: 2, borderColor: "#2383e2", fontSize: 12, fontWeight: 700 }}>{who.slice(0, 1).toUpperCase()}</button></>} />
      {!live && <div className="banner">Reconnecting — showing last known state</div>}

      <div className="scroll">
        {tab === "overview" && <Overview nodes={nodes} stations={stations} segments={segments} hazardPins={hazardPins} mapData={mapData} selected={selected} onSelect={setSelected} who={who} />}
        {tab === "alerts" && <AlertsTab alerts={alerts} authLog={authLog} />}
        {tab === "dispatch" && <Dispatch nodes={nodes} onToast={setToast} />}
        {tab === "reports" && <Reports mapData={mapData} />}
        {tab === "control" && <ControlTab nodes={nodes} focus={sheetNode || worst} onSelect={setSelected} act={act} scenario={scenario} demo={demo} />}
      </div>

      {tab === "overview" && <TruckSheet node={sheetNode} onClose={() => setSelected(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Map", icon: "map" },
          { id: "alerts", label: "Alerts", icon: "bell", badge },
          { id: "dispatch", label: "Dispatch", icon: "truck" },
          { id: "reports", label: "Reports", icon: "chart" },
          { id: "control", label: "Control", icon: "sliders" },
        ]}
      />
    </div>
  );
}

function Overview({ nodes, stations, segments, hazardPins = [], mapData, selected, onSelect, who }) {
  const high = nodes.filter((n) => n.risk?.risk_level === "HIGH").length;
  const hazards = nodes.filter((n) => n.hazard_active).length;
  const all = [...nodes.map((n) => n.risk?.risk_level), ...stations.map((s) => s.risk?.risk_level)];
  const overall = all.length ? (all.includes("HIGH") ? "HIGH" : all.includes("MEDIUM") ? "MEDIUM" : "LOW") : undefined;
  const loadedN = nodes.filter((n) => n.load?.state === "LOADED").length;
  const yielding = nodes.filter((n) => n.row?.decision === "yield");
  const forecasts = stations.filter((s) => s.forecast && s.forecast.eta_s < 300);
  const unacked = nodes.filter((n) => n.instruction && !n.instruction.acked_at && _age(n.instruction.since) > 8);

  return (
    <div className="page" style={{ paddingBottom: selected ? 420 : 28 }}>
      <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>Hi {who} · Bailadila haul road</div>
      <h1 className="h1" style={{ marginTop: 6, fontSize: 34 }}>
        Road is{" "}
        <StatusPill level={overall}>{overall ? riskOf(overall).label : "—"}</StatusPill>
      </h1>

      {(() => {
        const notices = [
          ...(hazards > 0 ? [<Callout key="haz" tone="red" icon="🚧" title={`${hazards} active hazard${hazards > 1 ? "s" : ""}`}>Clear them from the Control tab once confirmed removed.</Callout>] : []),
          ...unacked.map((n) => <Callout key={"ack" + n.node_id} tone="red" icon="⏳" title={`${n.vehicle?.fleet_id} hasn't acknowledged`}>{n.instruction.text}</Callout>),
          ...forecasts.map((s) => <Callout key={s.station_id} tone="amber" icon="📈" title={`Dense fog at ${s.name} in ~${fmtEta(s.forecast.eta_s)}`}>Humidity rising {s.forecast.rate_hum_pct_per_min}%/min. Reroute empty trucks before they arrive.</Callout>),
          ...nodes.filter((n) => n.slot).map((n) => <Callout key={"slot" + n.node_id} tone="blue" icon="🕒" title={`${n.vehicle?.fleet_id} easing to ${n.slot.target_kmph} km/h`}>{n.slot.winner_fleet} clears the curve first, so no stop is needed.</Callout>),
          ...yielding.map((n) => <Callout key={"y" + n.node_id} tone="amber" icon={n.row.action === "reroute" ? "↪️" : "✋"} title={`${n.vehicle?.fleet_id || n.node_id} ${n.row.action === "reroute" ? "rerouting via bypass" : "holding at bay"}`}>{n.row.reason}.</Callout>),
        ];
        return <>{notices.slice(0, 3)}{notices.length > 3 && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>+{notices.length - 3} more — see the Alerts and Control tabs</div>}</>;
      })()}

      <div className="grid3" style={{ marginTop: 16 }}>
        <div className="stat"><div className="n">{nodes.length}</div><div className="l">Trucks online</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--blue)" }}>{loadedN}</div><div className="l">Loaded</div></div>
        <div className="stat"><div className="n" style={{ color: high || hazards ? "var(--red)" : undefined }}>{high + hazards}</div><div className="l">Fog / hazard</div></div>
      </div>

      <div className="h2">Live map · tap a truck</div>
      <div className="card" style={{ position: "relative" }}>
        <LeafletMap nodes={nodes} stations={stations} segments={segments} hazards={hazardPins} mapData={mapData} selected={selected} onSelect={onSelect} />
        <div style={{ display: "flex", gap: 12, padding: "9px 12px", fontSize: 12, color: "var(--ink-3)", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
          {[["LOW", "Clear", "#1aae39"], ["MEDIUM", "Fog risk", "#dd8a00"], ["HIGH", "Dense fog", "#e03e3e"]].map(([l, t, c]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{t}</span>
          ))}
          <span>┄ bypass</span><span>📡 beacon · red band = GPS shadow · 🚧 obstacle</span>
        </div>
      </div>
      {mapData && (
        <button className="btn soft block" style={{ marginTop: 10 }} onClick={() => openInOrganicMaps(mapData.pit.pos[0], mapData.pit.pos[1], "Pit 14 haul road")}>
          <Icon name="map" size={18} /> Open haul road in Organic Maps
        </button>
      )}

      <div className="h2">Trucks</div>
      {nodes.length === 0 && <div className="empty">No trucks reporting yet.<br />Start the simulator or connect the ESP32.</div>}
      {nodes.map((n) => (
        <button key={n.node_id} className={`row ${selected === n.node_id ? "sel" : ""}`} onClick={() => onSelect(n.node_id)}>
          <span style={{ fontSize: 22 }}>🚚</span>
          <div className="grow">
            <div className="t">{n.vehicle?.vehicle_no || n.node_id}{n.hazard_active && <span className="chip red" style={{ marginLeft: 8 }}>Hazard</span>}{n.overspeed && <span className="chip amber" style={{ marginLeft: 8 }}>Speed</span>}</div>
            <div className="s">{n.driver?.name} · {n.load?.state === "LOADED" ? `Loaded ${n.load.tonnes} t` : "Empty"} · {secsAgo(n.last_seen)}</div>
          </div>
          <StatusPill level={n.risk?.risk_level} small />
        </button>
      ))}
    </div>
  );
}
const _age = (t) => Date.now() / 1000 - t;

function AlertsTab({ alerts, authLog }) {
  return (
    <div className="page">
      <h1 className="h1" style={{ marginTop: 6 }}>🔔 Alert feed</h1>
      <div style={{ marginTop: 12 }}>
        {alerts.length === 0 && <div className="empty">No alerts yet.</div>}
        {alerts.map((a) => (
          <div className="row" key={a.id}>
            <span className={`chip ${levelChip(a.level)}`}>{a.level}</span>
            <div className="grow"><div>{a.text}</div></div>
            <span className="muted mono" style={{ fontSize: 11 }}>{a.time}</span>
          </div>
        ))}
      </div>

      <div className="h2">Driver sign-ins</div>
      {authLog.length === 0 && <div className="empty">No sign-in events.</div>}
      {authLog.map((a) => (
        <div className="row" key={a.id}>
          <span style={{ fontSize: 18 }}>{a.success ? "✅" : "⚠️"}</span>
          <div className="grow">
            <div className="t">{a.driver_id}</div>
            <div className="s">{a.node_id} · {a.method}</div>
          </div>
          <span className="muted mono" style={{ fontSize: 11 }}>{a.time}</span>
        </div>
      ))}
    </div>
  );
}

const RULES = [
  ["Loaded before empty", "A loaded truck is heavy, brakes slowly and climbs slowly — and its cargo is why the road exists. It goes first."],
  ["Heavier load first", "If both are loaded, the heavier one needs more stopping distance, so it goes first."],
  ["First to arrive", "Same load: whoever reached the curve first goes first."],
  ["Fixed order", "Still tied: the lowest truck ID goes first, so the answer is never random."],
];

function ControlTab({ nodes, focus, onSelect, act, scenario, demo }) {
  const zones = useMemo(() => {
    const z = {};
    nodes.forEach((n) => { if (n.row) (z[n.row.zone] = z[n.row.zone] || []).push(n); });
    return Object.entries(z).filter(([, list]) => list.length > 1);
  }, [nodes]);

  return (
    <div className="page">
      <h1 className="h1" style={{ marginTop: 6 }}>🎛️ Control</h1>

      <div className="h2" style={{ marginTop: 18 }}>Right-of-way right now</div>
      {zones.length === 0 && <div className="empty" style={{ padding: "14px 4px", textAlign: "left" }}>No trucks are contesting a curve.</div>}
      {zones.map(([zone, list]) => (
        <div className="card pad" key={zone} style={{ marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{zone}</div>
          {[...list].sort((a, b) => (a.row.decision === "proceed" ? -1 : 1) - (b.row.decision === "proceed" ? -1 : 1)).map((n) => (
            <div key={n.node_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", marginTop: 8 }}>
              <span className={`chip ${n.row.decision === "proceed" ? "green" : "amber"}`}>{n.row.decision === "proceed" ? "GO" : n.row.action === "reroute" ? "BYPASS" : "HOLD"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{n.vehicle?.vehicle_no} · {n.load?.state === "LOADED" ? `${n.load.tonnes} t` : "Empty"}</div>
                <div className="muted" style={{ fontSize: 12 }}>{n.row.decision === "yield" ? n.row.action_text : n.row.reason}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="h2">Demo scenarios</div>
      <div className="card pad">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {demo?.fog
            ? <button className="btn soft" style={{ height: 38 }} onClick={() => scenario("fog_off", null, "Fog released")}>Release fog</button>
            : <button className="btn primary" style={{ height: 38 }} onClick={() => scenario("fog_on", null, "Dense fog forced on all sensors")}>Force dense fog</button>}
          <button className="btn soft" style={{ height: 38 }} disabled={!focus} onClick={() => scenario("obstacle", focus.node_id, `Obstacle dropped in front of ${focus.node_id}`)}>Drop obstacle{focus ? ` · ${focus.node_id}` : ""}</button>
          <button className="btn ghost" style={{ height: 38 }} onClick={() => scenario("reset", null, "Scenarios reset")}>Reset</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
          Force fog, then watch the empty truck lose the curve and take the bypass. Drop an obstacle to trigger the driver's full-screen alarm and acknowledgement.
        </p>
      </div>

      <div className="h2">How priority is decided</div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {RULES.map(([t, d], i) => (
          <li key={t} className="row" style={{ alignItems: "flex-start" }}>
            <span className="avatar" style={{ width: 28, height: 28, margin: 0, borderWidth: 2, fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
            <div className="grow"><div className="t">{t}</div><div className="s">{d}</div></div>
          </li>
        ))}
      </ol>
      <Callout tone="blue" icon="↪️" title="What the waiting truck does">
        It holds at the bay until the winner clears the curve. If fog is dense and the waiting truck is empty, it takes the bypass instead of waiting blind.
      </Callout>

      <div className="h2">Manual override</div>
      <label className="label" htmlFor="sel" style={{ marginTop: 0 }}>Truck</label>
      <select id="sel" className="input" value={focus?.node_id || ""} onChange={(e) => onSelect(e.target.value)} disabled={!nodes.length}>
        {!nodes.length && <option value="">No trucks online</option>}
        {nodes.map((n) => <option key={n.node_id} value={n.node_id}>{n.vehicle?.vehicle_no || n.node_id}</option>)}
      </select>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        <button className="btn danger block" disabled={!focus?.hazard_active} onClick={() => act("clear_hazard", focus.node_id, `Hazard cleared on ${focus.node_id}`)}>
          Clear hazard{focus ? ` — ${focus.node_id}` : ""}
        </button>
        <button className="btn soft block" disabled={!focus} onClick={() => act("simulate_reroute", focus.node_id, "Reroute simulated")}>
          <Icon name="arrow" size={18} /> Simulate reroute
        </button>
      </div>
    </div>
  );
}
