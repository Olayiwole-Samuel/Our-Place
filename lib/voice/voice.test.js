// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeVoice } from "@/components/lobby/comms/VoiceControl";
import { createVoiceSession, micErrorKind } from "./voiceSession";

const PARTNER = "22222222-2222-4222-8222-222222222222";

/** A stand-in for Daily's call object: records calls, lets tests emit events. */
function fakeDaily() {
  const handlers = new Map();
  const participants = { local: { local: true, session_id: "me", user_id: "me", tracks: { audio: { state: "off" } } } };
  const call = {
    created: null,
    joined: null,
    left: false,
    destroyed: false,
    localAudio: false,
    inputs: [],
    on: (event, fn) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
    off: (event, fn) => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== fn)),
    emit: (event, payload = {}) => (handlers.get(event) ?? []).forEach((fn) => fn(payload)),
    listenerCount: () => [...handlers.values()].reduce((n, list) => n + list.length, 0),
    participants: () => participants,
    join: vi.fn(async (options) => {
      call.joined = options;
      call.emit("joined-meeting");
    }),
    leave: vi.fn(async () => {
      call.left = true;
    }),
    destroy: vi.fn(async () => {
      call.destroyed = true;
    }),
    setLocalAudio: vi.fn((on) => {
      call.localAudio = on;
    }),
    setInputDevicesAsync: vi.fn(async (devices) => call.inputs.push(devices)),
    startRemoteParticipantsAudioLevelObserver: vi.fn(async () => {}),
    addPartner: (audioState = "playable") => {
      participants.partner = { local: false, session_id: "partner-session", user_id: PARTNER, tracks: { audio: { state: audioState, persistentTrack: audioState === "playable" ? { kind: "audio" } : undefined } } };
      call.emit("participant-joined");
    },
  };
  const dailyModule = {
    default: {
      createCallObject: vi.fn((options) => {
        call.created = options;
        return call;
      }),
    },
  };
  return { call, load: async () => dailyModule, module: dailyModule };
}

let state;
const onState = (patch) => Object.assign(state, patch);
const access = async () => ({ url: "https://ourplace.daily.co/op-room", token: "t" });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state = {};
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(tracks) {
        this.tracks = tracks;
      }
      getAudioTracks() {
        return this.tracks;
      }
    },
  );
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("voice session (Daily)", () => {
  it("joins listening-only: no device access, mic off", async () => {
    const daily = fakeDaily();
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    expect(daily.call.created).toMatchObject({ audioSource: false, videoSource: false });
    expect(daily.call.joined).toMatchObject({ url: "https://ourplace.daily.co/op-room", token: "t", startAudioOff: true, startVideoOff: true });
    expect(state.status).toBe("connected");
    expect(state.micEnabled).toBeUndefined(); // never turned on by itself
  });

  it("asks for the mic only when enabled, and releases it when disabled", async () => {
    const daily = fakeDaily();
    const track = { stop: vi.fn() };
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track] })) } });
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    await session.setMic(true);
    expect(daily.call.inputs.at(-1)).toEqual({ audioSource: track });
    expect(daily.call.localAudio).toBe(true);
    expect(state).toMatchObject({ micEnabled: true, micPending: false });
    await session.setMic(false);
    expect(daily.call.localAudio).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(state.micEnabled).toBe(false);
  });

  it("explains a denied permission without raw errors", async () => {
    const daily = fakeDaily();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(Object.assign(new Error("Permission denied by system"), { name: "NotAllowedError" }))) } });
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    await session.setMic(true);
    expect(state).toMatchObject({ permissionDenied: true, micEnabled: false });
    const view = describeVoice(state);
    expect(view.caption).toBe("Microphone access is off. Enable it in your browser settings to talk with your partner.");
    expect(micErrorKind({ name: "NotFoundError" })).toBe("no_device");
  });

  it("handles browsers without microphone support gracefully", async () => {
    const daily = fakeDaily();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    await session.setMic(true);
    expect(state).toMatchObject({ micUnsupported: true, micEnabled: false });
  });

  it("tracks the partner (by server-signed user id): connected, muted, speaking from real audio levels", async () => {
    const daily = fakeDaily();
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    expect(state.partner).toEqual({ connected: false, muted: true, speaking: false });
    daily.call.addPartner("playable");
    expect(state.partner).toMatchObject({ connected: true, muted: false, speaking: false });
    daily.call.emit("remote-participants-audio-level", { participantsAudioLevel: { "partner-session": 0.2 } });
    expect(state.partner.speaking).toBe(true);
    daily.call.addPartner("off");
    expect(state.partner).toMatchObject({ connected: true, muted: true, speaking: false });
  });

  it("reflects network interruptions and recovers", async () => {
    const daily = fakeDaily();
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    daily.call.emit("network-connection", { type: "sfu", event: "interrupted" });
    expect(state.status).toBe("reconnecting");
    expect(describeVoice(state).caption).toBe("Reconnecting…");
    daily.call.emit("network-connection", { type: "sfu", event: "connected" });
    expect(state.status).toBe("connected");
  });

  it("is honest when voice isn't configured, and contains failures", async () => {
    const daily = fakeDaily();
    const unconfigured = createVoiceSession({ fetchAccess: async () => Promise.reject(Object.assign(new Error(), { code: "voice_unavailable" })), partnerId: PARTNER, onState, loadDaily: daily.load });
    await unconfigured.connect();
    expect(state.status).toBe("unavailable");
    expect(daily.module.default.createCallObject).not.toHaveBeenCalled(); // Daily isn't even loaded
    await unconfigured.destroy();

    state = {};
    vi.useFakeTimers();
    const failing = createVoiceSession({ fetchAccess: async () => Promise.reject(Object.assign(new Error(), { code: "voice_failed" })), partnerId: PARTNER, onState, loadDaily: daily.load });
    await failing.connect();
    expect(state.status).toBe("error");
    expect(describeVoice(state).action).toBe("retry");
    await failing.destroy(); // clears the retry timer
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("stops retrying when Daily reports an account problem (e.g. missing payment method)", async () => {
    vi.useFakeTimers();
    const daily = fakeDaily();
    daily.call.join = vi.fn(async () => {
      daily.call.emit("error", { errorMsg: "account-missing-payment-method" });
      throw Object.assign(new Error("account-missing-payment-method"), { errorMsg: "account-missing-payment-method" });
    });
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    await vi.runAllTimersAsync();
    expect(state).toMatchObject({ status: "unavailable", error: "voice_account" });
    expect(daily.call.join).toHaveBeenCalledTimes(1);
    expect(describeVoice(state).action).toBeNull();
    await session.destroy();
    vi.useRealTimers();
  });

  it("destroy leaves the call, stops the mic and removes every listener", async () => {
    const daily = fakeDaily();
    const track = { stop: vi.fn() };
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track] })) } });
    const session = createVoiceSession({ fetchAccess: access, partnerId: PARTNER, onState, loadDaily: daily.load });
    await session.connect();
    await session.setMic(true);
    await session.destroy();
    await flush();
    expect(daily.call.left).toBe(true);
    expect(daily.call.destroyed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(daily.call.listenerCount()).toBe(0);
  });
});
