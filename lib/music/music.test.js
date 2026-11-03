import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { beat, musicPosition, nextPosition, playNext, previousPosition, shuffleQueue, unshuffleQueue } = await import("./queue");
const { cleanTitle, isSameSong, isoSeconds, pickBest, playableHere, searchPlans } = await import("./youtube.server");
const { parseYouTube } = await import("@/lib/room/watch");
const { mixRadio, toTrack } = await import("./spotify.server");

const music = (over = {}) => ({ queue: ["a", "b", "c"], position: 0, playing: true, atSeconds: 10, updatedAt: new Date(1_000_000).toISOString(), repeat: "all", ...over });

describe("the shared player", () => {
  it("knows where the song is on the shared clock", () => {
    expect(musicPosition(music(), { now: 1_005_000 })).toBeCloseTo(15);
    expect(musicPosition(music({ playing: false }), { now: 1_005_000 })).toBe(10);
    expect(musicPosition(music(), { now: 1_005_000, skewMs: 1000 })).toBeCloseTo(16); // this phone's clock is a second behind
    expect(musicPosition(music({ queue: [] }))).toBe(0);
  });

  it("moves on by the repeat mode", () => {
    expect(nextPosition(music({ position: 1 }))).toBe(2);
    expect(nextPosition(music({ position: 2 }))).toBe(0); // repeat all
    expect(nextPosition(music({ position: 2, repeat: "off" }))).toBeNull(); // the end
    expect(nextPosition(music({ position: 2, repeat: "off" }), { manual: true })).toBe(0); // you tapped Next
    expect(nextPosition(music({ position: 1, repeat: "one" }))).toBe(1);
    expect(nextPosition(music({ position: 1, repeat: "one" }), { manual: true })).toBe(2);
    expect(previousPosition(music({ position: 1 }), 2)).toBe(0);
    expect(previousPosition(music({ position: 1 }), 30)).toBe(1); // a while in: back to its start
  });

  it("shuffles around the current song, and un-shuffles back to the playlist's order", () => {
    const random = () => 0.3;
    const { queue, position } = shuffleQueue(["a", "b", "c", "d"], 2, random);
    expect(queue[position]).toBe("c");
    expect(position).toBe(0);
    expect([...queue].sort()).toEqual(["a", "b", "c", "d"]);
    expect(unshuffleQueue(queue, 0, ["a", "b", "c", "d"])).toEqual({ queue: ["a", "b", "c", "d"], position: 2 });
  });

  it("plays a song next without stopping this one", () => {
    expect(playNext(["a", "b", "c"], 0, "c")).toEqual({ queue: ["a", "c", "b"], position: 0 });
    expect(playNext(["a", "b"], 1, "x")).toEqual({ queue: ["a", "b", "x"], position: 1 });
  });

  it("pulses on the beat", () => {
    expect(beat(0)).toBeCloseTo(1);
    expect(beat(0.25)).toBeLessThan(0.3);
  });
});

