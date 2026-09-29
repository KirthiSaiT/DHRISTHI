import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase, getServerUrl, normalizeServerInput, setServerUrl } from "../config.js";
import { BrandMark, Icon } from "./ui.jsx";

/* First-launch (and Settings) screen: point the app at the DRISHTI server. */
export default function Setup() {
  const nav = useNavigate();
  const [value, setValue] = useState(getServerUrl());
  const [state, setState] = useState({ kind: "idle", msg: "" });

  async function test() {
    const url = normalizeServerInput(value);
    if (!url) { setState({ kind: "err", msg: "Enter the server address first." }); return; }
    setState({ kind: "busy", msg: "Connecting…" });
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`${url}/api/drivers`, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(String(r.status));
      setValue(url);
      setServerUrl(url);
      setState({ kind: "ok", msg: "Connected. Server address saved." });
    } catch {
      setState({ kind: "err", msg: "Couldn't reach that address. Check the IP, that the backend is running, and that the phone is on the same Wi-Fi." });
    }
  }

  return (
    <div className="shell">
      <div className="topbar safe-top" style={{ height: "auto", minHeight: 52 }}>
        <span className="brand"><BrandMark /> DRISHTI</span>
      </div>
      <div className="scroll">
        <div className="page" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>📡</div>
          <h1 className="h1" style={{ marginTop: 14 }}>Connect to the server</h1>
          <p className="lede muted" style={{ marginTop: 8, fontSize: 15 }}>
            Enter the address of the DRISHTI backend. On a demo laptop that's its Wi-Fi IP, for example <span className="mono">192.168.1.20</span>.
          </p>
          <label className="label" htmlFor="srv">Server address</label>
          <input id="srv" className="input" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="192.168.1.20:8000" value={value} onChange={(e) => { setValue(e.target.value); setState({ kind: "idle", msg: "" }); }} />
          <div role="status" style={{ minHeight: 40, marginTop: 10, fontSize: 13, fontWeight: 600, color: state.kind === "ok" ? "var(--green-ink)" : state.kind === "err" ? "var(--red-ink)" : "var(--ink-3)" }}>{state.msg}</div>
          <button className="btn primary block" onClick={test} disabled={state.kind === "busy"}><Icon name="wifi" size={18} /> Test &amp; save</button>
          <button className="btn soft block" style={{ marginTop: 10 }} onClick={() => nav("/")} disabled={!apiBase()}>Continue</button>
        </div>
      </div>
    </div>
  );
}
