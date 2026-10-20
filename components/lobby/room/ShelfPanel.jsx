"use client";

import { Pencil, Trophy } from "lucide-react";
import { useState } from "react";
import { gameRegistry } from "@/lib/game/catalog";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel } from "./RoomPanel";

/**
 * The bookshelf: trophies and milestones that collect by themselves as you use
 * Our Place — time together, together-streaks, game wins, puzzles, memories,
 * notes and messages. Everything is counted by the database for your couple
 * only (couple_trophies(), couple_streak()). "Together" counts from the day you
 * got together (couples.together_since, editable here), else from pairing.
 */
const DAY = 86_400_000;

const localDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
/** Adds months, keeping the day (31 Jan + 1 month → 28/29 Feb). */
const addMonths = (date, months) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
};

/**
 * How long you've been together, in your own calendar: { since, days, months,
 * extraDays, next: { months, on, inDays } } — next = the coming monthsary.
 * `since` is "YYYY-MM-DD" (a calendar day) or an ISO timestamp.
 */
export function togetherSince(since, now = new Date()) {
  const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(since) ? since.split("-").map(Number) : [];
  const start = y ? new Date(y, m - 1, d) : localDay(new Date(since));
  const today = localDay(now);
  const days = Math.max(0, Math.round((today - start) / DAY));
  let months = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth());
  if (months && addMonths(start, months) > today) months -= 1;
  const extraDays = Math.max(0, Math.round((today - addMonths(start, months)) / DAY));
  const nextOn = addMonths(start, months + 1);
  return { since: start, days, months, extraDays, next: { months: months + 1, on: nextOn, inDays: Math.round((nextOn - today) / DAY) } };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "7 months, 14 days" / "1 year, 2 months" / "12 days". */
export function durationText({ months, extraDays }) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years) return [plural(years, "year"), rest && plural(rest, "month")].filter(Boolean).join(", ");
  if (months) return [plural(months, "month"), extraDays && plural(extraDays, "day")].filter(Boolean).join(", ");
  return plural(extraDays, "day");
}

/** 8 → "8-month anniversary"; 12 → "1st anniversary". */
export function anniversaryLabel(months) {
  if (months % 12) return `${months}-month anniversary`;
  const years = months / 12;
  const teen = years % 100 >= 11 && years % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[years % 10] ?? "th");
  return `${years}${suffix} anniversary`;
}

/** Milestones: [id, icon, title, unlocked?(stats), detail]. */
export function milestones(stats) {
  const together = stats.daysTogether;
  return [
    ["paired", "💞", "Found each other", together >= 0, "The day it all started"],
    ["week", "🌱", "One week", together >= 7, "7 days together"],
    ["month", "🌸", "One month", together >= 30, "30 days together"],
    ["days100", "💯", "100 days", together >= 100, "100 days together"],
    ["half", "🌻", "Six months", together >= 182, "Half a year together"],
    ["year", "💍", "One year", together >= 365, "A whole year together"],
    ["years2", "💗", "Two years", together >= 730, "Two whole years together"],
    ["days1000", "👑", "1,000 days", together >= 1000, "1,000 days together"],
    ["streak3", "🔥", "Warming up", stats.bestStreak >= 3, "3 days in a row together"],
    ["streak7", "🔥", "On fire", stats.bestStreak >= 7, "7 days in a row together"],
    ["streak30", "☄️", "Unstoppable", stats.bestStreak >= 30, "30 days in a row together"],
    ["game1", "🎲", "First game", stats.gamesPlayed >= 1, "Finished your first game"],
    ["game25", "🏅", "Game night regulars", stats.gamesPlayed >= 25, "25 games finished"],
    ["game100", "🏆", "Hall of fame", stats.gamesPlayed >= 100, "100 games finished"],
    ["puzzle", "🧩", "Puzzle partners", stats.puzzles >= 1, "Finished a jigsaw together"],
    ["memory", "📸", "First memory", stats.memories >= 1, "Hung your first photo"],
    ["memory25", "🖼️", "Gallery", stats.memories >= 25, "25 memories on the wall"],
    ["note", "📝", "Little notes", stats.notes >= 1, "Left the first note"],
    ["chat100", "💬", "Chatterboxes", stats.messages >= 100, "100 messages"],
    ["chat1000", "📚", "Whole novels", stats.messages >= 1000, "1,000 messages"],
  ].map(([id, icon, title, unlocked, detail]) => ({ id, icon, title, unlocked: Boolean(unlocked), detail }));
}

