import React from "react";
import { Icon, Prop, StatusPill, secsAgo } from "./ui.jsx";
import { openInOrganicMaps } from "./organic.js";

const SRC = {
  GPS: ["GPS", ""],
  BEACON: ["Beacon-corrected", "green"],
  GPS_DEGRADED: ["GPS weak (<3 beacons)", "red"],
};
const fmtEta = (s) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

/* Bottom sheet shown when a truck is tapped on the map. */
export default function TruckSheet({ node, onClose }) {
  if (!node) return null;
  const ld = node.load || {};
  const loaded = ld.state === "LOADED";
  const row = node.row;
  const src = SRC[node.pos_src];
  const ins = node.instruction;
  return (
    <div className="sheet" role="dialog" aria-label={`Details for ${node.vehicle?.vehicle_no || node.node_id}`}>
      <div className="sheet-grab" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{node.vehicle?.fleet_id} · {node.node_id}</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{node.vehicle?.vehicle_no || node.node_id}</div>
          <div className="muted" style={{ fontSize: 13 }}>{node.vehicle?.model}{node.vehicle?.capacity_t ? ` · ${node.vehicle.capacity_t} t` : ""}</div>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close details" style={{ fontSize: 18 }}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "12px 0 4px", flexWrap: "wrap" }}>
        <span className={`chip ${loaded ? "blue" : ""}`} style={{ fontSize: 12, padding: "4px 9px" }}>{loaded ? `Loaded · ${ld.tonnes} t` : "Empty"}</span>
        <StatusPill level={node.risk?.risk_level} small />
        {node.hazard_active && <span className="chip red" style={{ fontSize: 12, padding: "4px 9px" }}>Obstacle</span>}
        {node.overspeed && <span className="chip amber" style={{ fontSize: 12, padding: "4px 9px" }}>Over speed</span>}
      </div>

      {ins && (
        <div className={`callout ${ins.acked_at ? "green" : "amber"}`} style={{ margin: "10px 0 0" }}>
          <span className="ic">{ins.acked_at ? "✅" : "⏳"}</span>
          <div><b>{ins.acked_at ? "Driver acknowledged" : "Waiting for driver to acknowledge"}</b><span>{ins.text}{ins.acked_at ? ` — after ${Math.round(ins.acked_at - ins.since)} s` : ""}</span></div>
        </div>
      )}

      {row && row.rule !== "CLEAR" && (
        <div className={`callout ${row.decision === "yield" ? "amber" : "green"}`} style={{ margin: "10px 0 0" }}>
          <span className="ic">{row.decision === "yield" ? (row.action === "reroute" ? "↪️" : "✋") : "✅"}</span>
          <div><b>{row.decision === "yield" ? (row.action === "reroute" ? "Rerouting via bypass" : "Holding at bay") : "Has right-of-way"}</b><span>{row.reason}. {row.action_text}.</span></div>
        </div>
      )}

      {node.hazards_ahead?.length > 0 && (
        <div className="callout red" style={{ margin: "10px 0 0" }}>
          <span className="ic">🚧</span>
          <div><b>Obstacle {node.hazards_ahead[0].distance_m} m ahead</b><span>Reported by {node.hazards_ahead[0].fleet_id}. Warning sent to this driver.</span></div>
        </div>
      )}

      {node.slot && (
        <div className="callout blue" style={{ margin: "10px 0 0" }}>
          <span className="ic">🕒</span>
          <div><b>Curve planned: easing to {node.slot.target_kmph} km/h</b><span>{node.slot.winner_fleet} clears the blind curve first, so this truck arrives after it. No stop needed.</span></div>
        </div>
      )}

      {node.forecast && (
        <div className="callout amber" style={{ margin: "10px 0 0" }}>
          <span className="ic">📈</span>
          <div><b>Dense fog forecast in ~{fmtEta(node.forecast.eta_s)}</b><span>Humidity rising {node.forecast.rate_hum_pct_per_min}%/min (confidence {Math.round(node.forecast.confidence * 100)}%).</span></div>
        </div>
      )}

      <div className="props" style={{ marginTop: 10 }}>
        <Prop icon="user" k="Driver">{node.driver?.name}{node.driver?.driver_id ? <span className="muted"> · {node.driver.driver_id}</span> : null}</Prop>
        <Prop icon="truck" k="Vehicle no.">{node.vehicle?.vehicle_no}</Prop>
        <Prop icon="folder" k="Load">{loaded ? `${ld.tonnes} t ${ld.material || ""}` : "None"}</Prop>
        <Prop icon="pin" k="Trip">{ld.origin} → {ld.destination}</Prop>
        <Prop icon="trend" k="Speed">{node.speed_kmph != null ? `${node.speed_kmph} km/h` : "—"}<span className="muted"> · advised ≤ {node.advised_kmph}</span></Prop>
        <Prop icon="antenna" k="Position">{src ? <span>{src[0]}{node.pos_err_m != null ? <span className="muted"> · ±{Number(node.pos_err_m).toFixed(1)} m</span> : null}</span> : "—"}</Prop>
        {node.nearest && <Prop icon="truck" k="Nearest truck">{node.nearest.fleet_id} · {node.nearest.distance_m} m{node.nearest.closing ? <span className="chip amber" style={{ marginLeft: 6 }}>closing</span> : null}</Prop>}
        <Prop icon="therm" k="Weather">{node.temp_c}°C · {node.humidity_pct}% · gap {node.risk?.dew_point_spread_c}°C</Prop>
        <Prop icon="battery" k="Battery">{node.battery_pct != null ? `${Math.round(node.battery_pct)}%` : "—"}</Prop>
        <Prop icon="clock" k="Updated">{secsAgo(node.last_seen)}</Prop>
      </div>

      <button className="btn soft block" style={{ marginTop: 12 }} onClick={() => openInOrganicMaps(node.lat, node.lon, `${node.vehicle?.vehicle_no || node.node_id}`)}>
        <Icon name="map" size={18} /> Open in Organic Maps
      </button>
    </div>
  );
}
