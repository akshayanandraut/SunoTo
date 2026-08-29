-- Allow anonymous (signed-out) listeners to discover the curated global "SunoTo Radio" channel.
-- list_radio_channels only ever returns global channel metadata (public_id, name, room_type,
-- curated_only) — no member data or paid-room info — so it is safe to grant to anon.
grant execute on function public.list_radio_channels() to anon;
