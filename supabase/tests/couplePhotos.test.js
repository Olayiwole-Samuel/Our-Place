import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePhoto, removeCouplePhoto, saveCouplePhoto } from "@/lib/couple/photos.server";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Couple photos: RLS on the slots table and the private bucket, plus the
// server's validation and ownership rules for writes.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `photo${++n}@example.test`, name: `Photo ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};
const addPhoto = (coupleId, slot, userId, file) =>
  db.query("insert into public.couple_photos (couple_id, slot, user_id, path) values ($1, $2, $3, $4)", [coupleId, slot, userId, `${coupleId}/${file}`]);
const putObject = (path) => db.query("insert into storage.objects (bucket_id, name) values ('couple-photos', $1)", [path]);

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(() => db?.close());

describe("couple photos (database)", () => {
  it("members read their own couple's slots; another couple sees nothing", async () => {
    const one = await pair();
    const two = await pair();
    await addPhoto(one.coupleId, "together_a", null, "together_a-1.webp");
    await addPhoto(one.coupleId, "together_b", null, "together_b-1.webp");
    await addPhoto(one.coupleId, "portrait", one.a, `portrait-${one.a}-1.webp`);
    const mine = await as(db, one.b, (tx) => tx.query("select slot from public.couple_photos order by slot"));
    expect(mine.rows.map((r) => r.slot)).toEqual(["portrait", "together_a", "together_b"]);
    expect((await as(db, two.a, (tx) => tx.query("select * from public.couple_photos"))).rows).toEqual([]);
    expect((await as(db, null, (tx) => tx.query("select * from public.couple_photos").catch(() => ({ rows: [] })))).rows).toEqual([]);
  });

  it("clients can't write slots — a forged couple id or path goes nowhere", async () => {
    const one = await pair();
    const two = await pair();
    await expect(as(db, one.a, (tx) => tx.query("insert into public.couple_photos (couple_id, slot, path) values ($1, 'together_a', $2)", [two.coupleId, `${two.coupleId}/x.webp`]))).rejects.toThrow(/permission denied/);
    await expect(as(db, one.a, (tx) => tx.query("update public.couple_photos set path = 'x'"))).rejects.toThrow(/permission denied/);
  });

  it("two together slots per couple, one portrait per partner, files only in the couple's own folder", async () => {
    const one = await pair();
    const other = await pair();
    await addPhoto(one.coupleId, "together_a", null, "a.webp");
    await expect(addPhoto(one.coupleId, "together_a", null, "a2.webp")).rejects.toThrow(/duplicate key/);
    await addPhoto(one.coupleId, "portrait", one.a, "pa.webp");
    await addPhoto(one.coupleId, "portrait", one.b, "pb.webp");
    await expect(addPhoto(one.coupleId, "portrait", one.a, "pa2.webp")).rejects.toThrow(/duplicate key/);
    await expect(addPhoto(one.coupleId, "portrait", null, "p.webp")).rejects.toThrow(/couple_photos_portrait_has_user/);
    await expect(db.query("insert into public.couple_photos (couple_id, slot, path) values ($1, 'together_b', $2)", [one.coupleId, `${other.coupleId}/b.webp`])).rejects.toThrow(/couple_photos_path_in_couple_folder/);
  });

  it("the private bucket lets a couple read only its own folder", async () => {
    const one = await pair();
    const two = await pair();
    await putObject(`${one.coupleId}/together_a-1.webp`);
    const read = (userId) => as(db, userId, (tx) => tx.query("select name from storage.objects where bucket_id = 'couple-photos'"));
    expect((await read(one.a)).rows).toHaveLength(1);
    expect((await read(two.a)).rows).toEqual([]);
    await expect(as(db, one.a, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('couple-photos', $1)", [`${one.coupleId}/evil.webp`]))).rejects.toThrow(/row-level security/);
  });
});

describe("couple photo writes (server)", () => {
  const webp = (bytes = 64) => {
    const buffer = Buffer.alloc(bytes);
    buffer.write("RIFF", 0);
    buffer.write("WEBP", 8);
    return `data:image/webp;base64,${buffer.toString("base64")}`;
  };

  /** A recording stand-in for the service-role client. */
  function fakeAdmin({ coupleId, existing = null, members = [] }) {
    const calls = { uploads: [], removed: [], inserts: [], updates: [], filters: [] };
    const table = (name) => {
      const query = {
        select: () => query,
        eq: (column, value) => (calls.filters.push([name, column, value]), query),
        then: (resolve) => resolve({ data: name === "couple_members" ? members.map((user_id) => ({ user_id })) : [], error: null }),
        maybeSingle: async () => ({ data: name === "couple_members" ? (coupleId ? { couple_id: coupleId } : null) : existing, error: null }),
        insert: async (row) => (calls.inserts.push(row), { error: null }),
        update: (row) => (calls.updates.push(row), { eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
      return query;
    };
    return {
      calls,
      from: table,
      storage: { from: () => ({ upload: async (path, bytes, options) => (calls.uploads.push({ path, size: bytes.length, options }), { error: null }), remove: async (paths) => (calls.removed.push(...paths), { error: null }) }) },
    };
  }
  const COUPLE = "33333333-3333-4333-8333-333333333333";
  const USER = "11111111-1111-4111-8111-111111111111";

  it("accepts only real JPG/PNG/WebP images under the size limit", () => {
    expect(parsePhoto(webp()).type).toBe("image/webp");
    expect(() => parsePhoto("https://example.com/me.jpg")).toThrow();
    expect(() => parsePhoto("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => parsePhoto(`data:image/png;base64,${Buffer.alloc(64).toString("base64")}`)).toThrow(); // not really a PNG
    expect(() => parsePhoto(webp(1_700_000))).toThrow();
  });

  it("stores into the CALLER's couple folder; by default a portrait is the caller's own", async () => {
    const admin = fakeAdmin({ coupleId: COUPLE });
    await saveCouplePhoto({ admin, userId: USER, slot: "portrait", dataUrl: webp() });
    expect(admin.calls.uploads[0].path).toMatch(new RegExp(`^${COUPLE}/portrait-${USER}-[0-9a-f]{8}\\.webp$`));
    expect(admin.calls.inserts[0]).toEqual({ couple_id: COUPLE, slot: "portrait", user_id: USER, path: admin.calls.uploads[0].path });
    expect(admin.calls.filters).toContainEqual(["couple_members", "user_id", USER]);
  });

  it("a partner's portrait goes to the other member of the CALLER's couple (never an id from the request)", async () => {
    const PARTNER = "22222222-2222-4222-8222-222222222222";
    const admin = fakeAdmin({ coupleId: COUPLE, members: [USER, PARTNER] });
    await saveCouplePhoto({ admin, userId: USER, slot: "portrait", whose: "partner", dataUrl: webp() });
    expect(admin.calls.inserts[0]).toMatchObject({ couple_id: COUPLE, slot: "portrait", user_id: PARTNER });
    expect(admin.calls.filters).toContainEqual(["couple_members", "couple_id", COUPLE]);
    await expect(saveCouplePhoto({ admin, userId: USER, slot: "portrait", whose: PARTNER, dataUrl: webp() })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(saveCouplePhoto({ admin: fakeAdmin({ coupleId: COUPLE, members: [USER] }), userId: USER, slot: "portrait", whose: "partner", dataUrl: webp() })).rejects.toMatchObject({ code: "not_paired" });
  });

  it("replacing a photo removes the old image; unknown slots and unpaired users are refused", async () => {
    const admin = fakeAdmin({ coupleId: COUPLE, existing: { id: "row", path: `${COUPLE}/together_a-old.webp` } });
    await saveCouplePhoto({ admin, userId: USER, slot: "together_a", dataUrl: webp() });
    expect(admin.calls.updates).toHaveLength(1);
    expect(admin.calls.removed).toEqual([`${COUPLE}/together_a-old.webp`]);
    await expect(saveCouplePhoto({ admin, userId: USER, slot: "../../other", dataUrl: webp() })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(saveCouplePhoto({ admin: fakeAdmin({ coupleId: null }), userId: USER, slot: "together_b", dataUrl: webp() })).rejects.toMatchObject({ code: "not_paired" });
    await removeCouplePhoto({ admin, userId: USER, slot: "together_a" });
    expect(admin.calls.removed).toContain(`${COUPLE}/together_a-old.webp`);
  });
});
