import React from "react";
import { riskColor } from "../hooks/useDrishti.js";

// Fixed layout positions for a handful of demo nodes so the panel reads like
// a real haul-road map without needing real GPS coordinates yet. Swap for a
// real lat/lon projection once the physical GPS module is feeding in.
const LAYOUT = {
  "NODE-A": { x: 230, y: 330 },
  "NODE-B": { x: 470, y: 230 },
  "NODE-C": { x: 700, y: 160 },
};

export default function MapPanel({ nodes }) {
  return (
    <div className="card" style={{ flex: 1.4, position: "relative", padding: "18px 20px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Haul Road — Zone 3, Hilltop</span>
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>LIVE</span>
      </div>
      <svg width="100%" height="88%" viewBox="0 0 900 420" style={{ position: "absolute", left: 0, bottom: 0 }} fill="none">
        <path d="M-20 380 C 140 340,240 400,380 320 S 640 240,940 300" stroke="#18272A" strokeWidth="3" />
        <path d="M-20 300 C 160 260,260 340,420 260 S 660 170,940 220" stroke="#14201F" strokeWidth="2" />
        <path d="M-20 220 C 180 180,280 260,460 190 S 700 110,940 150" stroke="#101A19" strokeWidth="2" />

        {nodes.map((n) => {
          const pos = LAYOUT[n.node_id] || { x: 100 + Math.random() * 700, y: 150 + Math.random() * 200 };
          const color = riskColor(n.risk?.risk_level);
          return (
            <g key={n.node_id}>
              <circle cx={pos.x} cy={pos.y} r="7" fill={color} />
              <circle cx={pos.x} cy={pos.y} r="18" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
              {n.hazard_active && (
                <path d={`M${pos.x} ${pos.y - 28} l7 13 h-14 z`} fill="var(--red)" />
              )}
              <text x={pos.x + 14} y={pos.y + 4} fill="#B7C0C8" fontSize="12" fontFamily="IBM Plex Mono">
                {n.node_id} · {n.risk?.risk_level || "—"}{n.hazard_active ? " · HAZARD" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
