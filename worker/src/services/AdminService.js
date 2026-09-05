export class AdminService{
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=(...args)=>fetcher(...args)}
  headers(extra={}){return{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json",...extra}}
  async request(path,options={}){const response=await this.fetcher(`${this.env.SUPABASE_URL}/rest/v1${path}`,{...options,headers:this.headers(options.headers)}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"admin_query_failed");return data}
  rpc(name,body={}){return this.request(`/rpc/${name}`,{method:"POST",body:JSON.stringify(body)})}
  async dashboard(){return this.rpc("admin_dashboard_snapshot")}
  async users(limit=50,offset=0){return this.rpc("admin_list_users",{result_limit:limit,result_offset:offset})}
  async reports(){const [reports,risks]=await Promise.all([this.request("/reports?select=id,session_id,reporter_ref,target_ref,reason,weight,created_at&order=created_at.desc&limit=100"),this.request("/risk_scores?select=target_ref,recent_score,lifetime_score,unique_reporters,last_report_at")]),byTarget=Object.fromEntries(risks.map(item=>[item.target_ref,item]));return reports.map(report=>({...report,risk:byTarget[report.target_ref]||null}))}
  restrictions(){return this.request("/restrictions?select=target_ref,status,reason,active,updated_at&order=updated_at.desc&limit=100")}
  grievances(){return this.request("/grievances?select=id,email,category,description,status,received_at,acknowledged_at,resolved_at&order=received_at.desc&limit=100")}
  updateGrievance({adminId,id,status}){return this.rpc("admin_update_grievance",{admin_id:adminId,target_id:id,new_status:status})}
  feedback(){return this.request("/feedback?select=id,account_user_id,message,status,created_at&order=created_at.desc&limit=100")}
  updateFeedback({adminId,id,status}){return this.rpc("admin_update_feedback",{admin_id:adminId,target_id:id,new_status:status})}
  deletions(){return this.request("/account_deletion_requests?select=id,user_id,reason,status,processing_note,requested_at,completed_at&order=requested_at.desc&limit=100")}
  updateDeletion({adminId,id,status,note}){return this.rpc("admin_update_deletion_request",{admin_id:adminId,target_id:id,new_status:status,decision_note:note})}
  promotions(type){const table=type==="coupon"?"coupons":"offers";return this.request(`/${table}?select=*&order=created_at.desc&limit=100`)}
  audit(){return this.request("/admin_audit?select=id,admin_user_id,action,target_type,target_ref,created_at&order=created_at.desc&limit=100")}
  ledger(userId){return this.request(`/wallet_ledger?select=id,delta,balance_after,entry_type,reason,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`)}
  wallet({adminId,userId,delta,reason,operationId}){return this.rpc("admin_adjust_wallet",{admin_id:adminId,target_user_id:userId,credit_delta:delta,ledger_reason:reason,operation_id:operationId})}
  restrict({adminId,targetRef,status,reason}){return this.rpc("admin_set_restriction",{admin_id:adminId,target:targetRef,new_status:status,restriction_reason:reason})}
  savePromotion({adminId,type,payload}){return this.rpc("admin_save_promotion",{admin_id:adminId,promotion_type:type,payload})}
  setPremium({adminId,userId,premium}){return this.rpc("admin_set_premium",{admin_id:adminId,target_user_id:userId,premium})}
  grantPremiumDays({adminId,userId,days}){return this.rpc("admin_grant_premium_days",{admin_id:adminId,target_user_id:userId,days})}
  expirePremiumMemberships(){return this.rpc("expire_premium_memberships")}
  runAutoDebitPremiumSweep(){return this.rpc("run_auto_debit_premium_sweep")}
  gamesRevenue(limit=100){return this.request(`/platform_revenue_ledger?select=id,source,credits_amount,reason,metadata,created_at&order=created_at.desc&limit=${limit}`)}
  gamesRounds(gameType,limit=100){const filter=gameType?`&game_type=eq.${encodeURIComponent(gameType)}`:"";return this.request(`/game_rounds?select=id,game_type,user_id,stake_credits,payout_credits,outcome,created_at&order=created_at.desc&limit=${limit}${filter}`)}
  jackpotRounds(limit=50){return this.request(`/jackpot_rounds?select=id,opens_at,closes_at,status,total_tickets,pool_credits,winner_user_id,payout_credits,house_take_credits,drawn_at&order=id.desc&limit=${limit}`)}
  triviaRounds(limit=50){return this.request(`/daily_trivia_rounds?select=id,trivia_date,entry_credits,closes_at,status,entrant_count,pool_credits,payout_credits,house_take_credits,settled_at&order=id.desc&limit=${limit}`)}
  wheelSegments(){return this.request("/wheel_segments?select=id,label,weight_bp,multiplier_bp&order=id.asc")}
  updateWheelSegments({adminId,segments}){return this.rpc("admin_update_wheel_segments",{admin_id:adminId,segments})}
  scheduledTriviaQuestions(limit=20){return this.request(`/daily_trivia_scheduled_questions?select=trivia_date,questions,created_at&order=trivia_date.desc&limit=${limit}`)}
  scheduleTriviaQuestions({adminId,triviaDate,questions}){return this.rpc("admin_schedule_trivia_questions",{admin_id:adminId,target_date:triviaDate,questions})}
  setRadioArtistLinks({adminId,roomPublicId,spotifyUrl,appleMusicUrl}){return this.rpc("admin_set_radio_artist_links",{admin_id:adminId,target_room_public_id:roomPublicId,spotify_url:spotifyUrl,apple_music_url:appleMusicUrl})}
  createRadioChannel({name}){return this.rpc("admin_create_radio_channel",{target_name:name})}
  statsSnapshots(limit=48){return this.request(`/realtime_stats_snapshots?select=id,captured_at,sections,ad_stats&order=captured_at.desc&limit=${limit}`)}
  privateAds(slot){const filter=slot?`&slot=eq.${encodeURIComponent(slot)}`:"";return this.request(`/private_ads?select=*&order=slot.asc,updated_at.desc${filter}`)}
  createPrivateAd({slot,title,imageUrl,targetUrl,active}){return this.request("/private_ads",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({slot,title:title||"",image_url:imageUrl,target_url:targetUrl,active:active!==false})})}
  updatePrivateAd({id,slot,title,imageUrl,targetUrl,active}){const patch={updated_at:new Date().toISOString()};if(slot!==undefined)patch.slot=slot;if(title!==undefined)patch.title=title;if(imageUrl!==undefined)patch.image_url=imageUrl;if(targetUrl!==undefined)patch.target_url=targetUrl;if(active!==undefined)patch.active=active;return this.request(`/private_ads?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify(patch)})}
  deletePrivateAd(id){return this.request(`/private_ads?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"})}
  sportMatches(limit=100){return this.request(`/sport_matches?select=*&order=starts_at.desc&limit=${limit}`)}
  createSportMatch({sport,homeTeam,awayTeam,startsAt}){return this.request("/sport_matches",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({sport,home_team:homeTeam,away_team:awayTeam,starts_at:startsAt||null})})}
  updateSportMatch({id,status}){return this.request(`/sport_matches?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({status})})}
  sportMarkets(matchId){return this.request(`/sport_markets?select=*,sport_market_outcomes(id,label,pool_credits)&match_id=eq.${encodeURIComponent(matchId)}&order=created_at.asc`)}
  createSportMarket({matchId,marketType,description,closesAt,outcomeLabels}){return this.rpc("admin_create_sport_market",{target_match_id:matchId,target_market_type:marketType,target_description:description||"",target_closes_at:closesAt||null,target_outcome_labels:outcomeLabels})}
  closeSportMarket(id){return this.rpc("close_sport_market",{target_market_id:id})}
  voidSportMarket(id){return this.rpc("void_sport_market",{target_market_id:id})}
  settleSportMarket({id,winningOutcomeId}){return this.rpc("settle_sport_market",{target_market_id:id,target_winning_outcome_id:winningOutcomeId})}
}