export function ShelfPanel({ me, partner, partnerName }) {
  const trophies = useRoomStore((state) => state.trophies);
  const streak = useRoomStore((state) => state.streak);
  if (!trophies) {
    return (
      <RoomPanel title="Trophies" icon={<Trophy size={16} />} wide>
        <p className="py-10 text-center text-caption text-text-muted">Dusting the shelves…</p>
      </RoomPanel>
    );
  }
  const time = togetherSince(trophies.together_since ?? trophies.paired_at ?? new Date().toISOString());
  const stats = {
    daysTogether: time.days,
    bestStreak: Math.max(streak.best, streak.current),
    gamesPlayed: Number(trophies.games_played ?? 0),
    puzzles: Number(trophies.puzzles_done ?? 0),
    memories: Number(trophies.memories ?? 0),
    notes: Number(trophies.notes ?? 0),
    messages: Number(trophies.messages ?? 0),
  };
  const items = milestones(stats);
  const unlocked = items.filter((item) => item.unlocked).length;

  // Wins per game, both of you side by side.
  const games = new Map();
  for (const row of trophies.wins ?? []) {
    const entry = games.get(row.game_id) ?? { mine: 0, theirs: 0, bestMine: 0, bestTheirs: 0 };
    if (row.user_id === me) entry.mine += Number(row.wins);
    else if (row.user_id === partner) entry.theirs += Number(row.wins);
    games.set(row.game_id, entry);
  }
  for (const row of trophies.best_streaks ?? []) {
    const entry = games.get(row.game_id) ?? { mine: 0, theirs: 0, bestMine: 0, bestTheirs: 0 };
    if (row.user_id === me) entry.bestMine = row.best;
    else entry.bestTheirs = row.best;
    games.set(row.game_id, entry);
  }

  return (
    <RoomPanel title={`Trophies · ${unlocked}/${items.length}`} icon={<Trophy size={16} />} wide>
      <div className="flex flex-col gap-3 p-3 short:p-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TogetherStat time={time} saved={trophies.together_since} />
          <Stat label="Streak" value={`🔥 ${streak.current}`} hint={`best ${stats.bestStreak} days`} />
          <Stat label="Days here together" value={String(trophies.days_together_here ?? 0)} />
          <Stat label="Games finished" value={String(stats.gamesPlayed)} />
        </div>

        <section aria-label="Milestones">
          <h3 className="mb-1.5 micro-caps text-pink-400">Milestones</h3>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 short:grid-cols-6">
            {items.map((item) => (
              <li key={item.id} title={item.detail} className={`flex flex-col items-center gap-0.5 rounded-[var(--radius-sm)] p-2 text-center ${item.unlocked ? "bg-black-800" : "bg-black-900/60 opacity-45"}`}>
                <span aria-hidden="true" className={`text-[1.6rem] leading-none ${item.unlocked ? "" : "grayscale"}`}>
                  {item.icon}
                </span>
                <span className="text-micro font-semibold tracking-normal text-white-soft">{item.title}</span>
                <span className="text-[0.65rem] leading-tight text-text-muted">{item.unlocked ? item.detail : `🔒 ${item.detail}`}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Game wins">
          <h3 className="mb-1.5 micro-caps text-green-500">Game wins</h3>
          {games.size === 0 ? (
            <p className="text-caption text-text-muted">No winners yet — open the Games menu and settle it.</p>
          ) : (
            <table className="w-full text-caption">
              <thead>
                <tr className="text-left text-micro tracking-normal text-text-muted">
                  <th className="py-1 font-normal">Game</th>
                  <th className="py-1 font-normal">You</th>
                  <th className="py-1 font-normal">{partnerName}</th>
                </tr>
              </thead>
              <tbody>
                {[...games].map(([gameId, entry]) => {
                  const definition = gameRegistry.get(gameId);
                  const lead = entry.mine === entry.theirs ? null : entry.mine > entry.theirs ? "mine" : "theirs";
                  return (
                    <tr key={gameId} className="border-t border-[var(--border-subtle)] text-white-soft">
                      <td className="py-1.5">
                        {definition?.icon} {definition?.name ?? gameId}
                      </td>
                      <td className={`py-1.5 ${lead === "mine" ? "font-semibold text-green-500" : ""}`}>
                        {entry.mine} {lead === "mine" ? "🏆" : ""}
                        {entry.bestMine > 1 && <span className="ml-1 text-micro text-text-muted">best run {entry.bestMine}</span>}
                      </td>
                      <td className={`py-1.5 ${lead === "theirs" ? "font-semibold text-pink-400" : ""}`}>
                        {entry.theirs} {lead === "theirs" ? "🏆" : ""}
                        {entry.bestTheirs > 1 && <span className="ml-1 text-micro text-text-muted">best run {entry.bestTheirs}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </RoomPanel>
  );
}

const shortDate = (date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Days together, how long that is, the next monthsary — and changing the date. */
function TogetherStat({ time, saved }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const save = async (value) => {
    const failed = await useRoomStore.getState().setTogetherSince(value);
    setError(failed ? "Couldn't save that date." : null);
    if (!failed) setEditing(false);
  };
  const { next } = time;
  const when = next.inDays === 0 ? "is today 🎉" : next.inDays === 1 ? "is tomorrow" : `in ${next.inDays} days`;
  return (
    <div className="col-span-2 rounded-[var(--radius-sm)] bg-black-800 px-2.5 py-2 sm:col-span-1">
      <span className="flex items-center justify-between text-micro tracking-normal text-text-muted">
        Together
        <button type="button" onClick={() => setEditing((on) => !on)} aria-label="Change when you got together" className="grid size-6 place-items-center rounded-full hover:bg-black-700">
          <Pencil aria-hidden="true" size={11} />
        </button>
      </span>
      <span className="block text-body font-semibold text-white-soft">💞 {time.days.toLocaleString()} days</span>
      <span className="block text-[0.65rem] text-text-muted">
        {durationText(time)} · since {shortDate(time.since)}
      </span>
      <span className="block text-[0.65rem] text-pink-400">
        {anniversaryLabel(next.months)} {when}
        {next.inDays > 1 && ` · ${next.on.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
      </span>
      {editing && (
        <label className="mt-1 flex flex-col gap-0.5 text-[0.65rem] text-text-muted">
          The day you got together
          <input
            type="date"
            defaultValue={saved ?? isoDay(time.since)}
            max={isoDay(new Date())}
            onChange={(event) => event.target.value && save(event.target.value)}
            className="rounded-[var(--radius-sm)] bg-black-950 px-1.5 py-1 text-caption text-white-soft [color-scheme:dark]"
          />
          {error && <span className="text-pink-400">{error}</span>}
        </label>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-black-800 px-2.5 py-2">
      <span className="block text-micro tracking-normal text-text-muted">{label}</span>
      <span className="block text-body font-semibold text-white-soft">{value}</span>
      {hint && <span className="block text-[0.65rem] text-text-muted">{hint}</span>}
    </div>
  );
}
