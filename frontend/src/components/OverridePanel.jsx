import React from "react";

export default function OverridePanel({ node, sendOverride }) {
  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)" }}>MANUAL OVERRIDE</span>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => sendOverride("simulate_reroute", node?.node_id)}
          style={{ flex: 1, height: 38, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }}
        >
          Simulate reroute
        </button>
        <button
          disabled={!node?.hazard_active}
          onClick={() => sendOverride("clear_hazard", node?.node_id)}
          style={{
            flex: 1, height: 38, borderRadius: 8, fontSize: 13,
            border: `1px solid ${node?.hazard_active ? "var(--red)" : "var(--border)"}`,
            background: node?.hazard_active ? "#1E1416" : "var(--surface-2)",
            color: node?.hazard_active ? "var(--red)" : "var(--text-faint)",
            cursor: node?.hazard_active ? "pointer" : "not-allowed",
          }}
        >
          Clear hazard {node ? `— ${node.node_id}` : ""}
        </button>
      </div>
    </div>
  );
}
