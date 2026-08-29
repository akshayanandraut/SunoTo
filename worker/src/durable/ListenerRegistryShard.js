export class ListenerRegistryShard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/claim") {
      const { accountUserId, channelSlug, sessionToken } = await request.json();
      const sessions = (await this.state.storage.get("sessions")) || {};
      const previous = sessions[accountUserId] || null;
      sessions[accountUserId] = { channelSlug, sessionToken };
      await this.state.storage.put("sessions", sessions);
      return Response.json({ previous });
    }
    if (request.method === "POST" && url.pathname === "/release") {
      const { accountUserId, sessionToken } = await request.json();
      const sessions = (await this.state.storage.get("sessions")) || {};
      if (sessions[accountUserId]?.sessionToken === sessionToken) {
        delete sessions[accountUserId];
        await this.state.storage.put("sessions", sessions);
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
