import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RADIO_PLAYBACK_MESSAGES, enableRadioPlayerControls, setRadioPlaybackState, syncRadioMediaSession } from "../web/js/radio-playback.js";

describe("radio playback controls", () => {
  it("keeps media metadata from claiming playback before the audio starts", () => {
    const handlers = new Map(), session = { setActionHandler: (name, handler) => handlers.set(name, handler), playbackState: "none" };
    class Metadata { constructor(value) { Object.assign(this, value); } }
    syncRadioMediaSession({ title: "Song", artistName: "Artist", artworkUrl: "/cover.jpg" }, { mediaSession: session, Metadata });
    assert.equal(session.playbackState, "none");
    assert.equal(session.metadata.title, "Song");
    assert.deepEqual(session.metadata.artwork, [{ src: "/cover.jpg" }]);
    assert.deepEqual([...handlers.keys()], ["play", "pause", "nexttrack"]);
  });

  it("routes lock-screen controls to the live player and skip vote", async () => {
    const handlers = new Map(), events = [], player = { play: async () => events.push("play"), pause: () => events.push("pause") };
    const session = { setActionHandler: (name, handler) => handlers.set(name, handler), playbackState: "none" };
    syncRadioMediaSession({ title: "Song" }, { mediaSession: session, getPlayer: () => player, onSkipVote: () => events.push("skip-vote") });
    await handlers.get("play")();
    handlers.get("pause")();
    handlers.get("nexttrack")();
    assert.deepEqual(events, ["play", "pause", "skip-vote"]);
  });

  it("clears metadata and unsupported action handlers when leaving a radio channel", () => {
    const handlers = new Map(), session = { metadata: {}, playbackState: "playing", setActionHandler: (name, handler) => handlers.set(name, handler) };
    syncRadioMediaSession(null, { mediaSession: session });
    assert.equal(session.metadata, null);
    assert.equal(session.playbackState, "none");
    assert.deepEqual([...handlers.values()], [null, null, null]);
  });

  it("enables device playback controls and only permits valid Media Session states", () => {
    const attributes = new Set(["disableremoteplayback"]), controls = new Set(["nodownload", "noremoteplayback"]), player = { controlsList: { remove: value => controls.delete(value) }, removeAttribute: value => attributes.delete(value), setAttribute: (key, value) => attributes.add(`${key}:${value}`) };
    enableRadioPlayerControls(player);
    assert.equal(attributes.has("disableremoteplayback"), false);
    assert.equal(controls.has("noremoteplayback"), false);
    assert.equal(attributes.has("aria-label:SunoTo Radio audio player"), true);
    const session = { playbackState: "none" };
    setRadioPlaybackState(session, "playing");
    setRadioPlaybackState(session, "broken");
    assert.equal(session.playbackState, "playing");
  });

  it("provides explicit loading, pause, retry and error feedback", () => {
    assert.match(RADIO_PLAYBACK_MESSAGES.buffering, /Reconnecting/);
    assert.match(RADIO_PLAYBACK_MESSAGES.blocked, /Press Play to try again/);
    assert.match(RADIO_PLAYBACK_MESSAGES.error, /retry/);
  });

  it("does not synthesize radio listeners or radio reactions", async () => {
    const [app, views] = await Promise.all([
      readFile(new URL("../web/js/app.js", import.meta.url), "utf8"),
      readFile(new URL("../web/js/views.js", import.meta.url), "utf8"),
    ]);
    assert.doesNotMatch(app, /nextRadioListenerCount|randomRadioListenerCount|spawnRadioReaction\(reactions\[.*createFriendlyHandle/);
    assert.match(app, /function scheduleSyntheticRadioReaction\(\)\{\}/);
    assert.doesNotMatch(views, /realListeners\|\|0\)\+15000/);
  });
});
