import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agoraMicErrorKind, createAgoraVoiceSession } from "./agoraVoiceSession";

const PARTNER = "22222222-2222-4222-8222-222222222222";
const ACCESS = { appId: "a".repeat(32), channel: "op-test", uid: "me", token: "t1" };

function fakeAgora() {
  const clients = [];
  const tracks = [];
  const AgoraRTC = {
    onAutoplayFailed: null,
    setLogLevel: vi.fn(),
    disableLogUpload: vi.fn(),
    createClient: vi.fn(() => {
      const handlers = {};
      const client = {
        handlers,
        remoteUsers: [],
        connectionState: "DISCONNECTED",
        on: (event, handler) => (handlers[event] = handler),
        off: (event) => delete handlers[event],
        join: vi.fn(async () => {
          client.connectionState = "CONNECTED";
        }),
        leave: vi.fn(async () => {
          client.connectionState = "DISCONNECTED";
        }),
        publish: vi.fn(async () => {}),
        unpublish: vi.fn(async () => {}),
        subscribe: vi.fn(async () => {}),
        renewToken: vi.fn(async () => {}),
      };
      clients.push(client);
      return client;
    }),
    createMicrophoneAudioTrack: vi.fn(async () => {
      const track = { close: vi.fn() };
      tracks.push(track);
      return track;
    }),
  };
  return { AgoraRTC, clients, tracks };
}

const partnerUser = (hasAudio) => ({ uid: PARTNER, hasAudio, audioTrack: hasAudio ? { play: vi.fn(), getVolumeLevel: () => 0 } : null });

let agora;
let states;
let fetchAccess;
const session = () =>
  createAgoraVoiceSession({
    fetchAccess,
    partnerId: PARTNER,
    onState: (patch) => states.push(patch),
    loadAgora: async () => agora.AgoraRTC,
  });
const last = (key) => [...states].reverse().find((patch) => key in patch)?.[key];

