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
  async playGuestWin(anonId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_guest_win`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_anon_id: anonId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "guest_win_play_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async guestWinStatus(anonId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/guest_win_status`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_anon_id: anonId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "guest_win_status_failed");
    return Array.isArray(data) ? data[0] || null : data;
  }
  async claimGuestWin(anonId, userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/claim_guest_win`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_anon_id: anonId, target_user_id: userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "guest_win_claim_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async claimAdReward(userId, requestId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/claim_ad_reward`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_request_id: requestId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "ad_reward_claim_failed");
    return Array.isArray(data) ? data[0] : data;
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
  async playRoulette(userId, stakeCredits, betType, betValue, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_roulette_spin`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_bet_type: betType, target_bet_value: Number.isInteger(betValue) ? betValue : null, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "roulette_spin_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async coinFlipOdds() {
    const response = await this.fetcher(`${this.url}/rest/v1/coin_flip_tiers?select=label,max_stake_credits,win_probability_bp,bonus_probability_bp,bonus_multiplier_bp&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("coin_flip_odds_lookup_failed");
    return response.json();
  }
  async playCoinFlip(userId, stakeCredits, call, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_coin_flip`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_call: call, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "coin_flip_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async coinTowerOdds() {
    const response = await this.fetcher(`${this.url}/rest/v1/coin_tower_tiers?select=label,max_stake_credits,refund_probability_bp,win_probability_bp,win_multiplier_bp,topple_probability_bp,topple_multiplier_bp&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("coin_tower_odds_lookup_failed");
    return response.json();
  }
  async playCoinTower(userId, stakeCredits, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_coin_tower_drop`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "coin_tower_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async slots777Symbols() {
    const response = await this.fetcher(`${this.url}/rest/v1/slots_777_symbols?select=symbol,three_kind_multiplier_bp&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("slots_777_symbols_lookup_failed");
    return response.json();
  }
  async playSlots777(userId, stakeCredits, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_slots_777`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "slots_777_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async scratchCardOdds() {
    const response = await this.fetcher(`${this.url}/rest/v1/scratch_card_tiers?select=label,max_stake_credits,small_win_probability_bp,small_win_multiplier_bp,big_win_probability_bp,big_win_multiplier_bp&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("scratch_card_odds_lookup_failed");
    return response.json();
  }
  async playScratchCard(userId, stakeCredits, tileIndex, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_scratch_card`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_tile_index: tileIndex, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "scratch_card_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async streakLadderOdds() {
    const response = await this.fetcher(`${this.url}/rest/v1/streak_ladder_rungs?select=rung,label,survive_probability_bp,payout_multiplier_bp&order=rung.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("streak_ladder_odds_lookup_failed");
    return response.json();
  }
  async startStreakLadder(userId, stakeCredits, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/start_streak_ladder_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "streak_ladder_start_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async climbStreakLadder(userId, roundId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/climb_streak_ladder_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_round_id: roundId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "streak_ladder_climb_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async cashoutStreakLadder(userId, roundId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/cashout_streak_ladder_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_round_id: roundId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "streak_ladder_cashout_failed");
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
  async stakeSnakeLadder(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_snake_ladder_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "snake_ladder_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundSnakeLadderStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_snake_ladder_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "snake_ladder_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleSnakeLadderRound(winnerUserId, potCredits, roomId, participantIds, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_snake_ladder_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_winner_user_id: winnerUserId, target_pot_credits: potCredits, target_room_id: roomId, target_participant_ids: participantIds, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "snake_ladder_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async stakeRummy(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_rummy_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "rummy_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundRummyStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_rummy_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "rummy_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleRummyRound(winnerUserId, potCredits, roomId, participantIds, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_rummy_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_winner_user_id: winnerUserId, target_pot_credits: potCredits, target_room_id: roomId, target_participant_ids: participantIds, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "rummy_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async stakeLudo(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_ludo_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "ludo_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundLudoStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_ludo_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "ludo_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleLudoRound(winnerUserId, potCredits, roomId, participantIds, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_ludo_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_winner_user_id: winnerUserId, target_pot_credits: potCredits, target_room_id: roomId, target_participant_ids: participantIds, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "ludo_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async stakeTeenPatti(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_teen_patti_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "teen_patti_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundTeenPattiStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_teen_patti_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "teen_patti_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleTeenPattiRound(winnerUserId, potCredits, roomId, participantIds, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_teen_patti_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_winner_user_id: winnerUserId, target_pot_credits: potCredits, target_room_id: roomId, target_participant_ids: participantIds, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "teen_patti_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async stakeAndarBahar(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_andar_bahar_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "andar_bahar_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundAndarBaharStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_andar_bahar_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "andar_bahar_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleAndarBaharPayout(userId, stakeCredits, payoutCredits, roomId, winningSide, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_andar_bahar_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_winning_side: winningSide, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "andar_bahar_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordAndarBaharHouseTake(roomId, houseTakeCredits, potCredits, winningSide) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_andar_bahar_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits, target_winning_side: winningSide }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "andar_bahar_house_take_failed"); }
  }
  async stakeDragonTiger(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_dragon_tiger_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "dragon_tiger_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundDragonTigerStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_dragon_tiger_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "dragon_tiger_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleDragonTigerPayout(userId, stakeCredits, payoutCredits, roomId, winningSide, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_dragon_tiger_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_winning_side: winningSide, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "dragon_tiger_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordDragonTigerHouseTake(roomId, houseTakeCredits, potCredits, winningSide) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_dragon_tiger_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits, target_winning_side: winningSide }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "dragon_tiger_house_take_failed"); }
  }
  async reflexTapTiers() {
    const response = await this.fetcher(`${this.url}/rest/v1/reflex_tap_tiers?select=label,max_response_ms,multiplier_bp&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("reflex_tap_tiers_lookup_failed");
    return response.json();
  }
  async playReflexTap(userId, stakeCredits, responseMs, falseStart, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0 || stakeCredits % 100 !== 0 || stakeCredits > MAX_STAKE_CREDITS) throw new Error("invalid_stake");
    if (!Number.isSafeInteger(responseMs) || responseMs < 0 || responseMs > 10000) throw new Error("invalid_response_time");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/play_reflex_tap_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_response_ms: responseMs, target_false_start: Boolean(falseStart), target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "reflex_tap_play_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async stakeBidding(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_bidding_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "bidding_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundBiddingStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_bidding_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "bidding_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleBiddingPayout(userId, stakeCredits, payoutCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_bidding_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "bidding_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordBiddingHouseTake(roomId, houseTakeCredits, potCredits) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_bidding_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "bidding_house_take_failed"); }
  }
  async stakeTugOfWar(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_tug_of_war_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "tug_of_war_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundTugOfWarStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_tug_of_war_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "tug_of_war_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleTugOfWarPayout(userId, stakeCredits, payoutCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_tug_of_war_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "tug_of_war_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordTugOfWarHouseTake(roomId, houseTakeCredits, potCredits) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_tug_of_war_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "tug_of_war_house_take_failed"); }
  }
  async stakeConnectFour(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_connect_four_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "connect_four_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundConnectFourStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_connect_four_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "connect_four_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleConnectFourPayout(userId, stakeCredits, payoutCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_connect_four_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "connect_four_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordConnectFourHouseTake(roomId, houseTakeCredits, potCredits) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_connect_four_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "connect_four_house_take_failed"); }
  }
  async stakeEliminationReflex(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_elimination_reflex_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "elimination_reflex_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundEliminationReflexStake(userId, refundCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_elimination_reflex_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_refund_credits: refundCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "elimination_reflex_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settleEliminationReflexPayout(userId, stakeCredits, payoutCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_elimination_reflex_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "elimination_reflex_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordEliminationReflexHouseTake(roomId, houseTakeCredits, potCredits) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_elimination_reflex_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "elimination_reflex_house_take_failed"); }
  }
  async stakePredictionPool(userId, stakeCredits, roomId, idempotencyKey) {
    if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) throw new Error("invalid_stake");
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/stake_prediction_pool_round`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "prediction_pool_stake_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async refundPredictionPoolStake(userId, stakeCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/refund_prediction_pool_stake`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "prediction_pool_refund_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async settlePredictionPoolPayout(userId, stakeCredits, payoutCredits, roomId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/settle_prediction_pool_payout`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_stake_credits: stakeCredits, target_payout_credits: payoutCredits, target_room_id: roomId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "prediction_pool_settle_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async recordPredictionPoolHouseTake(roomId, houseTakeCredits, potCredits) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/record_prediction_pool_house_take`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_room_id: roomId, target_house_take_credits: houseTakeCredits, target_pot_credits: potCredits }),
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "prediction_pool_house_take_failed"); }
  }
  async dailyStreakStatus(userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/daily_streak_status`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "daily_streak_status_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async claimDailyStreakBonus(userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/claim_daily_streak_bonus`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "daily_streak_claim_failed");
    return Array.isArray(data) ? data[0] : data;
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
