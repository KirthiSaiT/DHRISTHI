import React, { useMemo } from "react";
import { SignIn, useAuth, useUser } from "@clerk/react";
import { useDrishti } from "../hooks/useDrishti.js";
import TopBar from "../components/TopBar.jsx";
import MapPanel from "../components/MapPanel.jsx";
import NodeHealthStrip from "../components/NodeHealthStrip.jsx";
import FogRiskCard from "../components/FogRiskCard.jsx";
import OverridePanel from "../components/OverridePanel.jsx";
import AlertFeed from "../components/AlertFeed.jsx";
import AuthLogPanel from "../components/AuthLogPanel.jsx";

const RISK_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };

function pickFocusNode(nodes) {
  if (nodes.length === 0) return null;
  const hazard = nodes.find((n) => n.hazard_active);
  if (hazard) return hazard;
  return [...nodes].sort((a, b) => (RISK_RANK[b.risk?.risk_level] ?? -1) - (RISK_RANK[a.risk?.risk_level] ?? -1))[0];
}

function Dashboard({ userLabel }) {
  const { nodes, alerts, authLog, live, sendOverride } = useDrishti();
  const focusNode = useMemo(() => pickFocusNode(nodes), [nodes]);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar nodesOnline={nodes.length} userLabel={userLabel} />
      {!live && (
        <div style={{ background: "#2A1F0E", color: "var(--amber)", fontSize: 12, padding: "6px 24px", borderBottom: "1px solid #4A3A16" }}>
          Reconnecting to backend — showing last known state.
        </div>
      )}
      <div style={{ flex: 1, display: "flex", gap: 20, padding: "20px 24px", minHeight: 0 }}>
        <div style={{ flex: 1.6, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <MapPanel nodes={nodes} />
          <NodeHealthStrip nodes={nodes} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minHeight: 0, overflow: "auto" }}>
          <FogRiskCard node={focusNode} />
          <OverridePanel node={focusNode} sendOverride={sendOverride} />
          <AlertFeed alerts={alerts} />
          <AuthLogPanel authLog={authLog} />
        </div>
      </div>
    </div>
  );
}

export default function ControlRoomPage({ clerkEnabled }) {
  if (!clerkEnabled) {
    // No Clerk key configured yet -- run the dashboard directly so the team
    // isn't blocked on setting up an account mid-hackathon.
    return <Dashboard userLabel="Guest (auth disabled)" />;
  }

  return <ClerkGate />;
}

function ClerkGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <SignIn routing="hash" />
      </div>
    );
  }

  return <Dashboard userLabel={user?.firstName || user?.username || "Operator"} />;
}
