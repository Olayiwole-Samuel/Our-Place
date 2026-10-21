import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory B2 bucket behind the S3 commands the module uses.
const bucket = { objects: new Map(), uploads: new Map() }; // uploads: id → { key, parts: Map(n → size) }
let nextUpload = 0;
vi.mock("@aws-sdk/client-s3", () => {
  const command = (name) =>
    class {
      constructor(input) {
        this.name = name;
        this.input = input;
      }
    };
  const noSuchUpload = () => Object.assign(new Error("no such upload"), { name: "NoSuchUpload", $metadata: { httpStatusCode: 404 } });
  const handlers = {
    CreateMultipartUpload: ({ Key }) => {
      const UploadId = `up_${++nextUpload}`;
      bucket.uploads.set(UploadId, { key: Key, parts: new Map(), initiated: Date.now() + nextUpload });
      return { UploadId };
    },
    ListMultipartUploads: ({ Prefix }) => ({ Uploads: [...bucket.uploads].filter(([, u]) => u.key.startsWith(Prefix)).map(([UploadId, u]) => ({ UploadId, Key: u.key, Initiated: new Date(u.initiated) })) }),
    ListParts: ({ Key, UploadId }) => {
      const upload = bucket.uploads.get(UploadId);
      if (!upload || upload.key !== Key) throw noSuchUpload();
      return { Parts: [...upload.parts].map(([PartNumber, Size]) => ({ PartNumber, Size, ETag: `"e${PartNumber}"` })), IsTruncated: false };
    },
    CompleteMultipartUpload: ({ Key, UploadId, MultipartUpload }) => {
      const upload = bucket.uploads.get(UploadId);
      bucket.objects.set(Key, MultipartUpload.Parts.reduce((sum, p) => sum + upload.parts.get(p.PartNumber), 0));
      bucket.uploads.delete(UploadId);
      return {};
    },
    AbortMultipartUpload: ({ UploadId }) => (bucket.uploads.delete(UploadId), {}),
    HeadObject: ({ Key }) => {
      if (!bucket.objects.has(Key)) throw Object.assign(new Error("not found"), { name: "NotFound" });
      return { ContentLength: bucket.objects.get(Key) };
    },
    DeleteObject: ({ Key }) => (bucket.objects.delete(Key), {}),
  };
  const commands = Object.fromEntries(Object.keys(handlers).map((name) => [`${name}Command`, command(name)]));
  return {
    ...commands,
    GetObjectCommand: command("GetObject"),
    UploadPartCommand: command("UploadPart"),
    S3Client: class {
      async send(cmd) {
        return handlers[cmd.name](cmd.input);
      }
    },
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: async (_client, cmd) => `https://b2.example/${cmd.input.Key}?part=${cmd.input.PartNumber ?? "get"}&upload=${cmd.input.UploadId ?? ""}` }));

const { PART_BYTES, deleteVideo, finishVideoUpload, partCount, partsComplete, startVideoUpload, uploadParts, videoStorageConfig } = await import("./videos.server");

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
let rows;

/** Just enough of supabase-js for lib/room/videos.server.js. */
function fakeAdmin() {
  return {
    from(table) {
      const filters = [];
      const match = () => (table === "couple_members" ? [{ user_id: ME, couple_id: COUPLE }, { user_id: PARTNER, couple_id: COUPLE }] : rows).filter((row) => filters.every(([c, v]) => row[c] === v));
      const builder = {
        select: () => builder,
        eq: (col, value) => (filters.push([col, value]), builder),
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        insert: (row) => ({ select: () => ({ single: async () => (rows.push({ id: `v${rows.length + 1}`, ...row }), { data: rows.at(-1), error: null }) }) }),
        update: (patch) => ({ eq: async (col, value) => (rows.filter((r) => r[col] === value).forEach((r) => Object.assign(r, patch)), { error: null }) }),
        delete: () => ({ eq: async (col, value) => ((rows = rows.filter((r) => r[col] !== value)), { error: null }) }),
      };
      return builder;
    },
  };
}

/** The browser's part: send these pieces (what a signed PUT does). */
function send(uploadId, size, partNumbers) {
  const upload = bucket.uploads.get(uploadId);
  for (const n of partNumbers) upload.parts.set(n, n < partCount(size) ? PART_BYTES : size - PART_BYTES * (partCount(size) - 1));
}

beforeEach(() => {
  bucket.objects.clear();
  bucket.uploads.clear();
  rows = [];
  Object.assign(process.env, { B2_KEY_ID: "k", B2_APPLICATION_KEY: "s", B2_BUCKET: "ourplace", B2_ENDPOINT: "s3.eu-central-003.backblazeb2.com" });
});

