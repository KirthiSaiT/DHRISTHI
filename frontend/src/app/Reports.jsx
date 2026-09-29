import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, getOperatorToken } from "../auth.js";
import LeafletMap from "./LeafletMap.jsx";
import { Icon, levelChip } from "./ui.jsx";

const dur = (s) => (s == null ? "—" : s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const RULE = { LOADED: "Loaded before empty", HEAVIER: "Heavier load first", FIRST: "First to arrive", ID: "Fixed order", CLEAR: "Curve clear" };

export default function Reports({ mapData }) {
  const [view, setView] = useState("report");
  return (
    <div className="page">
      <h1 className="h1" style={{ marginTop: 6 }}>📊 Reports</h1>
      <div className="seg" style={{ marginTop: 12 }} role="tablist">
        <button className={view === "report" ? "on" : ""} onClick={() => setView("report")}>Shift report</button>
        <button className={view === "replay" ? "on" : ""} onClick={() => setView("replay")}>Timeline replay</button>
        <button className={view === "whatif" ? "on" : ""} onClick={() => setView("whatif")}>With vs without</button>
      </div>
      {view === "report" ? <Report /> : view === "replay" ? <Replay mapData={mapData} /> : <WhatIf />}
    </div>
  );
}

function Report() {
  const [hours, setHours] = useState(1);
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let dead = false;
    const load = () => api(`/api/report?hours=${hours}`, { token: getOperatorToken() }).then((x) => { if (dead) return; x.ok ? (setR(x.data), setErr("")) : setErr(x.data.detail || "Couldn't load the report"); });
    load();
    const id = setInterval(load, 5000);
    return () => { dead = true; clearInterval(id); };
  }, [hours]);

  return (
    <>
      <div className="seg" style={{ marginTop: 10 }}>
        {[[0.25, "15 min"], [1, "1 h"], [8, "8 h"], [24, "24 h"]].map(([h, l]) => <button key={h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{l}</button>)}
      </div>
      {err && <div className="empty">{err}</div>}
      {r && (
        <>
          <div className="grid3" style={{ marginTop: 14 }}>
            <div className="stat"><div className="n">{r.hazards_raised}</div><div className="l">Hazards raised · {r.hazards_cleared} cleared</div></div>
            <div className="stat"><div className="n">{r.right_of_way_decisions}</div><div className="l">Right-of-way calls · {r.reroutes} reroutes</div></div>
            <div className="stat"><div className="n">{r.gps_shadow_corrections}</div><div className="l">GPS-shadow fixes</div></div>
          </div>

          <div className="grid3" style={{ marginTop: 10 }}>
            <div className="stat"><div className="n">{r.hazards_shared}</div><div className="l">Obstacle warnings sent to other trucks</div></div>
            <div className="stat"><div className="n">{r.speed_nudges}</div><div className="l">Curves planned by speed advice</div></div>
            <div className="stat"><div className="n">{r.proximity_warnings}</div><div className="l">Proximity warnings</div></div>
          </div>

          <div className="h2">Fog exposure by station</div>
          {Object.keys(r.stations).map((sid) => {
            const f = r.fog_seconds_by_station[sid] || { LOW: 0, MEDIUM: 0, HIGH: 0 };
            const tot = f.LOW + f.MEDIUM + f.HIGH || 1;
            return (
              <div key={sid} style={{ margin: "0 0 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <b>{r.stations[sid]}</b><span className="muted">{dur(f.MEDIUM)} fog risk · {dur(f.HIGH)} dense</span>
                </div>
                <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 6, background: "var(--bg-hover)" }} role="img" aria-label={`${sid}: ${dur(f.MEDIUM)} risk, ${dur(f.HIGH)} dense`}>
                  <span style={{ width: `${(f.LOW / tot) * 100}%`, background: "var(--green)" }} />
                  <span style={{ width: `${(f.MEDIUM / tot) * 100}%`, background: "var(--amber)" }} />
                  <span style={{ width: `${(f.HIGH / tot) * 100}%`, background: "var(--red)" }} />
                </div>
              </div>
            );
          })}
          {!Object.keys(r.stations).length && <div className="empty">No station data yet.</div>}
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Demo data runs on compressed time, so these are seconds and minutes rather than shift-hours.</p>

          <div className="h2">Right-of-way by rule</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(r.by_rule).map(([k, v]) => <span key={k} className="chip blue" style={{ fontSize: 12, padding: "4px 9px" }}>{RULE[k] || k} · {v}</span>)}
            {!Object.keys(r.by_rule).length && <span className="muted" style={{ fontSize: 13 }}>No contested curves yet.</span>}
          </div>

          <div className="h2">Trucks</div>
          {Object.entries(r.fleet).map(([id, f]) => {
            const t = r.trucks[id] || {};
            return (
              <div className="card pad" key={id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>{f.vehicle_no}</b><span className="muted" style={{ fontSize: 13 }}>{f.driver}</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 8, fontSize: 13 }}>
                  <span className="muted">Deliveries</span><b>{t.deliveries ?? 0} · {t.tonnes ?? 0} t</b>
                  <span className="muted">Avg cycle time</span><b>{dur(t.avg_cycle_s)}</b>
                  <span className="muted">Over-speed events</span><b>{t.overspeed ?? 0}</b>
                  <span className="muted">Avg time to acknowledge</span><b>{dur(t.avg_ack_s)}</b>
                </div>
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: 12 }}>Proximity warnings: {r.proximity_warnings} · Holds: {r.holds}</p>
        </>
      )}
    </>
  );
}

