import { apiBase } from "./config.js";

const OP_KEY = "drishti_operator_token_v1";

export const getOperatorToken = () => {
  try { return sessionStorage.getItem(OP_KEY) || ""; } catch { return ""; }
};
export const setOperatorToken = (t) => {
  try { t ? sessionStorage.setItem(OP_KEY, t) : sessionStorage.removeItem(OP_KEY); } catch { /* storage blocked */ }
};

/** Tiny fetch wrapper: returns { ok, status, data } and never throws on HTTP errors. */
export async function api(path, { method = "GET", token, body, timeout = 8000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      signal: ctl.signal,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Can't reach the DRISHTI server" } };
  } finally {
    clearTimeout(timer);
  }
}