describe("video storage config", () => {
  it("needs all four Backblaze values and a real B2 endpoint", () => {
    expect(videoStorageConfig({})).toBeNull();
    expect(videoStorageConfig({ B2_KEY_ID: "k", B2_APPLICATION_KEY: "s", B2_BUCKET: "b", B2_ENDPOINT: "example.com" })).toBeNull();
    expect(videoStorageConfig({ B2_KEY_ID: " k ", B2_APPLICATION_KEY: '"s"', B2_BUCKET: "our-videos", B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com/" })).toEqual({
      keyId: "k",
      secret: "s",
      bucket: "our-videos",
      endpoint: "s3.us-east-005.backblazeb2.com",
      region: "us-east-005",
    });
  });
});

describe("uploads in pieces, resumable", () => {
  const SIZE = PART_BYTES * 3 + 1000; // 4 pieces
  const admin = fakeAdmin();
  const start = () => startVideoUpload({ admin, userId: ME, title: "The Wedding Party", kind: "movie", size: SIZE, contentType: "video/mp4" });

  it("carries on from where it stopped — on this device or another", async () => {
    const { id, uploadId, parts } = await start();
    expect(parts).toBe(4);
    send(uploadId, SIZE, [1, 2]); // …then paused, the tab closed, the connection dropped

    // Coming back without the uploadId (another device, cleared storage): found from the video itself.
    const resumed = await uploadParts({ admin, userId: ME, id, partNumbers: [3, 4] });
    expect(resumed).toMatchObject({ status: "uploading", uploadId, parts: 4, done: [1, 2], uploadedBytes: PART_BYTES * 2 });
    expect(Object.keys(resumed.urls)).toEqual(["3", "4"]);

    // Finishing early keeps everything open instead of making a broken file.
    expect(await finishVideoUpload({ admin, userId: ME, id, uploadId })).toMatchObject({ status: "uploading", done: [1, 2] });
    expect(bucket.uploads.has(uploadId)).toBe(true);

    send(uploadId, SIZE, [3, 4]);
    expect(await finishVideoUpload({ admin, userId: ME, id, uploadId })).toEqual({ id, status: "ready" });
    expect(bucket.objects.get(rows[0].object_key)).toBe(SIZE);
    expect(rows[0].status).toBe("ready");
    // A repeat (the first answer was lost) is fine.
    expect(await finishVideoUpload({ admin, userId: ME, id, uploadId })).toEqual({ id, status: "ready" });
  });

  it("looking doesn't start anything; pieces gone → a fresh upload for the same video", async () => {
    const { id, uploadId } = await start();
    bucket.uploads.delete(uploadId); // e.g. expired on B2's side
    expect(await uploadParts({ admin, userId: ME, id, peek: true })).toMatchObject({ status: "uploading", uploadId: null, uploadedBytes: 0 });
    expect(bucket.uploads.size).toBe(0);
    const again = await uploadParts({ admin, userId: ME, id, partNumbers: [1] });
    expect(again.uploadId).not.toBe(uploadId);
    expect(again.done).toEqual([]);
  });

  it("marks an already-whole file ready (uploads from before pieces)", async () => {
    const { id, uploadId } = await start();
    bucket.uploads.delete(uploadId);
    bucket.objects.set(rows[0].object_key, SIZE);
    expect(await uploadParts({ admin, userId: ME, id, peek: true })).toEqual({ status: "ready" });
    expect(rows[0].status).toBe("ready");
  });

  it("only the uploader carries it on; either of you can cancel it, pieces and all", async () => {
    const { id, uploadId } = await start();
    send(uploadId, SIZE, [1]);
    await expect(uploadParts({ admin, userId: PARTNER, id })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(uploadParts({ admin, userId: ME, id, partNumbers: [5] })).rejects.toMatchObject({ code: "invalid_request" }); // no such piece
    await deleteVideo({ admin, userId: PARTNER, id }); // the partner never had the uploadId
    expect(bucket.uploads.size).toBe(0);
    expect(rows).toEqual([]);
  });

  it("checks the pieces add up exactly", () => {
    const size = PART_BYTES * 2 + 5;
    const piece = (partNumber, s) => ({ partNumber, size: s });
    expect(partsComplete([piece(1, PART_BYTES), piece(2, PART_BYTES), piece(3, 5)], size)).toBe(true);
    expect(partsComplete([piece(1, PART_BYTES), piece(3, 5)], size)).toBe(false);
    expect(partsComplete([piece(1, PART_BYTES), piece(2, PART_BYTES - 1), piece(3, 6)], size)).toBe(false);
  });
});
