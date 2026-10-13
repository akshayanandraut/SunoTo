export const RADIO_PLAYBACK_MESSAGES = Object.freeze({
  ready: "Ready to play.",
  playing: "Playing live radio.",
  paused: "Radio paused.",
  buffering: "Reconnecting to the audio stream…",
  blocked: "Playback did not start. Press Play to try again.",
  error: "This audio could not be played. Check your connection and retry.",
});

export function setRadioPlaybackState(mediaSession, playbackState) {
  if (!mediaSession || !["none", "paused", "playing"].includes(playbackState)) return;
  try { mediaSession.playbackState = playbackState; } catch {}
}

export function syncRadioMediaSession(track, {
  mediaSession = globalThis.navigator?.mediaSession,
  Metadata = globalThis.MediaMetadata,
  getPlayer = () => document.querySelector("#party-radio-player"),
  onSkipVote = () => {},
  onPlayFailure = () => {},
} = {}) {
  if (!mediaSession) return;
  if (!track) {
    try { mediaSession.metadata = null; } catch {}
    setRadioPlaybackState(mediaSession, "none");
    for (const action of ["play", "pause", "nexttrack"]) {
      try { mediaSession.setActionHandler(action, null); } catch {}
    }
    return;
  }
  if (Metadata) {
    try {
      mediaSession.metadata = new Metadata({
        title: track.title || "Radio",
        artist: track.artistName || "SunoTo Radio",
        artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
      });
    } catch {}
  }
  // Metadata can arrive before the audio is playable; only media events mark it playing.
  setRadioPlaybackState(mediaSession, "none");
  const handlers = {
    play: () => { const player = getPlayer(); if (player) player.play().catch(onPlayFailure); },
    pause: () => getPlayer()?.pause(),
    nexttrack: onSkipVote,
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { mediaSession.setActionHandler(action, handler); } catch {}
  }
}

export function enableRadioPlayerControls(player) {
  if (!player) return;
  player.removeAttribute("disableremoteplayback");
  player.controlsList?.remove("noremoteplayback");
  player.setAttribute("aria-label", "SunoTo Radio audio player");
}
