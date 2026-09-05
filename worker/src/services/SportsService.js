// Sportsbook: pari-mutuel (pool) betting on cricket/football in Sparks/Credits only -- never real
// money, never withdrawable. The platform never sets fixed odds and never takes a side; it only takes
// a disclosed 5% commission from the total pool of a market once settled. See the migration comment in
// supabase/migrations/202608300032_sports_betting.sql for the full settlement design.
const MAX_STAKE_CREDITS = 50000;

export class SportsService {
  constructor({ url, serviceKey, fetcher = fetch }) {
    this.url = url;
    this.serviceKey = serviceKey;
    this.fetcher = (...args) => fetcher(...args);
  }
  headers() {
    return { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}`, "content-type": "application/json" };
  }
  async request(path, options = {}) {
    const response = await this.fetcher(`${this.url}/rest/v1${path}`, { ...options, headers: { ...this.headers(), ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "sports_query_failed");
    return data;
  }
  async liveMatches() {
    return this.request("/sport_matches?select=id,sport,home_team,away_team,status,starts_at&status=in.(scheduled,live)&order=starts_at.asc&limit=50");
  }
  async marketsForMatch(matchId) {
    if (!/^[0-9a-f-]{36}$/i.test(matchId || "")) throw new Error("invalid_match");
    const markets = await this.request(`/sport_markets?select=id,match_id,market_type,description,status,closes_at&match_id=eq.${encodeURIComponent(matchId)}&order=created_at.asc`);
    const outcomes = await this.request(`/sport_market_outcomes?select=id,market_id,label,pool_credits&market_id=in.(${markets.map((m) => m.id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    return markets.map((market) => ({ ...market, outcomes: outcomes.filter((o) => o.market_id === market.id) }));
  }
  async placeBet(userId, marketId, outcomeId, stakeCredits, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/place_sport_bet`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_market_id: marketId, target_outcome_id: outcomeId, target_stake_credits: stakeCredits, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "sport_bet_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async myBets(userId, limit = 50) {
    if (!/^[0-9a-f-]{36}$/i.test(userId || "")) throw new Error("invalid_user");
    return this.request(`/sport_bets?select=id,market_id,outcome_id,stake_credits,payout_credits,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${limit}`);
  }
}
