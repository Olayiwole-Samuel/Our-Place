"use client";

import { Heart, ListMusic, Library, Music, Pause, Play, Plus, Repeat, Repeat1, RotateCcw, RotateCw, Search, Shuffle, SkipBack, SkipForward, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatTime } from "@/lib/room/watch";
import { currentTrack, useMusicStore } from "@/store/musicStore";
import { RoomPanel } from "../room/RoomPanel";

/**
 * The music panel (the record player, or Room → Music): what's on and the
 * queue, your shared playlists, all your songs, and adding songs — from
 * Spotify (whoever connected their account picks; everything plays for both
 * of you from YouTube) or a YouTube link.
 */
const TABS = [
  { id: "now", label: "Now playing", Icon: Music },
  { id: "playlists", label: "Playlists", Icon: ListMusic },
  { id: "songs", label: "Songs", Icon: Library },
  { id: "add", label: "Add songs", Icon: Search },
];

export function MusicPanel({ me, partnerName }) {
  const tab = useMusicStore((state) => state.panelTab);
  const available = useMusicStore((state) => state.available);
  const store = useMusicStore.getState();
  return (
    <RoomPanel title="Music 🎶" icon={<Music size={16} />} wide>
      {!available ? (
        <p className="p-6 text-center text-caption text-text-secondary">Music needs a quick update on the server first (the music migration).</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <nav className="flex shrink-0 gap-1 border-b border-[var(--border-subtle)] px-2 py-1.5" aria-label="Music">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => store.setPanelTab(id)}
                className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-micro font-semibold tracking-normal ${tab === id ? "bg-white-soft text-black-950" : "text-text-secondary hover:bg-black-700"}`}
              >
                <Icon aria-hidden="true" size={13} /> <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.split(" ")[0]}</span>
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {tab === "now" && <NowPlaying />}
            {tab === "playlists" && <Playlists />}
            {tab === "songs" && <Songs />}
            {tab === "add" && <AddSongs me={me} partnerName={partnerName} />}
          </div>
        </div>
      )}
    </RoomPanel>
  );
}

function Art({ track, size = "size-10" }) {
  return track?.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- album art from Spotify / YouTube
    <img src={track.imageUrl} alt="" className={`${size} shrink-0 rounded-[var(--radius-sm)] object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${size} grid shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black-700 text-text-muted`}>
      ♪
    </span>
  );
}

/** One song in a list, with its actions. */
function SongRow({ track, active = false, onPlay, children }) {
  const ourSong = useMusicStore((state) => state.music?.ourSong === track.id);
  return (
    <li className={`flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 ${active ? "bg-green-700/25" : "hover:bg-black-800"}`}>
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={`Play ${track.title}`}>
        <Art track={track} />
        <span className="min-w-0">
          <span className={`block truncate text-caption font-semibold ${active ? "text-green-400" : "text-white-soft"}`}>
            {ourSong && <span aria-label="Our song">❤️ </span>}
            {track.title}
          </span>
          <span className="block truncate text-micro tracking-normal text-text-muted">{track.artist || "YouTube"}</span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-0.5">{children}</span>
    </li>
  );
}

function IconButton({ label, onClick, children, active = false }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active || undefined} onClick={onClick} className={`grid size-8 place-items-center rounded-full ${active ? "text-pink-400" : "text-text-muted"} hover:bg-black-700 hover:text-white-soft`}>
      {children}
    </button>
  );
}

/** "+ playlist" menu for a song. */
function AddToPlaylist({ trackId }) {
  const playlists = useMusicStore((state) => state.playlists);
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <IconButton label="Add to a playlist" onClick={() => setOpen((v) => !v)}>
        <Plus aria-hidden="true" size={15} />
      </IconButton>
      {open && (
        <span className="panel absolute right-0 z-10 mt-1 flex w-48 flex-col rounded-[var(--radius-md)] p-1 shadow-lg">
          {playlists.length === 0 && <span className="px-2 py-1.5 text-micro tracking-normal text-text-muted">Make a playlist first (Playlists tab)</span>}
          {playlists.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.trackIds.includes(trackId)}
              onClick={() => {
                setOpen(false);
                useMusicStore.getState().editPlaylist(p.id, { add: [trackId] });
              }}
              className="truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-micro tracking-normal text-white-soft hover:bg-black-700 disabled:text-text-muted"
            >
              {p.trackIds.includes(trackId) ? "✓ " : ""}
              {p.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function OurSongButton({ trackId }) {
  const ours = useMusicStore((state) => state.music?.ourSong === trackId);
  return (
    <IconButton label={ours ? "It's our song ❤️ (tap to unmark)" : "Make it our song"} active={ours} onClick={() => useMusicStore.getState().setOurSong(ours ? null : trackId)}>
      <Heart aria-hidden="true" size={15} fill={ours ? "currentColor" : "none"} />
    </IconButton>
  );
}

// ── Now playing ────────────────────────────────────────────────────────────
function NowPlaying() {
  const music = useMusicStore((state) => state.music);
  const track = useMusicStore(currentTrack);
  const tracks = useMusicStore((state) => state.tracks);
  const store = useMusicStore.getState();
  const [, setTick] = useState(0);
  const [scrub, setScrub] = useState(null); // where you're dragging to (seconds)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!music?.queue.length || !track) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span aria-hidden="true" className="text-[2.2rem]">
          🎶
        </span>
        <p className="text-caption text-text-secondary">Nothing&apos;s playing yet.</p>
        <button type="button" onClick={() => store.setPanelTab(useMusicStore.getState().order.length ? "songs" : "add")} className="min-h-10 rounded-full bg-green-600 px-5 text-caption font-semibold text-white">
          {useMusicStore.getState().order.length ? "Pick a song" : "Add your first songs"}
        </button>
      </div>
    );
  }
  const duration = useMusicStore.getState().duration || track.durationS || 0;
  const at = scrub ?? Math.min(store.now(), duration || Infinity);
  const commitScrub = () => {
    if (scrub === null) return;
    store.seek(scrub);
    setScrub(null);
  };
  const RepeatIcon = music.repeat === "one" ? Repeat1 : Repeat;
  const nextRepeat = { off: "all", all: "one", one: "off" }[music.repeat];
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-2 sm:w-56">
        <div className={`music-disc relative grid size-36 place-items-center rounded-full bg-[radial-gradient(circle,#2a2a2a_0_22%,#111_23%_100%)] shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${music.playing ? "music-spin" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- album art from Spotify / YouTube */}
          {track.imageUrl ? <img src={track.imageUrl} alt="" className="size-16 rounded-full object-cover" /> : <span className="text-[1.6rem]">♪</span>}
        </div>
        <p className="w-full truncate text-center text-body font-semibold text-white-soft">{track.title}</p>
        <p className="-mt-2 w-full truncate text-center text-micro tracking-normal text-text-muted">{track.artist}</p>
        <div className="flex w-full items-center gap-1.5 text-[0.65rem] tabular-nums text-text-muted">
          <IconButton label="Back 10 seconds" onClick={() => store.skipBy(-10)}>
            <RotateCcw aria-hidden="true" size={14} />
          </IconButton>
          <span>{formatTime(at)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            step={1}
            value={Math.floor(at)}
            disabled={!duration}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            aria-label="Song position"
            aria-valuetext={`${formatTime(at)} of ${formatTime(duration)}`}
            className="min-w-0 flex-1 accent-green-500"
          />
          <span>{duration ? formatTime(duration) : "–:––"}</span>
          <IconButton label="Forward 10 seconds" onClick={() => store.skipBy(10)}>
            <RotateCw aria-hidden="true" size={14} />
          </IconButton>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label={music.shuffle ? "Shuffle on" : "Shuffle off"} active={music.shuffle} onClick={() => store.setShuffle(!music.shuffle)}>
            <Shuffle aria-hidden="true" size={15} />
          </IconButton>
          <IconButton label="Previous" onClick={() => store.previous()}>
            <SkipBack aria-hidden="true" size={16} />
          </IconButton>
          <button type="button" aria-label={music.playing ? "Pause for both" : "Play for both"} onClick={() => store.toggle()} className="grid size-11 place-items-center rounded-full bg-white-soft text-black-950">
            {music.playing ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
          </button>
          <IconButton label="Next" onClick={() => store.next()}>
            <SkipForward aria-hidden="true" size={16} />
          </IconButton>
          <IconButton label={`Repeat: ${music.repeat}`} active={music.repeat !== "off"} onClick={() => store.setRepeat(nextRepeat)}>
            <RepeatIcon aria-hidden="true" size={15} />
          </IconButton>
        </div>
        <div className="flex items-center gap-2">
          <OurSongButton trackId={track.id} />
          <DanceButton />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="micro-caps mb-1 text-text-muted">Up next</p>
        <ol className="flex flex-col">
          {music.queue.map((id, index) => {
            const song = tracks.get(id);
            if (!song) return null;
            return (
              <SongRow key={`${id}-${index}`} track={song} active={index === music.position} onPlay={() => store.jump(index)}>
                {index !== music.position && (
                  <IconButton label="Remove from the queue" onClick={() => store.removeFromQueue(index)}>
                    <X aria-hidden="true" size={14} />
                  </IconButton>
                )}
              </SongRow>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function DanceButton() {
  const dancing = useMusicStore((state) => state.dancing);
  return (
    <button type="button" aria-pressed={dancing} onClick={() => useMusicStore.getState().setDancing(!dancing)} className={`min-h-8 rounded-full px-3 text-micro font-semibold tracking-normal ${dancing ? "bg-pink-500 text-black-950" : "border border-[var(--border-subtle)] text-text-secondary hover:bg-black-700"}`}>
      💃 {dancing ? "Dancing!" : "Dance"}
    </button>
  );
}

// ── Playlists ──────────────────────────────────────────────────────────────
function Playlists() {
  const playlists = useMusicStore((state) => state.playlists);
  const tracks = useMusicStore((state) => state.tracks);
  const playingList = useMusicStore((state) => state.music?.playlistId);
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState("");
  const store = useMusicStore.getState();
  const open = playlists.find((p) => p.id === openId);

  if (open) {
    const songs = open.trackIds.map((id) => tracks.get(id)).filter(Boolean);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpenId(null)} className="text-micro tracking-normal text-text-muted hover:text-white-soft">
            ← Playlists
          </button>
          <h3 className="min-w-0 flex-1 truncate text-caption font-semibold text-white-soft">{open.name}</h3>
          <button type="button" disabled={!songs.length} onClick={() => store.playList(open.trackIds, open.trackIds[0], open.id)} className="flex min-h-8 items-center gap-1 rounded-full bg-green-600 px-3 text-micro font-semibold tracking-normal text-white disabled:opacity-50">
            <Play aria-hidden="true" size={12} /> Play
          </button>
          <IconButton
            label="Delete this playlist"
            onClick={() => {
              if (window.confirm(`Delete "${open.name}"? The songs stay in your library.`)) {
                store.savePlaylist(open.id, null);
                setOpenId(null);
              }
            }}
          >
            <Trash2 aria-hidden="true" size={14} />
          </IconButton>
        </div>
        {songs.length === 0 && <p className="py-4 text-center text-micro tracking-normal text-text-muted">Empty — add songs from the Songs tab (+).</p>}
        <ul className="flex flex-col">
          {songs.map((song) => (
            <SongRow key={song.id} track={song} onPlay={() => store.playList(open.trackIds, song.id, open.id)}>
              <IconButton label="Remove from this playlist" onClick={() => store.editPlaylist(open.id, { remove: song.id })}>
                <X aria-hidden="true" size={14} />
              </IconButton>
            </SongRow>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) return;
          const result = await store.savePlaylist(null, name.trim());
          if (result.id) {
            setName("");
            setOpenId(result.id);
          }
        }}
      >
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="New playlist — “Our songs”, “Late night”…" aria-label="New playlist name" className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft" />
        <button type="submit" disabled={!name.trim()} className="min-h-10 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white disabled:opacity-50">
          Create
        </button>
      </form>
      {playlists.length === 0 && <p className="text-center text-micro tracking-normal text-text-muted">No playlists yet. Make one, or bring one in from Spotify (Add songs).</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {playlists.map((p) => {
          const cover = tracks.get(p.trackIds[0]);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-2 py-2 text-left hover:bg-black-800 ${playingList === p.id ? "border-green-600/60" : "border-[var(--border-subtle)]"}`}>
                <Art track={cover} size="size-11" />
                <span className="min-w-0">
                  <span className="block truncate text-caption font-semibold text-white-soft">{p.name}</span>
                  <span className="block text-micro tracking-normal text-text-muted">
                    {p.trackIds.length} song{p.trackIds.length === 1 ? "" : "s"}
                    {playingList === p.id ? " · playing" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── All your songs ─────────────────────────────────────────────────────────
function Songs() {
  const order = useMusicStore((state) => state.order);
  const tracks = useMusicStore((state) => state.tracks);
  const currentId = useMusicStore((state) => (state.music?.queue.length ? state.music.queue[state.music.position] : null));
  const [filter, setFilter] = useState("");
  const store = useMusicStore.getState();
  const songs = useMemo(() => {
    const words = filter.trim().toLowerCase();
    return order.map((id) => tracks.get(id)).filter((t) => t && (!words || `${t.title} ${t.artist}`.toLowerCase().includes(words)));
  }, [order, tracks, filter]);
  if (!order.length) return <p className="py-8 text-center text-caption text-text-secondary">No songs yet — add some from the Add songs tab.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Search your ${order.length} songs`} aria-label="Filter your songs" className="min-h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft" />
        <button type="button" onClick={() => store.playList(songs.map((s) => s.id))} className="flex min-h-9 items-center gap-1 rounded-full bg-green-600 px-3 text-micro font-semibold tracking-normal text-white">
          <Play aria-hidden="true" size={12} /> Play all
        </button>
      </div>
      <ul className="flex flex-col">
        {songs.map((song) => (
          <SongRow key={song.id} track={song} active={song.id === currentId} onPlay={() => store.playList(songs.map((s) => s.id), song.id)}>
            <IconButton label="Play next" onClick={() => store.queueNext(song.id)}>
              <ListMusic aria-hidden="true" size={14} />
            </IconButton>
            <AddToPlaylist trackId={song.id} />
            <OurSongButton trackId={song.id} />
            <IconButton
              label="Remove from your songs"
              onClick={() => {
                if (window.confirm(`Remove "${song.title}" from your songs (and playlists)?`)) store.removeTrack(song.id);
              }}
            >
              <Trash2 aria-hidden="true" size={14} />
            </IconButton>
          </SongRow>
        ))}
      </ul>
    </div>
  );
}

// ── Adding songs ───────────────────────────────────────────────────────────
function AddSongs({ me, partnerName }) {
  const spotify = useMusicStore((state) => state.spotify);
  const flash = useMusicStore((state) => state.flash);
  const store = useMusicStore.getState();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [lists, setLists] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(flash);
  useEffect(() => () => useMusicStore.getState().setFlash(null), []);
  const [link, setLink] = useState("");
  const [added, setAdded] = useState(() => new Set());

  useEffect(() => {
    if (!spotify?.connected) return;
    store.spotifyPlaylists().then(({ data, error }) => (error ? setNote(error.message) : setLists(data.playlists)));
    // Load once per connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotify?.connected]);

  const search = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setNote(null);
    const { data, error } = await store.searchSpotify(query.trim());
    setBusy(null);
    if (error) setNote(error.message);
    else setResults(data.tracks);
  };
  const add = async (song, { play = false } = {}) => {
    const { track, error } = await store.addSpotify(song);
    if (error) return setNote("Couldn't add that song.");
    setAdded((set) => new Set(set).add(song.spotifyId));
    if (play) store.playNow(track.id);
  };
  const importList = async (list) => {
    setBusy(list.id);
    setNote(null);
    const { data, error } = await store.importPlaylist(list.id, list.name);
    setBusy(null);
    setNote(error ? error.message : `“${list.name}” is in Playlists — ${data.added} songs ✓`);
  };
  const addLink = async (event) => {
    event.preventDefault();
    const { error } = await store.addYouTube(link);
    if (error) setNote(error === "not_youtube" ? "That isn't a YouTube link." : error === "not_embeddable" ? "That video doesn't allow playing outside YouTube." : "Couldn't add it.");
    else {
      setLink("");
      setNote("Added to your songs ✓");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p role="status" className="rounded-[var(--radius-md)] bg-black-800 px-3 py-2 text-micro tracking-normal text-text-secondary">
          {note}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-[#1db954] text-[0.7rem] font-bold text-black">
            S
          </span>
          <h3 className="flex-1 text-caption font-semibold text-white-soft">Spotify</h3>
          {spotify?.connected && (
            <button type="button" onClick={() => window.confirm("Disconnect Spotify? Your songs and playlists stay.") && store.disconnectSpotify()} className="text-micro tracking-normal text-text-muted hover:text-white-soft">
              Disconnect
            </button>
          )}
        </div>
        {!spotify?.connected ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 text-micro tracking-normal text-text-secondary">
            <p className="mb-2">Connect a Spotify account to search songs and bring in your playlists. Only one of you needs to — every song plays for BOTH of you (from YouTube), no Premium needed to listen.</p>
            <button type="button" onClick={() => store.connectSpotify()} className="min-h-10 rounded-full bg-[#1db954] px-4 text-caption font-semibold text-black">
              Connect Spotify
            </button>
          </div>
        ) : (
          <>
            <p className="text-micro tracking-normal text-text-muted">
              Connected as {spotify.displayName ?? "Spotify"}
              {spotify.userId === me ? " (you)" : ` (${partnerName})`}
            </p>
            <form className="flex gap-2" onSubmit={search}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists…" aria-label="Search Spotify" className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft" />
              <button type="submit" disabled={busy === "search"} className="min-h-10 rounded-[var(--radius-md)] bg-white-soft px-4 text-caption font-semibold text-black-950 disabled:opacity-60">
                {busy === "search" ? "…" : "Search"}
              </button>
            </form>
            {results && (
              <ul className="flex flex-col">
                {results.length === 0 && <li className="py-2 text-center text-micro tracking-normal text-text-muted">No songs found.</li>}
                {results.map((song) => (
                  <SongRow key={song.spotifyId} track={song} onPlay={() => add(song, { play: true })}>
                    <IconButton label={added.has(song.spotifyId) ? "Added ✓" : "Add to your songs"} active={added.has(song.spotifyId)} onClick={() => add(song)}>
                      {added.has(song.spotifyId) ? "✓" : <Plus aria-hidden="true" size={15} />}
                    </IconButton>
                  </SongRow>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-1.5">
              <p className="micro-caps text-text-muted">Bring in a playlist</p>
              {!lists && <p className="text-micro tracking-normal text-text-muted">Loading your playlists…</p>}
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {lists && (
                  <li>
                    <PlaylistImport list={{ id: "liked", name: "Liked Songs", count: null }} busy={busy} onImport={importList} />
                  </li>
                )}
                {lists?.map((list) => (
                  <li key={list.id}>
                    <PlaylistImport list={list} busy={busy} onImport={importList} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-caption font-semibold text-white-soft">Or a YouTube / YouTube Music link</h3>
        <form className="flex gap-2" onSubmit={addLink}>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="youtu.be/… or music.youtube.com/watch?v=…" aria-label="YouTube link" className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft" />
          <button type="submit" disabled={!link.trim()} className="min-h-10 rounded-[var(--radius-md)] bg-white-soft px-4 text-caption font-semibold text-black-950 disabled:opacity-60">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}

function PlaylistImport({ list, busy, onImport }) {
  return (
    <button type="button" disabled={Boolean(busy)} onClick={() => onImport(list)} className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2 py-1.5 text-left hover:bg-black-800 disabled:opacity-60">
      {/* eslint-disable-next-line @next/next/no-img-element -- playlist art from Spotify */}
      {list.imageUrl ? <img src={list.imageUrl} alt="" className="size-9 rounded-[var(--radius-sm)] object-cover" /> : <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-black-700">{list.id === "liked" ? "💚" : "♪"}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-micro font-semibold tracking-normal text-white-soft">{list.name}</span>
        <span className="block text-[0.65rem] text-text-muted">{busy === list.id ? "Bringing it in…" : list.count !== null ? `${list.count} songs · tap to bring in` : "tap to bring in"}</span>
      </span>
    </button>
  );
}
