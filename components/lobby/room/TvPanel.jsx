"use client";

import { ChevronRight, Clapperboard, Film, ListVideo, Maximize, MonitorPlay, Pause, Pencil, Play, RotateCcw, SkipBack, SkipForward, Square, Trash2, Tv, Upload, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { episodeLabel, episodeOf, groupVideos, parseEpisode, siblingEpisode } from "@/lib/room/series";
import { useUploadStore } from "@/lib/room/uploads";
import { VIDEO_TYPES, expectedPosition, formatTime, needsSeek, parseYouTube, videoTypeOf } from "@/lib/room/watch";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel } from "./RoomPanel";

/**
 * The TV: watch together in sync — YouTube links, your movies, and your own
 * videos (uploaded to private Backblaze B2 storage, in pieces, so an upload
 * always carries on where it stopped: lib/room/uploads.js).
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
            <Player watch={watch} me={me} partnerName={partnerName} videos={videos} />
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
          {tab !== "youtube" && <Library kind={tab === "movies" ? "movie" : "clip"} videos={videos} uploads={uploads} onPlay={playSource} playingId={watch?.source?.type === "video" ? watch.source.id : null} partnerName={partnerName} />}
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

const sizeText = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 2)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
const percent = (loaded, total) => Math.min(100, Math.floor((loaded / Math.max(1, total)) * 100));
const refreshVideos = () => useRoomStore.getState().refresh("videos");

async function removeVideo(video) {
  if (!window.confirm(video.status === "ready" ? `Delete “${video.title}” for both of you?` : `Cancel the upload of “${video.title}”? What's uploaded so far is deleted.`)) return;
  useUploadStore.getState().forget(video.id);
  await fetch("/api/room/videos", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: video.id }) });
  refreshVideos();
}

/** The upload in progress (or paused): progress, Pause / Resume, Cancel. */
function UploadCard({ current, onPick, onCancel }) {
  const pct = percent(current.loaded, current.total);
  const active = current.status === "starting" || current.status === "uploading" || current.status === "finishing";
  const line =
    current.status === "starting"
      ? "Getting ready…"
      : current.status === "finishing"
        ? "Almost done — checking the file…"
        : current.status === "paused"
          ? `Paused at ${pct}%`
          : current.status === "failed"
            ? "Couldn't upload"
            : `Uploading · ${pct}%`;
  const resume = () => {
    if (!useUploadStore.getState().resumePaused({ onListChange: refreshVideos })) onPick(current.videoId);
  };
  return (
    <div role="status" aria-live="polite" className="rounded-[var(--radius-sm)] bg-black-800 p-2">
      <p className="truncate text-micro tracking-normal text-white-soft">{current.title}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black-950">
        <div className={`h-full transition-[width] duration-300 ease-out ${current.status === "paused" || current.status === "failed" ? "bg-text-muted" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 flex justify-between gap-2 text-[0.65rem] text-text-muted">
        <span className={current.status === "failed" ? "text-pink-400" : ""}>{line}</span>
        <span>
          {sizeText(current.loaded)} / {sizeText(current.total)}
        </span>
      </p>
      {current.message && <p className="mt-0.5 text-[0.65rem] text-pink-400">{current.message}</p>}
      {active && current.status === "uploading" && <p className="mt-0.5 text-[0.65rem] text-text-muted">You can close the TV — it keeps going. Pause anytime; it carries on from here.</p>}
      <div className="mt-1.5 flex gap-1.5">
        {current.status === "uploading" && (
          <button type="button" onClick={() => useUploadStore.getState().pause()} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-micro tracking-normal text-white-soft">
            <Pause aria-hidden="true" size={12} /> Pause
          </button>
        )}
        {current.status === "paused" && (
          <button type="button" onClick={resume} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] bg-green-600 text-micro font-semibold tracking-normal text-white">
            <Play aria-hidden="true" size={12} /> Resume
          </button>
        )}
        {current.status === "failed" && (
          <button type="button" onClick={() => useUploadStore.getState().dismiss()} className="min-h-8 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-micro tracking-normal text-white-soft">
            OK
          </button>
        )}
        {current.videoId && current.status !== "finishing" && (
          <button type="button" onClick={onCancel} className="flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-sm)] px-2 text-micro tracking-normal text-text-muted hover:text-pink-400">
            <X aria-hidden="true" size={12} /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** Put a video in a series: name (existing ones suggested), season, episode. */
function SeriesEditor({ video, place, listId, onDone }) {
  const [series, setSeries] = useState(place?.series ?? "");
  const [season, setSeason] = useState(place?.season ?? 1);
  const [episode, setEpisode] = useState(place?.episode ?? "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // A title like "Show S01E02" puts a video in its series by itself; taking it out needs a stored choice.
  const canRemove = Boolean(video.series) && !parseEpisode(video.title);

  const save = async (patch) => {
    setSaving(true);
    const response = await fetch("/api/room/videos", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: video.id, ...patch }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setError(data?.error?.message ?? "Couldn't save that.");
      return;
    }
    refreshVideos();
    onDone();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!series.trim()) return setError("Give the series a name.");
        save({ series: series.trim(), season: season === "" ? 1 : Number(season), episode: episode === "" ? null : Number(episode) });
      }}
      className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] p-1.5"
    >
      <label className="flex flex-col gap-0.5 text-[0.65rem] text-text-muted">
        Series
        <input value={series} onChange={(event) => setSeries(event.target.value)} list={listId} maxLength={80} placeholder="e.g. Squid Game" className="min-h-8 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-caption text-white-soft outline-none focus:ring-1 focus:ring-green-500" />
      </label>
      <div className="flex gap-1.5">
        <label className="flex flex-1 flex-col gap-0.5 text-[0.65rem] text-text-muted">
          Season
          <input type="number" min={0} max={99} value={season} onChange={(event) => setSeason(event.target.value)} className="min-h-8 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-caption text-white-soft outline-none focus:ring-1 focus:ring-green-500" />
        </label>
        <label className="flex flex-1 flex-col gap-0.5 text-[0.65rem] text-text-muted">
          Episode
          <input type="number" min={0} max={9999} value={episode} onChange={(event) => setEpisode(event.target.value)} className="min-h-8 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-caption text-white-soft outline-none focus:ring-1 focus:ring-green-500" />
        </label>
      </div>
      {error && <p className="text-[0.65rem] text-pink-400">{error}</p>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={saving} className="min-h-8 flex-1 rounded-[var(--radius-sm)] bg-green-600 text-micro font-semibold tracking-normal text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
        {canRemove && (
          <button type="button" disabled={saving} onClick={() => save({ series: null })} className="min-h-8 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-2 text-micro tracking-normal text-white-soft">
            Not a series
          </button>
        )}
        <button type="button" onClick={onDone} className="min-h-8 px-2 text-micro tracking-normal text-text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Library({ kind, videos, uploads, onPlay, playingId, partnerName }) {
  const list = videos.filter((video) => video.kind === kind);
  const me = useRoomStore((state) => state.me());
  const current = useUploadStore((state) => state.current);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState({}); // videoId → bytes already uploaded (my unfinished uploads)
  const fileRef = useRef(null);
  const resumeFor = useRef(null); // the unfinished video a picked file should carry on
  const busy = current && ["starting", "uploading", "finishing"].includes(current.status);

  useEffect(() => useUploadStore.getState().hydrate(), []);

  // How far each of my unfinished uploads got (also marks ones that are actually whole as ready).
  const unfinished = list.filter((video) => video.status === "uploading" && video.uploaderId === me && video.id !== current?.videoId).map((video) => video.id);
  const unfinishedKey = unfinished.join(",");
  useEffect(() => {
    if (!unfinishedKey) return undefined;
    let live = true;
    for (const id of unfinishedKey.split(",")) {
      fetch(`/api/room/videos/${id}/parts`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ partNumbers: [], peek: true }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          if (!live || !info) return;
          if (info.status === "ready") refreshVideos();
          else setSaved((map) => ({ ...map, [id]: info.uploadedBytes }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [unfinishedKey]);

  const pick = (videoId = null) => {
    resumeFor.current = videoId;
    setError(null);
    fileRef.current?.click();
  };

  const onFile = async (file) => {
    const contentType = videoTypeOf(file);
    if (!contentType) {
      setError(`Pick a video file (${Object.values(VIDEO_TYPES).join(", ")}).`);
      return;
    }
    const target = resumeFor.current && list.find((video) => video.id === resumeFor.current);
    resumeFor.current = null;
    if (target) {
      const problem = await useUploadStore.getState().resume(target.id, file, { expected: { size: target.sizeBytes, title: target.title, kind: target.kind }, onListChange: refreshVideos });
      if (typeof problem === "string") setError(problem);
      return;
    }
    useUploadStore.getState().upload(file, { kind, contentType, onListChange: refreshVideos });
  };

  const grouped = groupVideos(list);
  const [openSeries, setOpenSeries] = useState({});
  const [editing, setEditing] = useState(null);

  const row = (video, place) => {
    const ready = video.status === "ready";
    const mine = video.uploaderId === me;
    const sending = current?.videoId === video.id && current.status !== "paused" && current.status !== "failed";
    const pausedHere = !ready && mine && !sending;
    const got = current?.videoId === video.id ? current.loaded : saved[video.id];
    const detail = ready
      ? sizeText(video.sizeBytes)
      : sending
        ? `Uploading · ${percent(current.loaded, video.sizeBytes)}%`
        : mine
          ? `Paused${got !== undefined ? ` at ${percent(got, video.sizeBytes)}%` : ""} · ${sizeText(video.sizeBytes)}`
          : `${partnerName} is uploading…`;
    const label = place ? [episodeLabel(place), place.name].filter(Boolean).join(" · ") || video.title : video.title;
    return (
      <li key={video.id} className={`flex flex-col rounded-[var(--radius-sm)] ${playingId === video.id ? "bg-green-700/40" : "bg-black-800"}`}>
        <div className="flex items-center gap-1.5 p-1.5">
          {pausedHere ? (
            <button type="button" disabled={busy} onClick={() => pick(video.id)} className="grid size-8 shrink-0 place-items-center rounded-full bg-black-700 text-white-soft hover:brightness-150 disabled:opacity-40" aria-label={`Resume uploading ${video.title} — pick the same file`} title="Resume — pick the same file">
              <Upload aria-hidden="true" size={13} />
            </button>
          ) : (
            <button type="button" disabled={!ready} onClick={() => onPlay({ type: "video", id: video.id, title: video.title })} className="grid size-8 shrink-0 place-items-center rounded-full bg-green-600 text-white disabled:bg-black-700" aria-label={`Play ${video.title}`}>
              <Play aria-hidden="true" size={13} />
            </button>
          )}
          <span className="min-w-0 flex-1" title={video.title}>
            <span className="block truncate text-caption text-white-soft">{label}</span>
            <span className={`block text-[0.65rem] ${pausedHere ? "text-[#ffb35c]" : "text-text-muted"}`}>{detail}</span>
          </span>
          {pausedHere && (
            <button type="button" disabled={busy} onClick={() => pick(video.id)} className="min-h-8 shrink-0 rounded-[var(--radius-sm)] bg-green-600 px-2 text-micro font-semibold tracking-normal text-white disabled:opacity-40">
              Resume
            </button>
          )}
          <button type="button" aria-label={`Series and episode for ${video.title}`} aria-expanded={editing === video.id} onClick={() => setEditing(editing === video.id ? null : video.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-black-700">
            <Pencil aria-hidden="true" size={12} />
          </button>
          <button type="button" aria-label={ready ? `Delete ${video.title}` : `Cancel the upload of ${video.title}`} onClick={() => removeVideo(video)} className="grid size-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-black-700">
            <Trash2 aria-hidden="true" size={13} />
          </button>
        </div>
        {editing === video.id && <SeriesEditor video={video} place={place ?? episodeOf(video)} listId={`series-names-${kind}`} onDone={() => setEditing(null)} />}
      </li>
    );
  };

  const showCard = current && (current.kind === kind || !current.videoId);

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
          if (file) onFile(file);
        }}
      />
      {uploads === false ? (
        <p className="rounded-[var(--radius-sm)] bg-black-800 p-2 text-micro tracking-normal text-text-secondary">Uploading isn&apos;t set up yet — add the Backblaze B2 keys (see README). YouTube works now.</p>
      ) : (
        <button type="button" disabled={!uploads || busy} onClick={() => pick()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] text-caption text-white-soft disabled:opacity-40">
          <Upload aria-hidden="true" size={14} /> {kind === "movie" ? "Upload a movie" : "Upload our video"}
        </button>
      )}
      {showCard && (
        <UploadCard
          current={current}
          onPick={pick}
          onCancel={() => {
            const video = list.find((v) => v.id === current.videoId) ?? { id: current.videoId, title: current.title, status: "uploading" };
            removeVideo(video);
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-micro tracking-normal text-pink-400">
          {error}
        </p>
      )}
      <ul className="flex max-h-[14rem] flex-col gap-1 overflow-y-auto overscroll-contain short:max-h-[8rem]">
        {list.length === 0 && <li className="py-2 text-center text-micro tracking-normal text-text-muted">{kind === "movie" ? "No movies yet." : "No videos of you two yet."}</li>}
        {grouped.series.map((group) => {
          const open = openSeries[group.name] ?? group.episodes.some((entry) => entry.video.id === playingId);
          return (
            <li key={group.name} className="flex flex-col gap-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenSeries((map) => ({ ...map, [group.name]: !open }))}
                className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-black-800/70 px-2 text-left hover:bg-black-700"
              >
                <ChevronRight aria-hidden="true" size={13} className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                <ListVideo aria-hidden="true" size={14} className="shrink-0 text-blue-400" />
                <span className="min-w-0 flex-1 truncate text-caption font-semibold text-white-soft">{group.name}</span>
                <span className="shrink-0 text-[0.65rem] text-text-muted">
                  {group.episodes.length} ep{group.episodes.length === 1 ? "" : "s"}
                  {group.seasons > 1 ? ` · ${group.seasons} seasons` : ""}
                </span>
              </button>
              {open && <ul className="ml-3 flex flex-col gap-1 border-l border-[var(--border-subtle)] pl-1.5">{group.episodes.map(({ video, place }) => row(video, place))}</ul>}
            </li>
          );
        })}
        {grouped.series.length > 0 && grouped.singles.length > 0 && <li className="px-1 pt-1 micro-caps text-text-muted">{kind === "movie" ? "Movies" : "Videos"}</li>}
        {grouped.singles.map((video) => row(video, null))}
      </ul>
      <datalist id={`series-names-${kind}`}>
        {grouped.series.map((group) => (
          <option key={group.name} value={group.name} />
        ))}
      </datalist>
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
                buffering: () => yt.getPlayerState?.() === 3,
                ahead: () => (yt.getVideoLoadedFraction?.() ?? 0) * (yt.getDuration?.() ?? 0) - (yt.getCurrentTime?.() ?? 0),
                kind: "youtube",
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
        // Not enough data to keep playing (HAVE_FUTURE_DATA = 3).
        buffering: () => !video.ended && video.readyState < 3,
        ahead: () => {
          const at = video.currentTime;
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= at + 0.5 && video.buffered.end(i) >= at) return video.buffered.end(i) - at;
          }
          return 0;
        },
        kind: "video",
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

const UP_NEXT_MS = 8000; // the next episode starts this long after one ends
const REPLAY_MS = 3000; // a movie / clip starts again this long after it ends
const SECOND_WRITER_MS = 2500; // the partner's screen steps in only if the first one didn't

const sourceOf = (video) => ({ type: "video", id: video.id, title: video.title });

// Waiting for a slow connection: hold the TV for both of you once this screen has
// been stuck loading for STALL_MS, and carry on when READY_AHEAD_S seconds are
// loaded (or after GIVE_UP_MS — YouTube loads little while paused).
const STALL_MS = 1800;
const READY_AHEAD_S = 5;
const YOUTUBE_RESUME_MS = 7000;
const GIVE_UP_MS = 30_000;
const WAITING_REPEAT_MS = 5000;

function Player({ watch, me, partnerName, videos = [] }) {
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

  // Series: the episodes either side of this one (ready ones), for Next / Previous and Up next.
  const isVideo = watch.source.type === "video";
  const next = isVideo ? siblingEpisode(videos, watch.source.id, 1) : null;
  const previous = isVideo ? siblingEpisode(videos, watch.source.id, -1) : null;
  const playVideo = (video) => useRoomStore.getState().setWatch({ source: sourceOf(video), playing: true, atSeconds: 0 });
  const playAgain = () => useRoomStore.getState().setWatch({ source: watch.source, playing: true, atSeconds: 0 });

  // The end, on the shared clock (so both screens agree): reached while playing,
  // the next episode starts after a short "Up next", or the video starts again.
  const atEnd = duration > 0 && expectedPosition(watch, { skewMs }) >= duration - 0.3;
  const ending = watch.playing && atEnd;
  const finished = !watch.playing && duration > 0 && watch.atSeconds >= duration - 0.5;
  const endsAt = Date.parse(watch.updatedAt) - skewMs + (duration - watch.atSeconds) * 1000;
  const waitMs = next ? UP_NEXT_MS : REPLAY_MS;
  const countdown = ending ? Math.max(0, Math.ceil((endsAt + waitMs - Date.now()) / 1000)) : 0;
  const endingVersion = ending ? watch.version : null;
  useEffect(() => {
    if (endingVersion === null) return undefined;
    // One screen moves things on: whoever changed the TV last; the other only if that didn't happen.
    const delay = Math.max(0, endsAt + waitMs - Date.now()) + (watch.updatedBy === me ? 0 : SECOND_WRITER_MS);
    const timer = setTimeout(() => {
      if (useRoomStore.getState().watch?.version !== endingVersion) return; // already moved on (or cancelled)
      if (next) playVideo(next);
      else playAgain();
    }, delay);
    return () => clearTimeout(timer);
    // One decision per ending, keyed by the shared state's version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endingVersion, next?.id]);
  const stayAtEnd = () => useRoomStore.getState().setWatch({ source: watch.source, playing: false, atSeconds: duration });

  // Slow connections: this screen holds the TV while it loads ({ version, at, since, told }).
  const partnerWaiting = useRoomStore((state) => state.partnerWaiting);
  const hold = useRef(null);
  const stalledSince = useRef(null);
  const [holding, setHolding] = useState(false);
  const release = useCallback((resume) => {
    const held = hold.current;
    hold.current = null;
    stalledSince.current = null;
    setHolding(false);
    useRoomStore.getState().announceWaiting(false);
    if (resume && held && useRoomStore.getState().watch?.version === held.version) {
      useRoomStore.getState().setWatch({ source: watch.source, playing: true, atSeconds: held.at });
    }
  }, [watch.source]);
  // A new video, or someone pressed play / pause / seek meanwhile: drop any hold.
  useEffect(() => {
    if (hold.current && hold.current.version !== null && watch.version !== hold.current.version) release(false); // (null: our own pause is still on its way)
  }, [watch.version, release]);
  useEffect(() => () => hold.current && useRoomStore.getState().announceWaiting(false), []);

  // Line the local player up with the shared moment.
  const reconcile = useCallback(() => {
    if (!player) return;
    const expected = expectedPosition(watch, { skewMs });
    const length = player.duration();
    if (length > 0 && expected >= length - 0.3) {
      // Past the end: hold the last frame (playing again here would restart it on this screen alone).
      if (player.isPlaying()) player.pause();
      return;
    }
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
      const nowMs = Date.now();
      const length = player.duration();
      const pastEnd = length > 0 && expectedPosition(watch, { skewMs }) >= length - 0.3;
      if (hold.current) {
        // Holding for our own connection: carry on once enough is loaded.
        const held = hold.current;
        const waited = nowMs - held.since;
        if (nowMs - held.told > WAITING_REPEAT_MS) {
          held.told = nowMs;
          useRoomStore.getState().announceWaiting(true);
        }
        if (player.ahead() >= READY_AHEAD_S || (player.kind === "youtube" && waited >= YOUTUBE_RESUME_MS) || waited >= GIVE_UP_MS) release(true);
      } else if (watch.playing && !pastEnd && player.buffering()) {
        stalledSince.current ??= nowMs;
        if (nowMs - stalledSince.current >= STALL_MS) {
          // Stuck loading: pause for both of us right here, and say why.
          const at = player.time();
          hold.current = { version: null, at, since: nowMs, told: nowMs };
          setHolding(true);
          useRoomStore.getState().announceWaiting(true);
          useRoomStore
            .getState()
            .setWatch({ source: watch.source, playing: false, atSeconds: at })
            .then((failed) => {
              if (failed || !hold.current) return release(false);
              hold.current.version = useRoomStore.getState().watch?.version ?? null;
            });
        }
      } else stalledSince.current = null;
      if (watch.playing) reconcile();
      setNow(player.time());
      setDuration(player.duration());
      // A YouTube player that started without permission shows as paused: offer the tap (not when it's just loading).
      if (watch.playing && !player.isPlaying() && !pastEnd && !player.buffering()) setBlocked(true);
    }, DRIFT_CHECK_MS / 3);
    return () => clearInterval(timer);
  }, [player, watch, skewMs, reconcile, release]);

  const share = (patch) => useRoomStore.getState().setWatch({ source: watch.source, playing: watch.playing, atSeconds: player?.time() ?? 0, ...patch });
  const toggle = () => share({ playing: !watch.playing, atSeconds: player?.time() ?? 0 });
  const startedBy = watch.updatedBy && watch.updatedBy !== me ? partnerName : "You";
  const place = isVideo ? episodeOf(videos.find((video) => video.id === watch.source.id) ?? { title: watch.source.title }) : null;
  const nowShowing = place ? [place.series, episodeLabel(place), place.name].filter(Boolean).join(" · ") : watch.source.title;

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
        {(ending || finished) && player && (
          <div role="status" aria-live="polite" className="tv-end absolute inset-0 grid place-items-center bg-black/70 p-3 text-center">
            <div className="flex max-w-[22rem] flex-col items-center gap-2">
              {next ? (
                <>
                  <p className="micro-caps text-blue-400">{ending ? `Up next in ${countdown}` : "Up next"}</p>
                  <p className="line-clamp-2 text-body font-semibold text-white-soft">{[episodeLabel(episodeOf(next)), episodeOf(next)?.name ?? next.title].filter(Boolean).join(" · ")}</p>
                </>
              ) : (
                <p className="text-body font-semibold text-white-soft">{ending ? `Starting again in ${countdown}…` : "The end"}</p>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                {next && (
                  <button type="button" onClick={() => playVideo(next)} className="flex min-h-10 items-center gap-1.5 rounded-full bg-green-600 px-4 text-caption font-semibold text-white">
                    <SkipForward aria-hidden="true" size={15} /> {ending ? "Play now" : "Next episode"}
                  </button>
                )}
                {(finished || !next) && (
                  <button type="button" onClick={playAgain} className="flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-black/40 px-4 text-caption text-white-soft">
                    <RotateCcw aria-hidden="true" size={14} /> {ending ? "Replay now" : "Watch again"}
                  </button>
                )}
                {ending && (
                  <button type="button" onClick={stayAtEnd} className="min-h-10 rounded-full px-3 text-caption text-text-secondary hover:text-white-soft">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {!watch.playing && partnerWaiting && !holding && !finished && (
          <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center bg-black/60 p-3 text-center">
            <div className="flex max-w-[22rem] flex-col items-center gap-2">
              <span aria-hidden="true" className="size-7 animate-spin rounded-full border-2 border-white-soft/25 border-t-pink-400" />
              <p className="text-body font-semibold text-white-soft">Waiting for {partnerName}…</p>
              <p className="text-caption text-text-secondary">Their connection is slow — it carries on for both of you as soon as their video catches up.</p>
              <button
                type="button"
                onClick={() => {
                  useRoomStore.getState().stopWaiting();
                  useRoomStore.getState().setWatch({ source: watch.source, playing: true, atSeconds: watch.atSeconds });
                }}
                className="min-h-9 rounded-full border border-[var(--border-strong)] bg-black/40 px-4 text-caption text-white-soft"
              >
                Keep watching without waiting
              </button>
            </div>
          </div>
        )}
        {holding && (
          <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center bg-black/50 p-3 text-center">
            <div className="flex max-w-[22rem] flex-col items-center gap-2">
              <span aria-hidden="true" className="size-7 animate-spin rounded-full border-2 border-white-soft/25 border-t-green-500" />
              <p className="text-body font-semibold text-white-soft">Loading…</p>
              <p className="text-caption text-text-secondary">Paused for both of you while your connection catches up.</p>
            </div>
          </div>
        )}
        {blocked && player && !ending && !finished && !holding && (
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
        {(previous || next) && (
          <>
            <button type="button" aria-label={previous ? `Previous episode: ${previous.title}` : "No previous episode"} title="Previous episode" disabled={!previous} onClick={() => previous && playVideo(previous)} className="grid size-8 shrink-0 place-items-center rounded-full text-white-soft hover:bg-black-700 disabled:opacity-30">
              <SkipBack aria-hidden="true" size={15} />
            </button>
            <button type="button" aria-label={next ? `Next episode: ${next.title}` : "No next episode"} title="Next episode" disabled={!next} onClick={() => next && playVideo(next)} className="grid size-8 shrink-0 place-items-center rounded-full text-white-soft hover:bg-black-700 disabled:opacity-30">
              <SkipForward aria-hidden="true" size={15} />
            </button>
          </>
        )}
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
        {nowShowing} · {ending ? "ended" : holding ? "loading" : !watch.playing && partnerWaiting ? `waiting for ${partnerName}` : watch.playing ? "playing" : "paused"} · last changed by {startedBy}
      </p>
    </div>
  );
}