function Replay({ mapData }) {
  const [secs, setSecs] = useState(300);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  useEffect(() => {
    let dead = false;
    setData(null);
    api(`/api/replay?seconds=${secs}`, { token: getOperatorToken() }).then((x) => {
      if (dead) return;
      if (!x.ok) { setErr(x.data.detail || "Couldn't load history"); return; }
      setErr(""); setData(x.data); setI(0); setPlaying(false);
    });
    return () => { dead = true; };
  }, [secs]);

  const frames = data?.frames || [];
  const timer = useRef();
  useEffect(() => {
    clearInterval(timer.current);
    if (!playing || !frames.length) return;
    timer.current = setInterval(() => setI((x) => (x + 1 >= frames.length ? (setPlaying(false), x) : x + 1)), 1000 / speed);
    return () => clearInterval(timer.current);
  }, [playing, speed, frames.length]);

  // forward-fill each truck's last known state so a missing sample never makes a truck vanish
  const nodes = useMemo(() => {
    const last = {};
    for (let k = 0; k <= i && k < frames.length; k++) frames[k].nodes.forEach((n) => { last[n.node_id] = n; });
    return Object.values(last).map((n) => ({
      node_id: n.node_id, lat: n.lat, lon: n.lon, pos_src: n.pos_src, hazard_active: n.hazard,
      risk: { risk_level: n.risk }, load: { state: n.load_state, tonnes: n.load_t }, vehicle: data?.fleet?.[n.node_id],
    }));
  }, [frames, i, data]);

  const t0 = frames[0]?.t, tNow = frames[i]?.t;
  const evs = (data?.events || []).filter((e) => tNow && e.t <= tNow + 1).slice(-6).reverse();
  const clock = (t) => new Date(t * 1000).toLocaleTimeString("en-IN", { hour12: false });

  return (
    <>
      <div className="seg" style={{ marginTop: 10 }}>
        {[[120, "2 min"], [300, "5 min"], [900, "15 min"]].map(([s, l]) => <button key={s} className={secs === s ? "on" : ""} onClick={() => setSecs(s)}>{l}</button>)}
      </div>
      {err && <div className="empty">{err}</div>}
      {!err && !frames.length && <div className="empty">{data ? "No movement recorded in this window yet." : "Loading history…"}</div>}
      {frames.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <LeafletMap nodes={nodes} mapData={mapData} height={280} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <button className="btn primary" style={{ height: 40, padding: "0 16px" }} onClick={() => { if (i + 1 >= frames.length) setI(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"}>
              <Icon name={playing ? "pause" : "play"} size={16} fill="currentColor" />
            </button>
            <input type="range" min={0} max={frames.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(+e.target.value); }} style={{ flex: 1 }} aria-label="Timeline position" />
            <button className="btn ghost" style={{ height: 40, padding: "0 12px" }} onClick={() => setSpeed((s) => (s === 1 ? 4 : s === 4 ? 10 : 1))}>{speed}×</button>
          </div>
          <div className="muted mono" style={{ fontSize: 12, marginTop: 6, textAlign: "center" }}>{clock(tNow)} · {Math.round(tNow - t0)} s into the replay</div>

          <div className="h2">What happened</div>
          {evs.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nothing yet at this point in the timeline.</div>}
          {evs.map((e, k) => (
            <div className="row" key={k}>
              <span className={`chip ${levelChip(e.level)}`}>{e.level}</span>
              <div className="grow"><div>{e.text}</div></div>
              <span className="muted mono" style={{ fontSize: 11 }}>{clock(e.t)}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}


/* ---------------- With vs without DRISHTI (simulation) ---------------- */
const COLS = [["baseline", "Without DRISHTI"], ["coord_only", "Curve plan only"], ["drishti", "Full DRISHTI"]];
const SERIES_COLOR = { baseline: "var(--red)", coord_only: "var(--amber)", drishti: "var(--green)" };

function WhatIf() {
  const [q, setQ] = useState({ severity: "moderate", minutes: 30, dense: 5, standoff: 45 });
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let dead = false;
    setErr("");
    api(`/api/whatif?minutes=${q.minutes}&severity=${q.severity}&dense_kmph=${q.dense}&standoff_s=${q.standoff}`, { token: getOperatorToken() }).then((x) => {
      if (dead) return;
      x.ok ? setR(x.data) : setErr(x.data.detail || "Couldn't run the comparison");
    });
    return () => { dead = true; };
  }, [q]);

  const seg = (key, opts) => (
    <div className="seg" style={{ marginTop: 6 }}>
      {opts.map(([v, l]) => <button key={v} className={q[key] === v ? "on" : ""} onClick={() => setQ({ ...q, [key]: v })}>{l}</button>)}
    </div>
  );
  const best = (k, lowerBetter) => {
    if (!r) return null;
    const vals = COLS.map(([c]) => r[c][k]).filter((v) => v != null);
    return lowerBetter ? Math.min(...vals) : Math.max(...vals);
  };
  const rows = [
    ["Tonnes hauled", "tonnes", false, (v) => `${v} t`],
    ["Minutes trucks were stopped", "stopped_min", true, (v) => `${v}`],
    ["Head-on meetings in the curve", "head_on_meetings", true, (v) => `${v}`],
    ["Average cycle time", "avg_cycle_s", true, (v) => (v == null ? "—" : `${Math.round(v / 60 * 10) / 10} min`)],
    ["Empty trucks sent by the bypass", "bypass_uses", false, (v) => `${v}`],
  ];

  // cumulative-tonnes chart
  const W = 320, H = 110, maxT = r ? Math.max(1, ...COLS.map(([c]) => r[c].tonnes)) : 1, maxS = r ? r.minutes * 60 : 1;
  const pts = (arr) => arr.map(([t, v]) => `${(t / maxS) * W},${H - (v / maxT) * (H - 6) - 3}`).join(" ");

  return (
    <>
      <div className="callout blue" style={{ marginTop: 12 }}>
        <span className="ic">🧪</span>
        <div><b>This is a simulation, not field data</b><span>The same 3 trucks drive the same road through the same fog three ways. The assumptions are listed below the results, and you can change them.</span></div>
      </div>

      <label className="label">Fog</label>
      {seg("severity", [["light", "Light"], ["moderate", "Moderate"], ["heavy", "Heavy"]])}
      <label className="label">Length of the shift being simulated</label>
      {seg("minutes", [[15, "15 min"], [30, "30 min"], [60, "60 min"]])}
      <label className="label">Speed drivers manage in dense fog today</label>
      {seg("dense", [[0, "Halt"], [5, "5 km/h"], [10, "10 km/h"]])}
      <label className="label">Time lost when two trucks meet head-on in the curve</label>
      {seg("standoff", [[15, "15 s"], [45, "45 s"], [90, "90 s"]])}

      {err && <div className="empty">{err}</div>}
      {!r && !err && <div className="empty">Running the comparison…</div>}
      {r && (
        <>
          <div className="h2">Results</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 4px", color: "var(--ink-3)", fontWeight: 600 }}></th>
                  {COLS.map(([c, l]) => <th key={c} style={{ textAlign: "right", padding: "6px 4px", fontWeight: 700 }}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, k, low, fmt]) => (
                  <tr key={k} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "8px 4px", color: "var(--ink-3)" }}>{label}</td>
                    {COLS.map(([c]) => {
                      const v = r[c][k];
                      const isBest = k !== "bypass_uses" && v != null && v === best(k, low);
                      return <td key={c} style={{ textAlign: "right", padding: "8px 4px", fontWeight: isBest ? 800 : 500, color: isBest ? "var(--green-ink)" : undefined }}>{fmt(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="h2">Tonnes hauled over the shift</div>
          <div className="card pad">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative tonnes hauled for each policy">
              {COLS.map(([c]) => <polyline key={c} points={pts(r[c].series)} fill="none" stroke={SERIES_COLOR[c]} strokeWidth="2.5" strokeLinejoin="round" />)}
            </svg>
            <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap", marginTop: 6 }}>
              {COLS.map(([c, l]) => <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLOR[c] }} />{l}</span>)}
            </div>
          </div>

          <div className="h2">What this means</div>
          {r.insights.map((t, i) => <div className="row" key={i} style={{ alignItems: "flex-start" }}><span style={{ fontSize: 16 }}>•</span><div className="grow">{t}</div></div>)}

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Assumptions behind these numbers</summary>
            <ul style={{ paddingLeft: 18, color: "var(--ink-2)", fontSize: 13, lineHeight: 1.5 }}>{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </details>
        </>
      )}
    </>
  );
}
