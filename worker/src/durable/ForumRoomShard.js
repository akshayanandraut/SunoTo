import { FORUM_MESSAGE_HISTORY_LIMIT, FORUM_MAX_MESSAGE_LENGTH } from "../policies/forumPolicy.js";

function event(type, payload = {}) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

export class ForumRoomShard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/listeners") {
      return Response.json({ count: this.state.getWebSockets().length });
    }

    if (request.method === "GET" && url.pathname === "/socket") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return Response.json({ error: "websocket_upgrade_required" }, { status: 426 });
      const accountUserId = url.searchParams.get("accountUserId");
      const handle = (url.searchParams.get("handle") || "Anonymous").slice(0, 40);
      if (!accountUserId) return Response.json({ error: "invalid_account_session" }, { status: 401 });

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ accountUserId, handle, joinedAt: Date.now() });

      const history = (await this.state.storage.get("history")) || [];
      server.send(event("HISTORY", { messages: history }));
      this.broadcast(event("PRESENCE", { online: this.state.getWebSockets().length }));

      return new Response(null, { status: 101, webSocket: client });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }

  async webSocketMessage(socket, raw) {
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const attachment = socket.deserializeAttachment() || {};
    if (payload.type === "POST") {
      const text = String(payload.text || "").trim().slice(0, FORUM_MAX_MESSAGE_LENGTH);
      if (!text) return;
      const message = { id: crypto.randomUUID(), accountUserId: attachment.accountUserId, handle: attachment.handle, text, createdAt: Date.now() };
      const history = (await this.state.storage.get("history")) || [];
      history.push(message);
      if (history.length > FORUM_MESSAGE_HISTORY_LIMIT) history.splice(0, history.length - FORUM_MESSAGE_HISTORY_LIMIT);
      await this.state.storage.put("history", history);
      this.broadcast(event("MESSAGE", { message }));
    }
  }

  async webSocketClose(socket) {
    try { socket.close(); } catch {}
    this.broadcast(event("PRESENCE", { online: Math.max(0, this.state.getWebSockets().length - 1) }));
  }

  broadcast(payload, exclude) {
    for (const socket of this.state.getWebSockets()) if (socket !== exclude) try { socket.send(payload); } catch {}
  }
}
