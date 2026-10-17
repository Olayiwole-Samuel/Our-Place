// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPeerVoiceSession } from "./peerVoiceSession";

const A = "11111111-1111-4111-8111-111111111111"; // smaller id → starts the connection
const B = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await tick();
};

/** In-memory Realtime: broadcasts reach every other subscriber of the same topic. */
function fakeRealtime() {
  const subscribers = new Map();
  const sent = [];
  const statusCallbacks = [];
  return {
    sent,
    statusCallbacks,
    client() {
      return {
        realtime: { setAuth: async () => {} },
        channel(topic) {
          const handlers = [];
          const channel = {
            topic,
            on: (_type, _filter, handler) => (handlers.push(handler), channel),
            subscribe(callback) {
              statusCallbacks.push(callback);
              subscribers.set(channel, handlers);
              setTimeout(() => callback("SUBSCRIBED"), 0);
              return channel;
            },
            send: async ({ payload }) => {
              sent.push({ topic, payload });
              for (const [other, list] of subscribers) if (other !== channel && other.topic === topic) setTimeout(() => list.forEach((h) => h({ payload })), 0);
            },
          };
          return channel;
        },
        removeChannel: async (channel) => subscribers.delete(channel),
      };
    },
  };
}

/** Minimal RTCPeerConnection pair: offer/answer by reference, "connects" when the answer lands. */
const registry = new Map();
let pcSeq = 0;
class FakePeerConnection {
  constructor() {
    this.id = `pc${++pcSeq}`;
    this.connectionState = "new";
    this.signalingState = "stable";
    this.transceivers = [];
    this.remoteDescription = null;
    this.closed = false;
    registry.set(this.id, this);
  }
  addTransceiver() {
    const sender = { track: null, replaceTrack: vi.fn(async (track) => (sender.track = track)) };
    this.transceivers.push({ sender });
  }
  getTransceivers() {
    return this.transceivers;
  }
  async createOffer() {
    return { type: "offer", sdp: this.id };
  }
  async createAnswer() {
    return { type: "answer", sdp: this.id };
  }
  async setLocalDescription(description) {
    this.localDescription = description;
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    const other = registry.get(description.sdp);
    if (description.type === "offer" && !this.transceivers.length) this.addTransceiver();
    if (description.type === "answer") {
      this.peer = other;
      other.peer = this;
      for (const pc of [this, other]) {
        pc.connectionState = "connected";
        pc.ontrack?.({ streams: [{ id: "remote" }] });
        pc.onconnectionstatechange?.();
      }
      this.onicecandidate?.({ candidate: { candidate: "host" } });
    }
  }
  async addIceCandidate() {}
  close() {
    this.closed = true;
    this.connectionState = "closed";
    if (this.peer && !this.peer.closed) {
      this.peer.connectionState = "disconnected";
      this.peer.onconnectionstatechange?.();
    }
  }
}

const peerConfigs = [];
function session(realtime, userId, partnerId, state, extra = {}) {
  return createPeerVoiceSession({
    getSupabase: async () => realtime.client(),
    ...extra,
    coupleId: COUPLE,
    userId,
    partnerId,
    onState: (patch) => Object.assign(state, patch),
    createPeerConnection: (config) => (peerConfigs.push(config), new FakePeerConnection()),
  });
}

