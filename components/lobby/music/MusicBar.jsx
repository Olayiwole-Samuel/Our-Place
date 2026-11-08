"use client";

import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadYouTube } from "@/lib/media/youtube";
import { musicPosition, nextPosition } from "@/lib/music/queue";
import { formatTime } from "@/lib/room/watch";
import { currentTrack, useMusicStore } from "@/store/musicStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * The music bar: what's playing for both of you, in every room — and the
 * player itself. The song plays from YouTube (a small, visible player in the
 * bar, as YouTube requires) and follows the shared state in public.couple_music
 * exactly like the TV: the database clock says where it should be, and this
 * screen seeks when it drifts.
 *
 *   • A Spotify song gets its YouTube match the first time it's about to play
 *     (POST /api/music/match); the next song is matched while this one plays.
 *   • When a song ends, ONE screen moves on (whoever changed the music last;
 *     the other only if that didn't happen), so you never skip two.
 *   • Phones block sound until you've touched the page: "Tap to listen".
 *   • Dancing: while you're dancing and a song plays, your character dances
 *     (the emote your partner sees too).
 */
const SYNC_EVERY_MS = 1000;
const DRIFT_S = 2;
const SECOND_WRITER_MS = 2500;
const DANCE_EVERY_MS = 4200;
const MAX_TRIES = 3; // different YouTube versions tried for one song before skipping it

const SPOTIFY_RETURN = {
  connected: "Spotify is connected ✓ — search songs or bring in a playlist.",
  cancelled: "Spotify sign-in was cancelled.",
  failed: "Couldn't connect Spotify. Try again (and check the app's Redirect URI in the Spotify dashboard).",
};

/**
 * `compact` (during a game): the bar moves to the bottom-left corner, above the
 * game, as a small pill (play/pause and next); tapping ⌃ opens the full bar
 * there, and tapping anywhere else closes it again. The player itself never
 * moves in the page, so the song keeps playing.
 */
export function MusicBar({ me, onEmote, compact = false }) {
  // Back from Spotify's sign-in (/api/music/spotify/callback → /lobby?music=…): open Music on "Add songs".
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("music");
    if (!result) return;
    url.searchParams.delete("music");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    useMusicStore.setState({ panelTab: "add", flash: SPOTIFY_RETURN[result] ?? null });
    useRoomStore.getState().openPanel("music");
  }, []);

  const music = useMusicStore((state) => state.music);
  const track = useMusicStore(currentTrack);
  const muted = useMusicStore((state) => state.muted);
  const volume = useMusicStore((state) => state.volume);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef(null);
  useEffect(() => {
    if (!volumeOpen) return undefined;
    const away = (event) => !volumeRef.current?.contains(event.target) && setVolumeOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [volumeOpen]);
  const [expanded, setExpanded] = useState(false);
  const barRef = useRef(null);
  useEffect(() => {
    if (!compact) setExpanded(false);
  }, [compact]);
  useEffect(() => {
    if (!compact || !expanded) return undefined;
    const away = (event) => !barRef.current?.contains(event.target) && setExpanded(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [compact, expanded]);
  const mini = compact && !expanded;
  const dancing = useMusicStore((state) => state.dancing);
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [problem, setProblem] = useState(null);
  const [gaveUp, setGaveUp] = useState(false); // tried enough versions of this song: skip it
  const [refused, setRefused] = useState(null); // { trackId, youtubeId } that just refused to play
  const failedRef = useRef(new Map()); // song id → videos that refused to play here
  const [, setTick] = useState(0);
  const youtubeId = track?.youtubeId ?? null;
  const trackId = track?.id ?? null;
  const duration = useMusicStore((state) => state.duration);
  const [scrub, setScrub] = useState(null); // where you're dragging the timeline to (seconds)

  // The song's length: Spotify's until the player knows better.
  useEffect(() => {
    useMusicStore.setState({ duration: track?.durationS ?? 0 });
  }, [trackId, track?.durationS]);
  const trackIdRef = useRef(trackId);
  trackIdRef.current = trackId;

  // A song without its YouTube match yet: find it (the screen that chose it first).
  useEffect(() => {
    if (!trackId || youtubeId) return undefined;
    setProblem(null);
    const delay = music?.updatedBy === me ? 0 : SECOND_WRITER_MS;
    const timer = setTimeout(async () => {
      const result = await useMusicStore.getState().ensureMatched(trackId);
      if (result.error) setProblem(result.error.message);
    }, delay);
    return () => clearTimeout(timer);
  }, [trackId, youtubeId, music?.updatedBy, me]);

  // …and the next one while this plays, so it starts straight away.
  const nextId = music?.queue.length ? music.queue[nextPosition(music, { manual: true }) ?? 0] : null;
  useEffect(() => {
    if (!nextId || !music?.playing || music.updatedBy !== me) return undefined;
    const timer = setTimeout(() => useMusicStore.getState().ensureMatched(nextId), 5000);
    return () => clearTimeout(timer);
  }, [nextId, music?.playing, music?.updatedBy, me]);

  // The YouTube player for the current song.
  useEffect(() => {
    setReady(false);
    if (!youtubeId) return undefined;
    let cancelled = false;
    let yt = null;
    loadYouTube().then((YT) => {
      if (cancelled || !hostRef.current) return;
      const mount = document.createElement("div");
      hostRef.current.replaceChildren(mount);
      yt = new YT.Player(mount, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = yt;
            setReady(true);
            const length = yt.getDuration?.();
            if (length > 0) useMusicStore.setState({ duration: length });
          },
          // Blocked outside YouTube, in this country, or gone: try another version of the song.
          onError: () => !cancelled && setRefused({ trackId: trackIdRef.current, youtubeId }),
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        yt?.destroy();
      } catch {
        // already gone
      }
    };
  }, [youtubeId]);

  // Volume and mute are for THIS phone only (never shared): applied at once.
  useEffect(() => {
    const yt = playerRef.current;
    if (!ready || !yt?.mute) return;
    yt.setVolume?.(volume);
    if (muted || volume === 0) yt.mute();
    else yt.unMute();
  }, [muted, volume, ready]);

  // Follow the shared state: play/pause, and seek when we drift.
  useEffect(() => {
    if (!ready || !music) return undefined;
    const sync = () => {
      const yt = playerRef.current;
      if (!yt?.getPlayerState) return;
      const skewMs = useRoomStore.getState().skewMs ?? 0;
      const expected = musicPosition(music, { skewMs });
      const duration = yt.getDuration?.() || track?.durationS || 0;
      const { muted: silent, volume: level } = useMusicStore.getState();
      if (yt.getVolume?.() !== level) yt.setVolume?.(level);
      if (silent || level === 0) yt.mute();
      else yt.unMute();
      if (!music.playing) {
        if (yt.getPlayerState() === 1) yt.pauseVideo();
        if (Math.abs((yt.getCurrentTime?.() ?? 0) - expected) > DRIFT_S) yt.seekTo(expected, true);
        setBlocked(false);
        return;
      }
      if (duration && expected >= duration - 0.4) return; // the end — handled below
      if (Math.abs((yt.getCurrentTime?.() ?? 0) - expected) > DRIFT_S) yt.seekTo(expected, true);
      const state = yt.getPlayerState();
      if (state !== 1 && state !== 3) {
        yt.playVideo();
        // Still not playing a moment later: the browser wants a tap first.
        setTimeout(() => {
          const now = playerRef.current?.getPlayerState?.();
          setBlocked(now !== 1 && now !== 3 && useMusicStore.getState().music?.playing === true);
        }, 1200);
      } else setBlocked(false);
      setTick((n) => n + 1);
    };
    sync();
    const timer = setInterval(sync, SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, [ready, music, track?.durationS]);

  // The end of a song (on the shared clock): one screen moves on.
  const version = music?.version;
  useEffect(() => {
    if (!music?.playing || !ready) return undefined;
    const duration = playerRef.current?.getDuration?.() || track?.durationS || 0;
    if (!duration) return undefined;
    const skewMs = useRoomStore.getState().skewMs ?? 0;
    const left = (duration - musicPosition(music, { skewMs })) * 1000;
    const delay = Math.max(0, left) + (music.updatedBy === me ? 300 : SECOND_WRITER_MS);
    const timer = setTimeout(() => {
      if (useMusicStore.getState().music?.version !== version) return; // already moved on
      useMusicStore.getState().next({ manual: false });
    }, delay);
    return () => clearTimeout(timer);
    // `version` is the music identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ready, track?.durationS, me]);

  // That version refused: ask for another of the same song (a few times), then give up on it.
  useEffect(() => {
    if (!refused?.trackId) return undefined;
    let cancelled = false;
    const failed = [...(failedRef.current.get(refused.trackId) ?? []), refused.youtubeId];
    failedRef.current.set(refused.trackId, failed);
    const giveUp = () => {
      setProblem("This song won't play here — skipping it.");
      setGaveUp(true);
    };
    if (failed.length >= MAX_TRIES) giveUp();
    else {
      setProblem("That version is blocked — finding another…");
      useMusicStore
        .getState()
        .rematch(refused.trackId, failed)
        .then((result) => {
          if (cancelled) return;
          if (result.error) giveUp();
          else setProblem(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [refused]);
  useEffect(() => {
    setRefused(null);
    setGaveUp(false);
  }, [trackId]);

  // A song that won't play at all: skip it (the screen that chose it).
  useEffect(() => {
    if (!(gaveUp || (problem && !youtubeId)) || !music?.playing || music.updatedBy !== me) return undefined;
    const timer = setTimeout(() => useMusicStore.getState().next({ manual: true }), 2500);
    return () => clearTimeout(timer);
  }, [gaveUp, problem, music?.playing, music?.updatedBy, me, youtubeId]);
  useEffect(() => setProblem(null), [trackId]);
  // A new version of this song (found, or chosen in the panel): start fresh.
  useEffect(() => {
    if (youtubeId) setGaveUp(false);
  }, [youtubeId]);

  // Dancing while a song plays.
  useEffect(() => {
    if (!dancing || !music?.playing) return undefined;
    onEmote?.("dance");
    const timer = setInterval(() => onEmote?.("dance"), DANCE_EVERY_MS);
    return () => clearInterval(timer);
  }, [dancing, music?.playing, onEmote]);

  if (!music?.queue.length || !track) return null;
  const store = useMusicStore.getState();
  const unlock = () => {
    playerRef.current?.playVideo?.();
    setBlocked(false);
  };

  const at = scrub ?? Math.min(store.now(), duration || Infinity);
  const commitScrub = () => {
    if (scrub === null) return;
    store.seek(scrub);
    setScrub(null);
  };

  return (
    <div ref={barRef} className={`music-bar panel pointer-events-auto flex flex-col rounded-[1.4rem] py-1 pr-1.5 pl-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)] ${mini ? "w-auto" : "w-[min(26rem,92vw)]"}`}>
      <div className="flex items-center gap-2">
      <div className={`relative shrink-0 overflow-hidden rounded-full bg-black-900 ${mini ? "size-8" : "h-9 w-16"}`}>
        <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element -- album art from Spotify */}
        {!youtubeId && track.imageUrl && <img src={track.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />}
      </div>
      {mini ? (
        <div className="flex shrink-0 items-center">
          {blocked ? (
            <button type="button" onClick={unlock} className="music-unlock grid h-9 shrink-0 place-items-center rounded-full bg-green-600 px-3 text-micro font-semibold tracking-normal text-white">
              Tap to listen
            </button>
          ) : (
            <>
              <button type="button" aria-label={music.playing ? `Pause ${track.title} for both` : `Play ${track.title} for both`} onClick={() => store.toggle()} className="grid size-9 place-items-center rounded-full bg-white-soft text-black-950">
                {music.playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
              </button>
              <button type="button" aria-label="Next song" onClick={() => store.next()} className="grid size-8 place-items-center rounded-full text-text-secondary hover:bg-black-700">
                <SkipForward aria-hidden="true" size={15} />
              </button>
            </>
          )}
          <button type="button" aria-label="Show all music controls" aria-expanded="false" onClick={() => setExpanded(true)} className="grid size-8 place-items-center rounded-full text-text-secondary hover:bg-black-700">
            <ChevronUp aria-hidden="true" size={16} />
          </button>
        </div>
      ) : (
      <>
      <button type="button" onClick={() => useRoomStore.getState().openPanel("music")} className="min-w-0 flex-1 text-left" aria-label={`Music: ${track.title}. Open the music panel`}>
        <span className="block truncate text-caption font-semibold text-white-soft">
          {music.ourSong === track.id && <span aria-label="Our song">❤️ </span>}
          {track.title}
        </span>
        <span className="block truncate text-micro tracking-normal text-text-muted">{problem ?? (blocked ? "Tap ▶ to listen on this phone" : !youtubeId ? "Finding the song…" : track.artist || (music.playing ? "Playing for both of you" : "Paused"))}</span>
      </button>
      {blocked ? (
        <button type="button" onClick={unlock} className="music-unlock grid h-9 shrink-0 place-items-center rounded-full bg-green-600 px-3 text-micro font-semibold tracking-normal text-white">
          Tap to listen
        </button>
      ) : (
        <div className="flex shrink-0 items-center">
          <button type="button" aria-label="Previous" onClick={() => store.previous()} className="grid size-8 place-items-center rounded-full text-text-secondary hover:bg-black-700">
            <SkipBack aria-hidden="true" size={15} />
          </button>
          <button type="button" aria-label={music.playing ? "Pause for both" : "Play for both"} onClick={() => store.toggle()} className="grid size-9 place-items-center rounded-full bg-white-soft text-black-950">
            {music.playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
          </button>
          <button type="button" aria-label="Next" onClick={() => store.next()} className="grid size-8 place-items-center rounded-full text-text-secondary hover:bg-black-700">
            <SkipForward aria-hidden="true" size={15} />
          </button>
          <span ref={volumeRef} className="relative">
            <button type="button" aria-label={`Music volume on this phone: ${muted ? "muted" : `${volume}%`}`} aria-expanded={volumeOpen} onClick={() => setVolumeOpen((open) => !open)} className={`grid size-8 place-items-center rounded-full hover:bg-black-700 ${muted || volume === 0 ? "text-pink-400" : "text-text-secondary"}`}>
              {muted || volume === 0 ? <VolumeX aria-hidden="true" size={15} /> : <Volume2 aria-hidden="true" size={15} />}
            </button>
            {volumeOpen && (
              <span className={`panel absolute right-0 z-30 flex w-52 ${compact ? "bottom-full mb-2" : "top-full mt-2"} flex-col gap-2 rounded-[var(--radius-md)] p-3 shadow-lg`}>
                <label htmlFor="music-volume" className="flex items-baseline justify-between text-caption font-semibold text-white-soft">
                  Music volume <span className="text-micro font-normal tracking-normal text-text-secondary">{muted ? "muted" : `${volume}%`}</span>
                </label>
                <input id="music-volume" type="range" min={0} max={100} step={5} value={muted ? 0 : volume} onChange={(event) => store.setVolume(Number(event.target.value))} className="accent-green-500" />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[0.65rem] leading-snug text-text-muted">Only on this phone — not your partner&apos;s, not your voice call.</span>
                  <button type="button" onClick={() => store.setMuted(!muted)} className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-micro tracking-normal text-text-secondary hover:bg-black-700">
                    {muted ? "Unmute" : "Mute"}
                  </button>
                </span>
              </span>
            )}
          </span>
          <button type="button" aria-pressed={dancing} aria-label={dancing ? "Stop dancing" : "Dance"} onClick={() => store.setDancing(!dancing)} className={`grid size-8 place-items-center rounded-full text-[0.95rem] ${dancing ? "bg-pink-500/30" : "hover:bg-black-700"}`}>
            💃
          </button>
          {compact && (
            <button type="button" aria-label="Hide music controls" aria-expanded="true" onClick={() => setExpanded(false)} className="grid size-8 place-items-center rounded-full text-text-secondary hover:bg-black-700">
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      )}
      </>
      )}
      </div>
      {/* The timeline: drag to any moment, or jump 10 s back / forward — for both of you. */}
      {!mini && (
      <div className="flex items-center gap-1.5 pt-0.5 pr-1 pl-2 text-[0.62rem] tabular-nums text-text-muted">
        <button type="button" aria-label="Back 10 seconds" title="Back 10 s" onClick={() => store.skipBy(-10)} className="grid size-6 place-items-center rounded-full hover:bg-black-700 hover:text-white-soft">
          <RotateCcw aria-hidden="true" size={12} />
        </button>
        <span className="w-8 text-right">{formatTime(at)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration || 0))}
          step={1}
          value={Math.floor(at)}
          disabled={!duration}
          aria-label="Song position"
          aria-valuetext={`${formatTime(at)} of ${formatTime(duration)}`}
          onChange={(event) => setScrub(Number(event.target.value))}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          className="music-timeline h-1 min-w-0 flex-1 accent-green-500"
        />
        <span className="w-8">{duration ? formatTime(duration) : "–:––"}</span>
        <button type="button" aria-label="Forward 10 seconds" title="Forward 10 s" onClick={() => store.skipBy(10)} className="grid size-6 place-items-center rounded-full hover:bg-black-700 hover:text-white-soft">
          <RotateCw aria-hidden="true" size={12} />
        </button>
      </div>
      )}
    </div>
  );
}
