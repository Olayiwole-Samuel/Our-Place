import { describe, expect, it } from "vitest";
import { episodeLabel, groupVideos, parseEpisode, siblingEpisode } from "./series";

const video = (id, title, extra = {}) => ({ id, title, status: "ready", createdAt: `2026-10-21T10:0${id.length}:00Z`, ...extra });

describe("series on the TV", () => {
  it("reads series, season and episode from common file names", () => {
    expect(parseEpisode("Squid Game S01E03 Red Light Green Light 1080p WEB x264")).toEqual({ series: "Squid Game", season: 1, episode: 3, name: "Red Light Green Light" });
    expect(parseEpisode("squid.game.s02e10.720p")).toEqual({ series: "squid game", season: 2, episode: 10, name: null });
    expect(parseEpisode("Wednesday 1x04")).toMatchObject({ series: "Wednesday", season: 1, episode: 4 });
    expect(parseEpisode("King of Boys - Season 2 Episode 5")).toMatchObject({ series: "King of Boys", season: 2, episode: 5 });
    expect(parseEpisode("Blood Sisters - Episode 2")).toMatchObject({ series: "Blood Sisters", season: 1, episode: 2 });
    expect(parseEpisode("Shanty Town Ep 1")).toMatchObject({ series: "Shanty Town", episode: 1 });
    for (const movie of ["The Wedding Party", "WhatsApp Video 2026-10-20 at 21.04.11", "Beach day", "Episode 4"]) expect(parseEpisode(movie)).toBeNull();
  });

  it("groups episodes in order, keeps movies apart, and respects series set by hand", () => {
    const videos = [
      video("a", "Squid Game S01E02"),
      video("b", "The Wedding Party"),
      video("c", "squid.game.s01e01"),
      video("d", "Squid Game S02E01"),
      video("e", "Lone Show S01E01"), // a single "episode" stays with the movies…
      video("f", "Our trip", { series: "Holidays", season: 1, episode: 2 }), // …unless put in a series on purpose
    ];
    const { series, singles } = groupVideos(videos);
    expect(series.map((group) => [group.name, group.episodes.map((entry) => entry.video.id), group.seasons])).toEqual([
      ["Holidays", ["f"], 1],
      ["Squid Game", ["c", "a", "d"], 2],
    ]);
    expect(singles.map((v) => v.id).sort()).toEqual(["b", "e"]);
  });

  it("finds the next and previous episode (ready ones only), across seasons", () => {
    const videos = [video("1", "Show S01E01"), video("2", "Show S01E02"), video("3", "Show S01E03", { status: "uploading" }), video("4", "Show S02E01"), video("m", "A Movie")];
    expect(siblingEpisode(videos, "1")?.id).toBe("2");
    expect(siblingEpisode(videos, "2")?.id).toBe("4"); // E3 isn't uploaded yet
    expect(siblingEpisode(videos, "4")).toBeNull();
    expect(siblingEpisode(videos, "4", -1)?.id).toBe("2");
    expect(siblingEpisode(videos, "m")).toBeNull();
  });

  it("labels episodes briefly", () => {
    expect(episodeLabel({ season: 1, episode: 3 })).toBe("S1 · E3");
    expect(episodeLabel({ season: 2, episode: null })).toBe("S2");
    expect(episodeLabel(null)).toBe("");
  });
});
