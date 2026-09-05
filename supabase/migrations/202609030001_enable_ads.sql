-- Turn on ads with the placement mix requested for launch: side rail + bottom slot
-- + occasional full-page interstitial, no top banner (keeps the fold clean).
update public.app_config
set value='{"enabled":true,"provider":"house","adFreeBalanceThreshold":1000,"interstitialEveryScans":6,"placements":{"top":false,"bottom":true,"desktopSide":true,"interstitial":true}}'::jsonb,
    version=version+1,
    updated_at=now()
where key='ads';