describe("finding a Spotify song on YouTube", () => {
  it("reads YouTube durations", () => {
    expect(isoSeconds("PT3M21S")).toBe(201);
    expect(isoSeconds("PT1H2M")).toBe(3720);
    expect(isoSeconds("nope")).toBeNull();
  });

  it("prefers the original at the right length over live versions and covers", () => {
    const song = { title: "Essence", artist: "Wizkid, Tems", durationS: 248 };
    const best = pickBest(
      [
        { id: "live1234567", rank: 0, title: "Wizkid - Essence (Live at the O2)", channel: "Wizkid", durationS: 300, embeddable: true },
        { id: "cover123456", rank: 1, title: "Essence cover", channel: "Someone", durationS: 249, embeddable: true },
        { id: "topic123456", rank: 2, title: "Essence", channel: "Wizkid - Topic", durationS: 248, embeddable: true },
        { id: "blocked1234", rank: 3, title: "Wizkid - Essence (Official Audio)", channel: "Wizkid", durationS: 248, embeddable: false },
      ],
      song,
    );
    expect(best.id).toBe("topic123456");
    expect(pickBest([{ id: "x", rank: 0, title: "a", channel: "b", durationS: 1, embeddable: false }], song)).toBeNull();
  });

  it("leaves out videos that can't play here: blocked in Nigeria, age-restricted, not embeddable", () => {
    const ok = { status: { embeddable: true, privacyStatus: "public" }, contentDetails: {} };
    expect(playableHere(ok, "NG")).toBe(true);
    expect(playableHere({ ...ok, contentDetails: { regionRestriction: { blocked: ["NG", "GH"] } } }, "NG")).toBe(false);
    expect(playableHere({ ...ok, contentDetails: { regionRestriction: { allowed: ["US"] } } }, "NG")).toBe(false);
    expect(playableHere({ ...ok, contentDetails: { contentRating: { ytRating: "ytAgeRestricted" } } }, "NG")).toBe(false);
    expect(playableHere({ ...ok, status: { embeddable: false } }, "NG")).toBe(false);
    expect(playableHere({ ...ok, status: { embeddable: true, privacyStatus: "private" } }, "NG")).toBe(false);
  });

  it("finds songs with few uploads: a looser search, with all the artists, if the first finds nothing", () => {
    const [strict, loose] = searchPlans({ title: "Fi Kan We Kan (feat. Someone)", artist: "Bnxn, Rema" }, "NG");
    expect(strict).toMatchObject({ q: "Bnxn Fi Kan We Kan", videoSyndicated: "true", regionCode: "NG" });
    expect(loose.q).toBe("Bnxn Rema Fi Kan We Kan");
    expect(loose.videoSyndicated).toBeUndefined();
    expect(cleanTitle("Essence (feat. Tems) - Remastered 2021")).toBe("Essence");
  });

  it("only accepts a video that really is the song", () => {
    expect(isSameSong("Bnxn, Rema - Fi Kan We Kan (Official Video)", "Fi Kan We Kan")).toBe(true);
    expect(isSameSong("Bnxn - Gwagwalada (Official Video)", "Fi Kan We Kan")).toBe(false);
    const song = { title: "Fi Kan We Kan", artist: "Bnxn, Rema", durationS: 159 };
    const best = pickBest(
      [
        { id: "wrong123456", rank: 0, title: "Bnxn - Gwagwalada", channel: "Bnxn - Topic", durationS: 159, embeddable: true },
        { id: "video123456", rank: 1, title: "Bnxn, Rema - Fi Kan We Kan (Official Video)", channel: "Bnxn TYE", durationS: 185, embeddable: true },
        { id: "audio123456", rank: 2, title: "Bnxn, Rema - Fi Kan We Kan (Lyrics)", channel: "R&BHype", durationS: 159, embeddable: true },
      ],
      song,
    );
    expect(best.id).toBe("audio123456"); // the right song at the right length
  });

  it("takes YouTube Music links too", () => {
    expect(parseYouTube("https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share")).toBe("dQw4w9WgXcQ");
  });

  it("mixes a song radio: no repeats, no other versions of the seed song, nothing already queued", () => {
    const song = (spotifyId, title) => ({ spotifyId, title, artist: "Wizkid" });
    const radio = mixRadio(
      [song("a", "Essence (feat. Tems)"), song("b", "Joro"), song("c", "Joro - Remix"), song("b", "Joro"), song("d", "Ojuelegba"), song("e", "Soco")],
      { title: "Essence", exclude: ["e"], count: 10, random: () => 0 },
    );
    expect(radio.map((t) => t.spotifyId).sort()).toEqual(["b", "d"]);
    expect(mixRadio([song("x", "One"), song("y", "Two"), song("z", "Three")], { title: "Seed", count: 2 })).toHaveLength(2);
  });

  it("turns a Spotify track into one of ours", () => {
    expect(toTrack({ type: "track", id: "abc123def456", name: "Calm Down", artists: [{ name: "Rema" }, { name: "Selena Gomez" }], duration_ms: 239_000, album: { images: [{ url: "https://i.scdn.co/big", width: 640 }, { url: "https://i.scdn.co/small", width: 300 }] } })).toEqual({
      spotifyId: "abc123def456",
      title: "Calm Down",
      artist: "Rema, Selena Gomez",
      imageUrl: "https://i.scdn.co/small",
      durationS: 239,
    });
    expect(toTrack({ type: "episode", id: "x" })).toBeNull();
  });
});
