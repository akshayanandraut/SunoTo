export class LiveWorldService {
  constructor({ url, serviceKey, fetcher = fetch }) {
    this.url = url;
    this.serviceKey = serviceKey;
    this.fetcher = (...args) => fetcher(...args);
  }
  headers() {
    return { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}`, "content-type": "application/json" };
  }
  async rpc(name, body) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/${name}`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `${name}_failed`);
    return Array.isArray(data) ? data[0] : data;
  }
  optIn(userId) { return this.rpc("opt_in_live_world", { target_user_id: userId }); }
  optOut(userId) { return this.rpc("opt_out_live_world", { target_user_id: userId }); }
  place(userId, lat, lng) { return this.rpc("place_live_world_character", { target_user_id: userId, raw_lat: lat, raw_lng: lng }); }
  async nearby(userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/nearby_live_world_placements`, { method: "POST", headers: this.headers(), body: JSON.stringify({ target_user_id: userId }) });
    const data = await response.json().catch(() => ([]));
    if (!response.ok) throw new Error(data.message || "nearby_live_world_placements_failed");
    return data;
  }
  async myPlacement(userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/live_world_placements?select=grid_lat,grid_lng,placed_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers: this.headers() });
    const [row] = await response.json().catch(() => []);
    return row || null;
  }
  requestChat(fromUserId, toPublicId) { return this.rpc("request_live_world_chat", { target_from_user_id: fromUserId, target_to_public_id: toPublicId }); }
  respondChat(userId, requestId, accept) { return this.rpc("respond_live_world_chat_request", { target_user_id: userId, target_request_id: requestId, accept }); }
  async myRequests(userId) {
    const [incoming, outgoing] = await Promise.all([
      this.fetcher(`${this.url}/rest/v1/live_world_chat_requests?select=id,from_user_id,status,created_at,expires_at&to_user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&order=created_at.desc`, { headers: this.headers() }).then(r => r.json()),
      this.fetcher(`${this.url}/rest/v1/live_world_chat_requests?select=id,to_user_id,status,session_id,created_at&from_user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20`, { headers: this.headers() }).then(r => r.json()),
    ]);
    return { incoming, outgoing };
  }
}
