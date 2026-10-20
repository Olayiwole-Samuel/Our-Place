"use client";

import { Clapperboard, Film, Maximize, MonitorPlay, Pause, Play, Square, Trash2, Tv, Upload, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VIDEO_TYPES, expectedPosition, formatTime, needsSeek, parseYouTube, videoTypeOf } from "@/lib/room/watch";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel } from "./RoomPanel";

/**
 * The TV: watch together in sync — YouTube links, your movies, and your own
 * videos (uploaded to private Backblaze B2 storage).
 *
 * One shared state (couple_watch via set_watch()): what's on, playing or
 * paused, and where. Our own controls (not the player's) change it, so every
 * play / pause / seek happens for both of you; each screen then lines itself
 * up with the shared moment (lib/room/watch.js) and corrects drift every few
 * seconds. Volume and full screen are yours alone.
 */
const DRIFT_CHECK_MS = 3000;

export function TvPanel({ me, partnerName }) {
  const watch = useRoomStore((state) => state.watch);
  const videos = useRoomStore((state) => state.videos);
  const [tab, setTab] = useState(watch?.source?.type === "video" ? "movies" : "youtube");
  const [uploads, setUploads] = useState(null); // whether video storage is set up
  useEffect(() => {
    fetch("/api/room/videos", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => setUploads(Boolean(data?.uploads)))
      .catch(() => setUploads(false));
  }, []);

  const playSource = (source) => useRoomStore.getState().setWatch({ source, playing: true, atSeconds: 0 });
  const stop = () => useRoomStore.getState().setWatch({ source: null, playing: false, atSeconds: 0 });

  return (
    <RoomPanel
      title="TV"
      icon={<Tv size={16} />}
      wide
      actions={
        watch?.source && (
          <button type="button" onClick={stop} className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-2.5 text-micro tracking-normal text-white-soft">
            <Square aria-hidden="true" size={12} /> Stop
          </button>
        )
      }
    >
      <div className="tv-layout flex flex-col gap-2 p-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          {watch?.source ? (
            <Player watch={watch} me={me} partnerName={partnerName} />
          ) : (
            <div className="tv-screen grid place-items-center rounded-[var(--radius-md)] bg-black text-center">
              <div className="p-4">
                <p className="text-body font-semibold text-white-soft">Nothing on yet</p>
                <p className="text-caption text-text-secondary">Pick something — it plays for both of you, in sync.</p>
              </div>
            </div>
          )}
        </div>
        <aside className="tv-library flex w-full flex-col gap-2 sm:w-[15rem] sm:shrink-0">
          <div role="tablist" aria-label="What to watch" className="grid grid-cols-3 gap-1">
            {[
              ["youtube", "YouTube", <MonitorPlay key="i" aria-hidden="true" size={14} />],
              ["movies", "Movies", <Film key="i" aria-hidden="true" size={14} />],
              ["clips", "Ours", <Clapperboard key="i" aria-hidden="true" size={14} />],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex min-h-9 items-center justify-center gap-1 rounded-[var(--radius-sm)] text-micro tracking-normal ${tab === id ? "bg-green-700/60 font-semibold text-white-soft" : "bg-black-800 text-text-secondary"}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          {tab === "youtube" && <YouTubeForm onPlay={playSource} />}
          {tab !== "youtube" && <Library kind={tab === "movies" ? "movie" : "clip"} videos={videos} uploads={uploads} onPlay={playSource} playingId={watch?.source?.type === "video" ? watch.source.id : null} />}
        </aside>
      </div>
    </RoomPanel>
  );
}

