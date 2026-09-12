-- Broaden store_items read access to all rows, not just active ones: an item being deactivated
-- (admin stops new sales) shouldn't make it invisible via the profiles->store_items FK embed for
-- users who already own/equipped it before deactivation. Price/description of an inactive item
-- isn't sensitive; purchase eligibility is still separately enforced by purchase_store_item's own
-- "where id=... and active" check, so this only affects visibility, not purchasability.
drop policy if exists "anyone reads active store items" on public.store_items;
create policy "anyone reads store items" on public.store_items for select to authenticated,anon using (true);
