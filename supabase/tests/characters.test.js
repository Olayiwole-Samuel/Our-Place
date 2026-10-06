import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Real migrations in real Postgres: character ownership, partner visibility,
// private provider metadata, and model storage access.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `ch${++n}@example.test`, name: `Char ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  await rpc.join(db, b, code);
  return { a, b };
};
const run = (userId, sql, params) => as(db, userId, async (tx) => (await tx.query(sql, params)).rows);
const config = (hair = "short_crop") => JSON.stringify({ version: 1, hair: { style: hair } });
const create = (userId, owner = userId) => run(userId, "insert into public.characters (user_id, config) values ($1, $2) returning id", [owner, config()]);

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(() => db?.close());

describe("characters: ownership", () => {
  it("a user creates, reads and updates their own character", async () => {
    const a = await newUser();
    await create(a);
    await run(a, "update public.characters set config = $1 where user_id = $2", [config("afro"), a]);
    const [row] = await run(a, "select config, provider, version from public.characters where user_id = $1", [a]);
    expect(row).toMatchObject({ provider: "ourplace", version: 1, config: { hair: { style: "afro" } } });
  });

  it("one character per user", async () => {
    const a = await newUser();
    await create(a);
    await expect(create(a)).rejects.toThrow(/duplicate key|unique/);
  });

  it("cannot create a character for someone else (forged user_id)", async () => {
    const a = await newUser();
    const b = await newUser();
    await expect(create(a, b)).rejects.toThrow(/row-level security/);
  });

  it("cannot modify another user's character, outfit or model — even their partner", async () => {
    const { a, b } = await pair();
    await create(b);
    const updated = await run(a, "update public.characters set config = $1 where user_id = $2 returning id", [config("bald"), b]);
    expect(updated).toEqual([]); // RLS: no visible row to update
    const [row] = await run(b, "select config from public.characters where user_id = $1", [b]);
    expect(row.config.hair.style).toBe("short_crop");
  });

  it("cannot hand a character to another user", async () => {
    const a = await newUser();
    const b = await newUser();
    await create(a);
    await expect(run(a, "update public.characters set user_id = $1 where user_id = $2", [b, a])).rejects.toThrow(/permission denied/);
  });

  it("clients cannot set provider, model paths or provider metadata", async () => {
    const a = await newUser();
    await expect(
      run(a, "insert into public.characters (user_id, config, provider) values ($1, $2, 'metaperson')", [a, config()]),
    ).rejects.toThrow(/permission denied/);
    await create(a);
    await expect(run(a, "update public.characters set model_path = $1 where user_id = $2", [`${a}/x.glb`, a])).rejects.toThrow(/permission denied/);
    await expect(run(a, "update public.characters set provider_ref = 'x' where user_id = $1", [a])).rejects.toThrow(/permission denied/);
  });

  it("cannot delete characters", async () => {
    const a = await newUser();
    await create(a);
    await expect(run(a, "delete from public.characters where user_id = $1", [a])).rejects.toThrow(/permission denied/);
  });

  it("rejects malformed or oversized configs at the database too", async () => {
    const a = await newUser();
    await expect(run(a, "insert into public.characters (user_id, config) values ($1, '[1,2]')", [a])).rejects.toThrow(/check/);
    const huge = JSON.stringify({ blob: "x".repeat(20000) });
    await expect(run(a, "insert into public.characters (user_id, config) values ($1, $2)", [a, huge])).rejects.toThrow(/check/);
  });
});

