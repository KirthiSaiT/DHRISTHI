import React, { useEffect, useState } from "react";
import { api, getOperatorToken } from "../auth.js";
import { Icon } from "./ui.jsx";

const MATERIALS = ["Iron ore lump", "Iron ore fines", "Blue dust"];
const dur = (s) => (s == null ? "—" : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

/* Dispatch: see what each truck is carrying, assign the next load, mark deliveries. */
export default function Dispatch({ nodes, onToast }) {
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ tonnes: 90, material: MATERIALS[0], destination: "Primary crusher" });
  const [stats, setStats] = useState({});

  useEffect(() => {
    let dead = false;
    const load = () => api("/api/report?hours=24", { token: getOperatorToken() }).then((x) => { if (!dead && x.ok) setStats(x.data.trucks || {}); });
    load();
    const id = setInterval(load, 8000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  async function send(node_id, loaded) {
    const r = await api("/api/load", { method: "POST", token: getOperatorToken(), body: { node_id, loaded, tonnes: loaded ? Number(form.tonnes) : 0, material: loaded ? form.material : null, origin: loaded ? "Pit 14" : "Primary crusher", destination: loaded ? form.destination : "Pit 14" } });
    onToast(r.ok ? (loaded ? `Load assigned to ${node_id}` : `${node_id} marked empty`) : (r.data.detail || "Couldn't update the load"));
    if (r.ok) setOpen(null);
  }

  const loadedN = nodes.filter((n) => n.load?.state === "LOADED");
  const inTransit = loadedN.reduce((a, n) => a + (n.load.tonnes || 0), 0);

  return (
    <div className="page">
      <h1 className="h1" style={{ marginTop: 6 }}>🚚 Dispatch</h1>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="stat"><div className="n">{nodes.length}</div><div className="l">Trucks</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--blue)" }}>{loadedN.length}</div><div className="l">Loaded</div></div>
        <div className="stat"><div className="n">{Math.round(inTransit)}</div><div className="l">Tonnes in transit</div></div>
      </div>

      <div className="h2">Fleet</div>
      {nodes.length === 0 && <div className="empty">No trucks online.</div>}
      {nodes.map((n) => {
        const ld = n.load || {};
        const loaded = ld.state === "LOADED";
        const s = stats[n.node_id] || {};
        return (
          <div className="card pad" key={n.node_id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>🚚</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{n.vehicle?.vehicle_no}</div>
                <div className="muted" style={{ fontSize: 13 }}>{n.driver?.name} · {loaded ? `${ld.tonnes} t ${ld.material || ""}` : "Empty"} · {ld.origin} → {ld.destination}</div>
              </div>
              <span className={`chip ${loaded ? "blue" : ""}`}>{loaded ? "Loaded" : "Empty"}</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Today: {s.deliveries ?? 0} deliveries · {s.tonnes ?? 0} t · avg cycle {dur(s.avg_cycle_s)}</div>
            {open === n.node_id ? (
              <div style={{ marginTop: 10 }}>
                <label className="label" htmlFor={`t-${n.node_id}`} style={{ marginTop: 0 }}>Tonnes</label>
                <input id={`t-${n.node_id}`} className="input" type="number" min="1" max={n.vehicle?.capacity_t || 120} value={form.tonnes} onChange={(e) => setForm({ ...form, tonnes: e.target.value })} />
                <label className="label" htmlFor={`m-${n.node_id}`}>Material</label>
                <select id={`m-${n.node_id}`} className="input" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}>{MATERIALS.map((m) => <option key={m}>{m}</option>)}</select>
                <label className="label" htmlFor={`d-${n.node_id}`}>Destination</label>
                <input id={`d-${n.node_id}`} className="input" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn primary" style={{ flex: 1 }} onClick={() => send(n.node_id, true)}><Icon name="send" size={16} /> Assign load</button>
                  <button className="btn ghost" onClick={() => setOpen(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn soft" style={{ flex: 1, height: 38 }} onClick={() => { setOpen(n.node_id); setForm((f) => ({ ...f, tonnes: Math.min(f.tonnes, n.vehicle?.capacity_t || 100) })); }}>Assign load</button>
                <button className="btn ghost" style={{ flex: 1, height: 38 }} disabled={!loaded} onClick={() => send(n.node_id, false)}>Mark delivered</button>
              </div>
            )}
          </div>
        );
      })}
      <p className="muted" style={{ fontSize: 12 }}>The demo simulator also flips loads at the pit and crusher on its own.</p>
    </div>
  );
}
