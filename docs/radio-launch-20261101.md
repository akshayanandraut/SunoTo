# Radio launch continuation

## Verified on 2026-11-10

- The existing Cloudflare R2 bucket `sunoto-radio` is active in WEUR. Bucket info returned one 43-byte object before catalog import.
- `radio.grasany.com` responds with HTTP 308 to `https://sunoto.grasany.com/#party`. The public channel endpoint returns the curated and public channels to guests. The live release manifest still reports `bfa670f9e783726ac54a83ec49087a0dfb0b6a42`.
- The launch catalog is 20 unique MP3s (33 minutes) from [Kainotomic's publisher catalog](https://kaino.dev/library/music) under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Each file has a source URL, measured MP3 duration, size and SHA-256 in the accompanying manifest.
- The production candidate explicitly binds the existing private R2 bucket. Wrangler dry-run reports the expected bucket and packages the frontend. The 15 focused radio playback and licensing tests pass.
- The player candidate keeps the same audio element and controls through room redraws, applies the live position to a new source and uses native audio on touch-first devices. It removes stale references to disabled synthetic reactions from the radio event path.

## Pending

- Verify private object uploads against the catalog manifest, then import the exact curated metadata through the existing admin RPC in a bounded owner transaction. Reconcile the resulting queue with the manifest.
- Build and stage the player from the public baseline and coordinate promotion with Grasany's identity canary. Record the exact active Worker version and confirm guest audio, signed range delivery, track change and recovery.
- Verify actual playback on iPhone Safari and Android Chrome, including screen lock across a track change and playback controls. Desktop emulation does not satisfy this gate.