beforeEach(() => {
  agora = fakeAgora();
  states = [];
  fetchAccess = vi.fn(async () => ACCESS);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Agora voice session", () => {
  it("joins the couple channel with the server's credentials, mic off", async () => {
    const voice = session();
    await voice.connect();
    const [client] = agora.clients;
    expect(client.join).toHaveBeenCalledWith(ACCESS.appId, ACCESS.channel, ACCESS.token, ACCESS.uid);
    expect(last("status")).toBe("connected");
    expect(client.publish).not.toHaveBeenCalled();
    expect(agora.AgoraRTC.createMicrophoneAudioTrack).not.toHaveBeenCalled();
  });

  it("mic on publishes a fresh track; mic off unpublishes and releases it", async () => {
    const voice = session();
    await voice.connect();
    const [client] = agora.clients;
    await voice.setMic(true);
    expect(client.publish).toHaveBeenCalledWith(agora.tracks[0]);
    expect(last("micEnabled")).toBe(true);
    await voice.setMic(false);
    expect(client.unpublish).toHaveBeenCalledWith(agora.tracks[0]);
    expect(agora.tracks[0].close).toHaveBeenCalled();
    expect(last("micEnabled")).toBe(false);
  });

  it("subscribes to and plays the partner's audio; partner state follows Agora's events", async () => {
    const voice = session();
    await voice.connect();
    const [client] = agora.clients;
    const user = partnerUser(true);
    client.remoteUsers = [user];
    await client.handlers["user-published"](user, "audio");
    expect(client.subscribe).toHaveBeenCalledWith(user, "audio");
    expect(user.audioTrack.play).toHaveBeenCalled();
    expect(last("partner")).toEqual({ connected: true, muted: false, speaking: false });
    user.hasAudio = false;
    client.handlers["user-unpublished"](user, "audio");
    expect(last("partner")).toMatchObject({ connected: true, muted: true });
    client.remoteUsers = [];
    client.handlers["user-left"](user);
    expect(last("partner")).toEqual({ connected: false, muted: true, speaking: false });
    await voice.destroy();
  });

  it("ignores audio from anyone who isn't the partner", async () => {
    const voice = session();
    await voice.connect();
    const [client] = agora.clients;
    await client.handlers["user-published"]({ uid: "stranger", hasAudio: true, audioTrack: { play: vi.fn() } }, "audio");
    expect(client.subscribe).not.toHaveBeenCalled();
  });

  it("reports a blocked microphone as a permission problem", async () => {
    agora.AgoraRTC.createMicrophoneAudioTrack.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }));
    const voice = session();
    await voice.connect();
    await voice.setMic(true);
    expect(last("permissionDenied")).toBe(true);
    expect(last("micEnabled")).toBe(false);
    expect(agoraMicErrorKind({ code: "DEVICE_NOT_FOUND" })).toBe("no_device");
  });

  it("renews the token before it expires", async () => {
    const voice = session();
    await voice.connect();
    fetchAccess.mockResolvedValueOnce({ ...ACCESS, token: "t2" });
    await agora.clients[0].handlers["token-privilege-will-expire"]();
    expect(agora.clients[0].renewToken).toHaveBeenCalledWith("t2");
  });

  it("rejoins after an unexpected disconnect, keeping the mic on", async () => {
    vi.useFakeTimers();
    const voice = session();
    await voice.connect();
    await voice.setMic(true);
    agora.clients[0].handlers["connection-state-change"]("DISCONNECTED", "CONNECTED", "UID_BANNED");
    expect(last("status")).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(2100);
    expect(agora.clients).toHaveLength(2);
    expect(agora.clients[1].join).toHaveBeenCalled();
    expect(agora.clients[1].publish).toHaveBeenCalledWith(agora.tracks[0]);
    expect(last("status")).toBe("connected");
  });

  it("is unavailable (not an error) when the server has no Agora set up", async () => {
    fetchAccess.mockRejectedValueOnce(Object.assign(new Error("voice"), { code: "voice_unavailable" }));
    const voice = session();
    await voice.connect();
    expect(last("status")).toBe("unavailable");
    expect(agora.clients).toHaveLength(0);
  });

  it("destroy leaves the channel and releases the microphone", async () => {
    const voice = session();
    await voice.connect();
    await voice.setMic(true);
    await voice.destroy();
    expect(agora.clients[0].leave).toHaveBeenCalled();
    expect(agora.tracks[0].close).toHaveBeenCalled();
  });
});

describe("voice provider choice", () => {
  const fakeSession = () => ({ connect: vi.fn(async () => {}), setMic: vi.fn(), unlockAudio: vi.fn(), retryNow: vi.fn(), destroy: vi.fn(async () => {}) });

  it("uses Agora when the server hands out Agora credentials, reusing that first answer", async () => {
    const { createAutoSession } = await import("@/store/voiceStore");
    const agoraSession = fakeSession();
    const agoraFactory = vi.fn(() => agoraSession);
    const peer = vi.fn(fakeSession);
    const fetchAgoraAccess = vi.fn(async () => ACCESS);
    const voice = createAutoSession({ partnerId: PARTNER, onState: () => {} }, { agora: agoraFactory, peer, fetchAgoraAccess });
    await voice.connect();
    expect(peer).not.toHaveBeenCalled();
    expect(agoraSession.connect).toHaveBeenCalled();
    expect(await agoraFactory.mock.calls[0][0].fetchAccess()).toBe(ACCESS);
    expect(fetchAgoraAccess).toHaveBeenCalledTimes(1);
  });

  it("falls back to direct voice when Agora isn't configured", async () => {
    const { createAutoSession } = await import("@/store/voiceStore");
    const peerSession = fakeSession();
    const agoraFactory = vi.fn(fakeSession);
    const voice = createAutoSession(
      { partnerId: PARTNER, onState: () => {} },
      { agora: agoraFactory, peer: () => peerSession, fetchAgoraAccess: async () => Promise.reject(Object.assign(new Error("voice"), { code: "voice_unavailable" })) },
    );
    await voice.connect();
    expect(agoraFactory).not.toHaveBeenCalled();
    expect(peerSession.connect).toHaveBeenCalled();
  });
});
