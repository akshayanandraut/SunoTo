// The API base is same-origin ("/api/v1") in production, where the Worker serves both the built
// frontend and the API. Local dev sets VITE_API_BASE_URL to an absolute cross-origin URL because
// Vite (:5173) and `wrangler dev` (:8787) run on different ports.
export const API_BASE = import.meta.env?.VITE_API_BASE_URL || "/api/v1";

// `new URL(path)` throws on a relative path, so WebSocket URL builders must resolve against the
// page origin first. Always use this instead of `new URL(base + ...)` directly.
export function apiUrl(path, base = API_BASE) {
  return new URL(`${base}${path}`, typeof location === "undefined" ? undefined : location.href);
}

export function websocketUrl(path, base = API_BASE) {
  const url = apiUrl(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}
