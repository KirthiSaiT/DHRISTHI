import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase, wsUrl } from "../config.js";
import { api, getOperatorToken } from "../auth.js";

/**
 * Single source of truth for live DRISHTI state: connects to the backend's
 * WebSocket (with the session token), keeps everything in sync, reconnects on
 * drop, and remembers the last snapshot on the device so the app still shows
 * the latest known state (marked as cached) when signal is lost.
 *
 * token = driver or operator session; onExpired fires if the server rejects it.
 */
const cacheKey = (token) => `drishti_snap_${token ? token.slice(-12) : "anon"}`;
const readCache = (token) => { try { return JSON.parse(localStorage.getItem(cacheKey(token)) || "null"); } catch { return null; } };

export function useDrishti(token, onExpired) {
  const cached = useRef(readCache(token)).current;
  const [data, setData] = useState(cached?.data || { nodes: [], alerts: [], auth_log: [], stations: [], segments: [], hazards: [], demo: {} });
  const [live, setLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(cached?.at || 0);
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    function connect() {
      const ws = new WebSocket(`${wsUrl()}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => !cancelled && setLive(true);
      ws.onclose = (e) => {
        if (cancelled) return;
        setLive(false);
        if (e.code === 4401) { expiredRef.current?.(); return; } // session rejected: don't retry
        retryRef.current = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type !== "snapshot") return;
          const d = msg.data;
          setData(d);
          setLastUpdate(Date.now());
          try { localStorage.setItem(cacheKey(token), JSON.stringify({ at: Date.now(), data: d })); } catch { /* storage full/blocked */ }
        } catch { /* ignore malformed frames */ }
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [token]);

  const sendOverride = useCallback(async (action, node_id) => {
    const r = await api("/api/override", { method: "POST", token: getOperatorToken(), body: { action, node_id } });
    return r.ok ? r.data : { ok: false };
  }, []);

  return { ...data, live, lastUpdate, stale: !live, sendOverride };
}

export function riskColor(level) {
  return { LOW: "#1aae39", MEDIUM: "#dd8a00", HIGH: "#e03e3e" }[level] || "#a9a8a4";
}