describe("characters: partner presentation vs privacy", () => {
  it("the partner can see the character (to render it)", async () => {
    const { a, b } = await pair();
    await create(a);
    const rows = await run(b, "select user_id, config from public.characters where user_id = $1", [a]);
    expect(rows).toHaveLength(1);
  });

  it("other couples and unpaired users cannot see it", async () => {
    const { a } = await pair();
    const other = await pair();
    const loner = await newUser();
    await create(a);
    expect(await run(other.a, "select id from public.characters where user_id = $1", [a])).toEqual([]);
    expect(await run(loner, "select id from public.characters where user_id = $1", [a])).toEqual([]);
    await expect(run(null, "select id from public.characters")).rejects.toThrow(/permission denied/);
  });

  it("provider generation metadata is never readable through the API — not even by the owner", async () => {
    const { a, b } = await pair();
    await create(a);
    await db.query("update public.characters set provider_ref = 'avatar-code', provider_state = '{}' where user_id = $1", [a]);
    await expect(run(a, "select provider_ref from public.characters")).rejects.toThrow(/permission denied/);
    await expect(run(b, "select provider_state from public.characters")).rejects.toThrow(/permission denied/);
  });

  it("model paths must sit in the owner's own folder", async () => {
    const a = await newUser();
    const b = await newUser();
    await create(a);
    await expect(db.query("update public.characters set model_path = $1 where user_id = $2", [`${b}/stolen.glb`, a])).rejects.toThrow(/own_folder/);
    await expect(db.query("update public.characters set model_path = $1 where user_id = $2", [`${a}/model.glb`, a])).resolves.toBeTruthy();
  });
});

describe("character model storage", () => {
  const put = (owner, file) => db.query("insert into storage.objects (bucket_id, name) values ('character-models', $1)", [`${owner}/${file}`]);
  const visible = (userId, owner) =>
    run(userId, "select name from storage.objects where bucket_id = 'character-models' and name like $1", [`${owner}/%`]);

  it("is a private bucket", async () => {
    const { rows } = await db.query("select public from storage.buckets where id = 'character-models'");
    expect(rows).toEqual([{ public: false }]);
  });

  it("owner and partner can read the model; other couples and strangers cannot", async () => {
    const { a, b } = await pair();
    const other = await pair();
    await put(a, "model.glb");
    expect(await visible(a, a)).toHaveLength(1);
    expect(await visible(b, a)).toHaveLength(1);
    expect(await visible(other.a, a)).toEqual([]);
    expect(await run(null, "select name from storage.objects")).toEqual([]);
  });

  it("users cannot upload, overwrite or delete model files (server-only writes)", async () => {
    const { a, b } = await pair();
    await put(b, "model.glb");
    await expect(run(a, "insert into storage.objects (bucket_id, name) values ('character-models', $1)", [`${a}/evil.glb`])).rejects.toThrow(/row-level security/);
    expect(await run(a, "delete from storage.objects where name = $1 returning id", [`${b}/model.glb`])).toEqual([]);
    expect(await run(b, "update storage.objects set name = 'x' where name = $1 returning id", [`${b}/model.glb`])).toEqual([]);
  });
});

describe("character sources: gallery and imports", () => {
  it("clients still cannot choose a provider or gallery model directly (server-written)", async () => {
    const a = await newUser();
    await create(a);
    await expect(run(a, "update public.characters set library_model = 'base_female' where user_id = $1", [a])).rejects.toThrow(/permission denied/);
  });

  it("a gallery character must name a well-formed model, and only gallery characters may", async () => {
    const a = await newUser();
    await create(a);
    await expect(db.query("update public.characters set provider = 'library' where user_id = $1", [a])).rejects.toThrow(/library_model_matches_provider/);
    await expect(db.query("update public.characters set provider = 'library', library_model = '../evil' where user_id = $1", [a])).rejects.toThrow(/check/);
    await expect(db.query("update public.characters set provider = 'library', library_model = 'base_female' where user_id = $1", [a])).resolves.toBeTruthy();
    await expect(db.query("update public.characters set library_model = 'base_male' where user_id = $1 and provider = 'ourplace'", [a])).resolves.toBeTruthy(); // no-op: row is library now
    await expect(db.query("update public.characters set provider = 'imported' where user_id = $1", [a])).rejects.toThrow(/library_model_matches_provider/);
  });

  it("the partner can read the gallery id to render it", async () => {
    const { a, b } = await pair();
    await create(a);
    await db.query("update public.characters set provider = 'library', library_model = 'base_male' where user_id = $1", [a]);
    expect(await run(b, "select provider, library_model from public.characters where user_id = $1", [a])).toEqual([{ provider: "library", library_model: "base_male" }]);
  });
});
