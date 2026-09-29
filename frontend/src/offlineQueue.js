import { api } from "./auth.js";

/* Driver acknowledgements made while offline are kept on the phone and sent when the connection returns. */
const KEY = "drishti_pending_acks";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } };

export async function ackInstruction(token, key) {
  const r = await api("/api/ack", { method: "POST", token, body: { key } });
  if (r.status === 0) { // offline: queue it
    const l = read();
    if (!l.some((x) => x.key === key)) write([...l, { key, at: Date.now() }]);
    return { queued: true };
  }
  return { ok: r.ok };
}

export async function flushAcks(token) {
  const l = read();
  if (!l.length) return;
  const left = [];
  for (const item of l) {
    const r = await api("/api/ack", { method: "POST", token, body: { key: item.key } });
    if (r.status === 0) left.push(item);   // still offline; anything else (ok / stale) is done with
  }
  write(left);
}
export const pendingAckCount = () => read().length;
