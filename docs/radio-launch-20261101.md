# Radio launch continuation

## Verified on 2026-11-10

- The existing Cloudflare R2 bucket `sunoto-radio` is active in WEUR. Bucket info returned one 43-byte object before catalog import.
- `radio.grasany.com` responds with HTTP 308 to `https://sunoto.grasany.com/#party`. The public channel endpoint returns the curated and public channels to guests. Production serves revision `c87027b87b2c94a231557ec75cd00ee1d1e973dd` at 100% on Cloudflare Worker version `8e1b026d-9df9-4df1-a6da-a02bf0da140a`.
- The launch catalog is 20 unique MP3s (33 minutes) from [Kainotomic's publisher catalog](https://kaino.dev/library/music) under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Each file has a source URL, measured MP3 duration, size and SHA-256 in the accompanying manifest.
- All 20 catalog MP3s were uploaded to new keys in the existing private bucket and read back with matching SHA-256 hashes and lengths. The production Worker binds the bucket and sets the canonical origin for signed audio URLs. Wrangler dry-run reports the expected bucket and packages the frontend. The 16 focused radio playback and licensing tests pass.
- The player keeps the same audio element and controls through room redraws, applies the live position to a new source and uses native audio on touch-first devices. It removes stale references to disabled synthetic reactions from the radio event path.
- An empty station retries the queue on its existing Durable Object alarm while listeners are connected. A previously opened empty room can pick up the new catalog.

- Grasany applied the reviewed owner transaction to the original SunoTo project and verified 20 exact curated keys, all licensed and with no user uploader. The curated channel had zero rows before import.
- An anonymous live socket received Pale Window followed by Silent Voltage. Full production audio matched the recorded lengths and SHA-256 hashes for both. HEAD returned 200 with audio/mpeg, a valid range returned 206, an unsatisfiable range returned 416, and unsigned audio returned 403.
- An isolated desktop Edge session decoded live audio, advanced playback and continued to the next track on the same audio element. A separate desktop check passed pause/resume and guest playback after reloading through the public alias.

## Pending

- Physical iPhone Safari and Android Chrome acceptance. Start the curated station, lock the phone for three minutes across a track change, then check lock-screen pause/resume and playback after unlocking.