let track;
beforeEach(() => {
  registry.clear();
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  track = { kind: "audio", stop: vi.fn() };
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track] })) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("direct (peer-to-peer) voice", () => {
  it("connects the two partners over the couple's private voice topic, mic off", async () => {
    const realtime = fakeRealtime();
    const a = {};
    const b = {};
    const sa = session(realtime, A, B, a);
    const sb = session(realtime, B, A, b);
    await sa.connect();
    await sb.connect();
    await settle();
    expect(realtime.sent.every((m) => m.topic === `our-place:couple:${COUPLE}:voice`)).toBe(true);
    expect(realtime.sent.map((m) => m.payload.type)).toEqual(expect.arrayContaining(["hello", "offer", "answer"]));
    expect(a).toMatchObject({ status: "connected", partner: { connected: true, muted: true } });
    expect(b).toMatchObject({ status: "connected", partner: { connected: true, muted: true } });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    // No media or audio data ever goes through signaling.
    expect(JSON.stringify(realtime.sent)).not.toMatch(/MediaStream|audio data/);
  });

  it("mic on sends the real track to the partner; mic off stops and releases it", async () => {
    const realtime = fakeRealtime();
    const a = {};
    const b = {};
    const sa = session(realtime, A, B, a);
    const sb = session(realtime, B, A, b);
    await sa.connect();
    await sb.connect();
    await settle();
    await sb.setMic(true);
    await settle();
    const bSender = [...registry.values()].find((pc) => !pc.closed && pc.transceivers.length && pc.localDescription?.type === "answer").transceivers[0].sender;
    expect(bSender.track).toBe(track);
    expect(b.micEnabled).toBe(true);
    expect(a.partner.muted).toBe(false);
    await sb.setMic(false);
    await settle();
    expect(bSender.track).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(a.partner.muted).toBe(true);
  });

  it("ignores signals that don't come from the partner", async () => {
    const realtime = fakeRealtime();
    const a = {};
    const sa = session(realtime, A, B, a);
    await sa.connect();
    await settle();
    const stranger = realtime.client().channel(`our-place:couple:${COUPLE}:voice`);
    stranger.subscribe(() => {});
    await stranger.send({ payload: { type: "hello", from: "99999999-9999-4999-8999-999999999999", sid: "x", mic: true } });
    await settle();
    expect(a.partner).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("leaving says goodbye: the partner sees voice disconnect and nothing keeps running", async () => {
    const realtime = fakeRealtime();
    const a = {};
    const b = {};
    const sa = session(realtime, A, B, a);
    const sb = session(realtime, B, A, b);
    await sa.connect();
    await sb.connect();
    await settle();
    await sb.setMic(true);
    await sb.destroy();
    await settle();
    expect(track.stop).toHaveBeenCalled();
    expect(a.partner.connected).toBe(false);
    expect([...registry.values()].every((pc) => pc.closed || pc.connectionState !== "connected")).toBe(true);
  });

  it("a signaling hiccup over a healthy call doesn't leave voice stuck 'reconnecting'", async () => {
    const realtime = fakeRealtime();
    const a = {};
    const sa = session(realtime, A, B, a);
    const sb = session(realtime, B, A, {});
    await sa.connect();
    await sb.connect();
    await settle();
    expect(a.status).toBe("connected");
    const [aStatus] = realtime.statusCallbacks;
    aStatus("CHANNEL_ERROR");
    expect(a.status).toBe("reconnecting");
    aStatus("SUBSCRIBED"); // the channel rejoins; the call itself never dropped
    expect(a.status).toBe("connected");
    expect(a.partner.connected).toBe(true);
  });

  it("a partner who vanishes without goodbye: after a few seconds voice is available again and re-handshakes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const realtime = fakeRealtime();
      const a = {};
      const sa = session(realtime, A, B, a);
      const sb = session(realtime, B, A, {});
      await sa.connect();
      await sb.connect();
      await settle();
      const aPeer = [...registry.values()].find((pc) => pc.localDescription?.type === "offer" && !pc.closed);
      aPeer.connectionState = "disconnected"; // the partner's tab is gone; no "bye" arrived
      aPeer.onconnectionstatechange();
      expect(a.status).toBe("reconnecting");
      const hellosBefore = realtime.sent.filter((m) => m.payload.type === "hello" && m.payload.from === A).length;
      await vi.advanceTimersByTimeAsync(8_000);
      expect(a.status).toBe("connected");
      expect(aPeer.closed).toBe(true);
      expect(realtime.sent.filter((m) => m.payload.type === "hello" && m.payload.from === A).length).toBe(hellosBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the server's ICE servers (TURN relay) for the connection; falls back to STUN if they can't be fetched", async () => {
    const realtime = fakeRealtime();
    const turn = [{ urls: ["turn:relay.example.com:3478"], username: "u", credential: "c" }];
    peerConfigs.length = 0;
    const sa = session(realtime, A, B, {}, { getIceServers: async () => turn });
    const sb = session(realtime, B, A, {}, { getIceServers: async () => { throw new Error("offline"); } });
    await sa.connect();
    await sb.connect();
    await settle();
    expect(peerConfigs.some((config) => config.iceServers === turn)).toBe(true);
    expect(peerConfigs.some((config) => config.iceServers[0].urls.some((url) => url.startsWith("stun:")))).toBe(true);
  });

  it("a partner reload replaces the old connection", async () => {
    const realtime = fakeRealtime();
    const a = {};
    const sa = session(realtime, A, B, a);
    await sa.connect();
    const first = session(realtime, B, A, {});
    await first.connect();
    await settle();
    await first.destroy();
    const again = {};
    const second = session(realtime, B, A, again);
    await second.connect();
    await settle();
    expect(a.partner.connected).toBe(true);
    expect(again.partner.connected).toBe(true);
  });
});
