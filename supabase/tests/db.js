import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(import.meta.dirname, "..");

/**
 * Real Postgres (PGlite/WASM) with the Supabase shim and every migration in
 * supabase/migrations applied in order — the same SQL that ships to production.
 */
export async function createTestDatabase() {
  const db = await PGlite.create();
  await db.exec(readFileSync(join(ROOT, "tests", "supabase-shim.sql"), "utf8"));
  const migrations = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(ROOT, "migrations", file), "utf8"));
  }
  return db;
}

/** Simulates Google sign-up: inserts into auth.users (fires the profile trigger). */
export async function signUp(db, { email, name, picture } = {}) {
  const { rows } = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email ?? null, JSON.stringify({ full_name: name, picture })],
  );
  return rows[0].id;
}

/**
 * Runs `fn(tx)` exactly as a PostgREST request from that user would: role
 * `authenticated` with the user's id in the JWT claims. Pass `null` for an
 * anonymous (signed-out) request.
 */
export function as(db, userId, fn) {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await tx.exec("set local role authenticated");
    } else {
      await tx.exec("set local role anon");
    }
    return fn(tx);
  });
}

export const rpc = {
  createInvite: (db, userId) =>
    as(db, userId, async (tx) => (await tx.query("select * from public.create_couple_invite()")).rows[0]),
  /** Resolves to the couple id, or rejects with `pairing:<reason>` for a refused join. */
  join: async (db, userId, code) => {
    const row = await as(db, userId, async (tx) => (await tx.query("select * from public.join_couple($1)", [code])).rows[0]);
    if (row.error) throw new Error(`pairing:${row.error}`);
    return row.couple_id;
  },
};
