// "Sparks" is a UI-only relabeling of Credits (1 Spark = 100 Credits) -- there is no separate
// wallet or ledger behind the scenes. Every stake/payout here is expressed and moved in Credits.
const MAX_STAKE_CREDITS = 50000;
const DAILY_STAKE_CAP_CREDITS = 200000;

export class GamesService {
  constructor({ url, serviceKey, fetcher = fetch }) {
    this.url = url;
    this.serviceKey = serviceKey;
    this.fetcher = (...args) => fetcher(...args);
  }
  headers() {
    return { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}`, "content-type": "application/json" };
  }
  async wheelOdds() {
    const response = await this.fetcher(`${this.url}/rest/v1/wheel_segments?select=label,weight_bp,multiplier_bp&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("wheel_odds_lookup_failed");
    return response.json();
  }
  async playWheel(userId, stakeCredits, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_wheel_spin`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "wheel_spin_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async currentJackpotRound() {
    const response = await this.fetcher(`${this.url}/rest/v1/jackpot_rounds?select=id,opens_at,closes_at,status,total_tickets,pool_credits&status=eq.open&order=id.desc&limit=1`, { headers: this.headers() });
    if (!response.ok) throw new Error("jackpot_round_lookup_failed");
    const [round] = await response.json();
    return round || null;
  }
  async buyJackpotTickets(userId, ticketCount, idempotencyKey) {
    if (!Number.isSafeInteger(ticketCount) || ticketCount <= 0 || ticketCount > 100) throw new Error("invalid_ticket_count");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/buy_jackpot_tickets`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_ticket_count: ticketCount, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "jackpot_ticket_purchase_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async drawDueJackpotRounds() {
    const dueResponse = await this.fetcher(`${this.url}/rest/v1/jackpot_rounds?select=id&status=eq.open&closes_at=lte.${encodeURIComponent(new Date().toISOString())}`, { headers: this.headers() });
    if (!dueResponse.ok) throw new Error("jackpot_due_lookup_failed");
    const due = await dueResponse.json();
    const results = [];
    for (const round of due) {
      const response = await this.fetcher(`${this.url}/rest/v1/rpc/draw_jackpot_round`, { method: "POST", headers: this.headers(), body: JSON.stringify({ target_round_id: round.id }) });
      const data = await response.json().catch(() => ({}));
      results.push({ roundId: round.id, ok: response.ok, data });
    }
    return results;
  }
  async currentTriviaRound() {
    const response = await this.fetcher(`${this.url}/rest/v1/daily_trivia_rounds?select=id,trivia_date,questions,entry_credits,closes_at,status,entrant_count,pool_credits&status=eq.open&order=id.desc&limit=1`, { headers: this.headers() });
    if (!response.ok) throw new Error("trivia_round_lookup_failed");
    const [round] = await response.json();
    if (!round) return null;
    // Never expose correct_index to the client before the round closes.
    return { ...round, questions: (round.questions || []).map(({ question, options }) => ({ question, options })) };
  }
  async submitTriviaEntry(userId, answers, responseMs, idempotencyKey) {
    if (!Array.isArray(answers) || answers.some((value) => !Number.isInteger(value))) throw new Error("invalid_answers");
    if (!Number.isSafeInteger(responseMs) || responseMs < 0) throw new Error("invalid_response_time");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/submit_trivia_entry`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_answers: answers, target_response_ms: responseMs, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "trivia_submit_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleDueTriviaRounds() {
    const dueResponse = await this.fetcher(`${this.url}/rest/v1/daily_trivia_rounds?select=id&status=eq.open&closes_at=lte.${encodeURIComponent(new Date().toISOString())}`, { headers: this.headers() });
    if (!dueResponse.ok) throw new Error("trivia_due_lookup_failed");
    const due = await dueResponse.json();
    const results = [];
    for (const round of due) {
      const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_trivia_round`, { method: "POST", headers: this.headers(), body: JSON.stringify({ target_round_id: round.id }) });
      const data = await response.json().catch(() => ({}));
      results.push({ roundId: round.id, ok: response.ok, data });
    }
    return results;
  }
  async dailyStakeUsage(userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/games_daily_stake_credits`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId }),
    });
    if (!response.ok) throw new Error("daily_usage_lookup_failed");
    const usedCredits = await response.json();
    return { usedCredits: Number(usedCredits) || 0, capCredits: DAILY_STAKE_CAP_CREDITS };
  }
  async leaderboard(gameType, limit = 20) {
    const response = await this.fetcher(
      `${this.url}/rest/v1/game_rounds?select=game_type,payout_credits,stake_credits,outcome,created_at&game_type=eq.${encodeURIComponent(gameType)}&payout_credits=gt.0&order=created_at.desc&limit=${limit}`,
      { headers: this.headers() },
    );
    if (!response.ok) throw new Error("leaderboard_lookup_failed");
    return response.json();
  }
}