function YouTubeForm({ onPlay }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const id = parseYouTube(link);
    if (!id) {
      setError("That doesn't look like a YouTube link.");
      return;
    }
    setBusy(true);
    const info = await fetch(`/api/room/youtube?id=${id}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .catch(() => ({}));
    setBusy(false);
    if (info.embeddable === false) {
      setError("That video can't be played outside YouTube.");
      return;
    }
    setError(null);
    setLink("");
    onPlay({ type: "youtube", id, title: info.title || "YouTube video" });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor="yt-link" className="text-micro tracking-normal text-text-muted">
        Paste a YouTube link
      </label>
      <input id="yt-link" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://youtu.be/…" className="min-h-10 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-caption text-white-soft outline-none focus:ring-1 focus:ring-green-500" />
      <button type="submit" disabled={!link.trim() || busy} className="min-h-10 rounded-[var(--radius-sm)] bg-green-600 text-caption font-semibold text-white disabled:opacity-40">
        {busy ? "Finding it…" : "Play for both of us"}
      </button>
      {error && (
        <p role="alert" className="text-micro tracking-normal text-pink-400">
          {error}
        </p>
      )}
    </form>
  );
}

function Library({ kind, videos, uploads, onPlay, playingId }) {
  const list = videos.filter((video) => video.kind === kind);
  const [progress, setProgress] = useState(null); // { title, loaded, total } | { error }
  const fileRef = useRef(null);

  const upload = async (file) => {
    const contentType = videoTypeOf(file);
    if (!contentType) {
      setProgress({ error: `Pick a video file (${Object.values(VIDEO_TYPES).join(", ")}).` });
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim().slice(0, 120) || "Our video";
    setProgress({ title, loaded: 0, total: file.size });
    const start = await fetch("/api/room/videos", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, kind, size: file.size, contentType }) })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .catch(() => ({ ok: false, data: null }));
    if (!start.ok) {
      setProgress({ error: start.data?.error?.message ?? "Couldn't start the upload." });
      return;
    }
    useRoomStore.getState().refresh("videos");
    const ok = await new Promise((resolve) => {
      const request = new XMLHttpRequest();
      request.open("PUT", start.data.uploadUrl);
      request.setRequestHeader("Content-Type", contentType);
      request.upload.onprogress = (event) => setProgress((current) => current && !current.error && { ...current, loaded: event.loaded });
      request.onload = () => resolve(request.status >= 200 && request.status < 300);
      request.onerror = () => resolve(false);
      request.send(file);
    });
    if (!ok) {
      await fetch("/api/room/videos", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: start.data.id }) });
      setProgress({ error: "The upload didn't finish. Check your connection and try again." });
      useRoomStore.getState().refresh("videos");
      return;
    }
    const done = await fetch(`/api/room/videos/${start.data.id}`, { method: "POST", credentials: "same-origin" }).then((r) => r.ok);
    setProgress(done ? null : { error: "Uploaded, but we couldn't check the file. Try again." });
    useRoomStore.getState().refresh("videos");
  };

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="video/*,.mkv,.mov"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />
      {uploads === false ? (
        <p className="rounded-[var(--radius-sm)] bg-black-800 p-2 text-micro tracking-normal text-text-secondary">Uploading isn&apos;t set up yet — add the Backblaze B2 keys (see README). YouTube works now.</p>
      ) : (
        <button type="button" disabled={!uploads || Boolean(progress && !progress.error)} onClick={() => fileRef.current?.click()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] text-caption text-white-soft disabled:opacity-40">
          <Upload aria-hidden="true" size={14} /> {kind === "movie" ? "Upload a movie" : "Upload our video"}
        </button>
      )}
      {progress && !progress.error && (
        <div className="rounded-[var(--radius-sm)] bg-black-800 p-2">
          <p className="truncate text-micro tracking-normal text-white-soft">Uploading {progress.title}…</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black-950">
            <div className="h-full bg-green-500" style={{ width: `${(progress.loaded / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <p className="mt-0.5 text-[0.65rem] text-text-muted">
            {Math.round(progress.loaded / 1e6)} / {Math.round(progress.total / 1e6)} MB · keep this open
          </p>
        </div>
      )}
      {progress?.error && (
        <p role="alert" className="text-micro tracking-normal text-pink-400">
          {progress.error}
        </p>
      )}
      <ul className="flex max-h-[14rem] flex-col gap-1 overflow-y-auto overscroll-contain short:max-h-[8rem]">
        {list.length === 0 && <li className="py-2 text-center text-micro tracking-normal text-text-muted">{kind === "movie" ? "No movies yet." : "No videos of you two yet."}</li>}
        {list.map((video) => (
          <li key={video.id} className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] p-1.5 ${playingId === video.id ? "bg-green-700/40" : "bg-black-800"}`}>
            <button type="button" disabled={video.status !== "ready"} onClick={() => onPlay({ type: "video", id: video.id, title: video.title })} className="grid size-8 shrink-0 place-items-center rounded-full bg-green-600 text-white disabled:bg-black-700" aria-label={`Play ${video.title}`}>
              <Play aria-hidden="true" size={13} />
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption text-white-soft">{video.title}</span>
              <span className="block text-[0.65rem] text-text-muted">{video.status === "ready" ? `${(video.sizeBytes / 1e9).toFixed(video.sizeBytes > 1e9 ? 1 : 2)} GB` : "Uploading…"}</span>
            </span>
            <button
              type="button"
              aria-label={`Delete ${video.title}`}
              onClick={async () => {
                if (!window.confirm(`Delete “${video.title}” for both of you?`)) return;
                await fetch("/api/room/videos", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: video.id }) });
                useRoomStore.getState().refresh("videos");
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-black-700"
            >
              <Trash2 aria-hidden="true" size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── The player ────────────────────────────────────────────────────────────

/** Loads the YouTube IFrame API once. */
let youtubeApi = null;
function loadYouTube() {
  youtubeApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return youtubeApi;
}

/**
 * A uniform player around <video> and YouTube: { time(), duration(), play(),
 * pause(), seek(s), setMuted(b), destroy() }.
 */
function usePlayer(source, hostRef, videoRef) {
  const [player, setPlayer] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const sourceKey = source ? `${source.type}:${source.id}` : null;

  useEffect(() => {
    setPlayer(null);
    setError(null);
    setUrl(null);
    if (!source) return undefined;
    let cancelled = false;
    let yt = null;
    if (source.type === "youtube") {
      loadYouTube().then((YT) => {
        if (cancelled || !hostRef.current) return;
        const mount = document.createElement("div");
        hostRef.current.replaceChildren(mount);
        yt = new YT.Player(mount, {
          videoId: source.id,
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: () =>
              !cancelled &&
              setPlayer({
                time: () => yt.getCurrentTime?.() ?? 0,
                duration: () => yt.getDuration?.() ?? 0,
                play: () => yt.playVideo(),
                pause: () => yt.pauseVideo(),
                seek: (s) => yt.seekTo(s, true),
                setMuted: (muted) => (muted ? yt.mute() : yt.unMute()),
                isPlaying: () => yt.getPlayerState?.() === 1,
              }),
            onError: () => !cancelled && setError("This video can't be played here."),
          },
        });
      });
    } else {
      fetch(`/api/room/videos/${source.id}`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (!data?.url) setError("This video isn't available.");
          else setUrl(data.url);
        })
        .catch(() => !cancelled && setError("Couldn't load the video."));
    }
    return () => {
      cancelled = true;
      try {
        yt?.destroy();
      } catch {
        // already gone
      }
    };
    // sourceKey captures the source identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // <video> player once its URL is known.
  useEffect(() => {
    const video = videoRef.current;
    if (!url || !video) return undefined;
    const ready = () =>
      setPlayer({
        time: () => video.currentTime,
        duration: () => (Number.isFinite(video.duration) ? video.duration : 0),
        play: () => video.play(),
        pause: () => video.pause(),
        seek: (s) => {
          video.currentTime = s;
        },
        setMuted: (muted) => {
          video.muted = muted;
        },
        isPlaying: () => !video.paused,
      });
    const failed = () => setError("This file can't be played in this browser (try MP4 / H.264).");
    video.addEventListener("loadedmetadata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    return () => {
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("error", failed);
    };
  }, [url, videoRef]);

  return { player, url, error };
}

function Player({ watch, me, partnerName }) {
  const skewMs = useRoomStore((state) => state.skewMs) ?? 0;
  const hostRef = useRef(null);
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const { player, url, error } = usePlayer(watch.source, hostRef, videoRef);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(0); // display time
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState(null);

  // Line the local player up with the shared moment.
  const reconcile = useCallback(() => {
    if (!player) return;
    const expected = expectedPosition(watch, { skewMs });
    if (needsSeek(player.time(), expected)) player.seek(expected);
    if (watch.playing && !player.isPlaying()) {
      Promise.resolve(player.play()).then(
        () => setBlocked(false),
        () => setBlocked(true), // the browser wants a tap before playing sound
      );
    } else if (!watch.playing && player.isPlaying()) player.pause();
  }, [player, watch, skewMs]);

  useEffect(() => {
    reconcile();
  }, [reconcile]);

  useEffect(() => {
    if (!player) return undefined;
    const timer = setInterval(() => {
      if (watch.playing) reconcile();
      setNow(player.time());
      setDuration(player.duration());
      // A YouTube player that started without permission shows as paused: offer the tap.
      if (watch.playing && !player.isPlaying()) setBlocked(true);
    }, DRIFT_CHECK_MS / 3);
    return () => clearInterval(timer);
  }, [player, watch.playing, reconcile]);

  const share = (patch) => useRoomStore.getState().setWatch({ source: watch.source, playing: watch.playing, atSeconds: player?.time() ?? 0, ...patch });
  const toggle = () => share({ playing: !watch.playing, atSeconds: player?.time() ?? 0 });
  const startedBy = watch.updatedBy && watch.updatedBy !== me ? partnerName : "You";

  return (
    <div ref={frameRef} className="tv-frame relative overflow-hidden rounded-[var(--radius-md)] bg-black">
      <div className="tv-screen relative">
        {watch.source.type === "youtube" ? (
          <div ref={hostRef} className="tv-youtube pointer-events-none absolute inset-0" />
        ) : (
          url && <video ref={videoRef} src={url} playsInline preload="auto" className="absolute inset-0 size-full bg-black object-contain" onClick={toggle} />
        )}
        {!player && !error && <p className="absolute inset-0 grid place-items-center text-caption text-text-secondary">Loading…</p>}
        {error && <p className="absolute inset-0 grid place-items-center p-4 text-center text-caption text-pink-400">{error}</p>}
        {blocked && player && (
          <button
            type="button"
            onClick={() => {
              Promise.resolve(player.play()).then(() => setBlocked(false), () => {});
              reconcile();
            }}
            className="absolute inset-0 grid place-items-center bg-black/60 text-body font-semibold text-white-soft"
          >
            <span className="flex items-center gap-2 rounded-full bg-green-600 px-4 py-2">
              <Play aria-hidden="true" size={16} /> Tap to watch with {partnerName}
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 bg-black-900/95 px-2 py-1.5">
        <button type="button" aria-label={watch.playing ? "Pause for both of you" : "Play for both of you"} disabled={!player} onClick={toggle} className="grid size-9 shrink-0 place-items-center rounded-full bg-white-soft text-black-950 disabled:opacity-40">
          {watch.playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
        </button>
        <span className="w-[4.5rem] shrink-0 text-micro tracking-normal text-text-secondary">
          {formatTime(scrub ?? now)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          aria-label="Seek (for both of you)"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(scrub ?? now)}
          disabled={!player || !duration}
          onChange={(event) => setScrub(Number(event.target.value))}
          onPointerUp={() => {
            if (scrub !== null) {
              player.seek(scrub);
              share({ atSeconds: scrub });
              setScrub(null);
            }
          }}
          onKeyUp={() => {
            if (scrub !== null) {
              player.seek(scrub);
              share({ atSeconds: scrub });
              setScrub(null);
            }
          }}
          className="min-w-0 flex-1 accent-green-500"
        />
        <button
          type="button"
          aria-label={muted ? "Unmute (just you)" : "Mute (just you)"}
          onClick={() => {
            player?.setMuted(!muted);
            setMuted(!muted);
          }}
          className="grid size-9 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-black-700"
        >
          {muted ? <VolumeX aria-hidden="true" size={16} /> : <Volume2 aria-hidden="true" size={16} />}
        </button>
        <button type="button" aria-label="Full screen (just you)" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : frameRef.current?.requestFullscreen?.())} className="grid size-9 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-black-700">
          <Maximize aria-hidden="true" size={15} />
        </button>
      </div>
      <p className="truncate bg-black-900/95 px-2 pb-1.5 text-micro tracking-normal text-text-muted">
        {watch.source.title} · {watch.playing ? "playing" : "paused"} · last changed by {startedBy}
      </p>
    </div>
  );
}
