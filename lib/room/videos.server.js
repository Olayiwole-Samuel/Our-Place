import "server-only";
import { randomUUID } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PAIRING_ERROR, PairingError } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";
import { parseEpisode } from "./series";

/**
 * Videos for the TV (movies and the couple's own clips), stored in a PRIVATE
 * Backblaze B2 bucket through its S3-compatible API. Configure (server-only):
 *   B2_KEY_ID, B2_APPLICATION_KEY   an application key for that bucket (read + write)
 *   B2_BUCKET                       the bucket name
 *   B2_ENDPOINT                     e.g. s3.eu-central-003.backblazeb2.com
 *
 * Upload, in pieces so it can always carry on where it stopped (cancel, a
 * closed tab, a dropped connection):
 *   1. start   the server creates the row ("uploading") and a multipart upload
 *              for <couple_id>/<uuid>.<ext>; the browser keeps { id, uploadId }.
 *   2. parts   the browser asks which pieces B2 already has (ListParts) and for
 *              signed PUT URLs for the rest, then sends them straight to B2
 *              (big files never pass through our server).
 *   3. finish  the server lists the pieces ITSELF (never trusting the client),
 *              checks they make up exactly the announced size, completes the
 *              upload and marks the video "ready".
 * An uploadId only works with the object key it was made for, and the key
 * always comes from the couple's own row — so a client can't reach anything
 * else. Playback: a signed GET URL (6 h) per request; the bucket is never public.
 * The couple always comes from membership, never the request.
 */
export const MAX_VIDEO_BYTES = 5 * 1024 ** 3;
export const PART_BYTES = 16 * 1024 ** 2; // B2 needs ≥ 5 MB per piece (except the last); 5 GB → 320 pieces
const MAX_SIGN_PER_CALL = 24;
const PART_URL_SECONDS = 6 * 3600;
const PLAY_URL_SECONDS = 6 * 3600;
const UPLOAD_ID = /^[A-Za-z0-9_\-.+=/~]{1,512}$/;
const TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/ogg": "ogv",
};

const clean = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

export function videoStorageConfig(env = process.env) {
  const keyId = clean(env.B2_KEY_ID);
  const secret = clean(env.B2_APPLICATION_KEY);
  const bucket = clean(env.B2_BUCKET);
  const endpoint = clean(env.B2_ENDPOINT).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!keyId || !secret || !bucket || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/i.test(endpoint)) return null;
  return { keyId, secret, bucket, endpoint, region: endpoint.split(".")[1] };
}

/** How many pieces a file of `size` bytes is sent in. */
export const partCount = (size) => Math.max(1, Math.ceil(size / PART_BYTES));

let client = null;
function s3(config) {
  client ??= new S3Client({ region: config.region, endpoint: `https://${config.endpoint}`, credentials: { accessKeyId: config.keyId, secretAccessKey: config.secret } });
  return client;
}

function requireConfig() {
  const config = videoStorageConfig();
  if (!config) throw new PairingError(PAIRING_ERROR.VIDEO_STORAGE_UNAVAILABLE);
  return config;
}

async function coupleOf(admin, userId) {
  const { data, error } = await admin.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
  if (!data) throw new PairingError(PAIRING_ERROR.NOT_PAIRED);
  return data.couple_id;
}

const cleanTitle = (title) =>
  String(title ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 120);

/** Step 1: register the video and open a multipart upload. */
export async function startVideoUpload({ admin, userId, title, kind, size, contentType }) {
  const config = requireConfig();
  const ext = TYPES[contentType];
  if (!ext || !["movie", "clip"].includes(kind) || !Number.isInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES || !cleanTitle(title)) {
    throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  }
  const coupleId = await coupleOf(admin, userId);
  const objectKey = `${coupleId}/${randomUUID()}.${ext}`;
  let uploadId;
  try {
    ({ UploadId: uploadId } = await s3(config).send(new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: objectKey, ContentType: contentType })));
  } catch (error) {
    reportError(error, { operation: "start video upload" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  const row = { couple_id: coupleId, uploader_id: userId, kind, title: cleanTitle(title), object_key: objectKey, size_bytes: size, content_type: contentType, status: "uploading" };
  // "Squid Game S01E03" goes straight into its series (once 20261015000000_video_series.sql is applied).
  const place = parseEpisode(row.title);
  const insert = (values) => admin.from("couple_videos").insert(values).select("id").single();
  let { data, error } = await insert(place ? { ...row, series: place.series, season: place.season, episode: place.episode } : row);
  if (error && place && missingColumn(error)) ({ data, error } = await insert(row));
  if (error) {
    reportError(error, { operation: "register video" });
    s3(config).send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: objectKey, UploadId: uploadId })).catch(() => {});
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  return { id: data.id, uploadId, partBytes: PART_BYTES, parts: partCount(size) };
}

async function ownVideo(admin, userId, id) {
  const coupleId = await coupleOf(admin, userId);
  const { data } = await admin.from("couple_videos").select("id, object_key, size_bytes, content_type, status, uploader_id").eq("id", id).eq("couple_id", coupleId).maybeSingle();
  if (!data) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  return data;
}

/** Only the person uploading can carry an upload on (it's their file). */
async function ownUpload(admin, userId, id) {
  const video = await ownVideo(admin, userId, id);
  if (video.uploader_id !== userId) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  return video;
}

/** The open multipart upload for this video's own key (newest), or null. */
async function openUpload(config, video) {
  const { Uploads = [] } = await s3(config).send(new ListMultipartUploadsCommand({ Bucket: config.bucket, Prefix: video.object_key }));
  const mine = Uploads.filter((upload) => upload.Key === video.object_key).sort((a, b) => new Date(b.Initiated) - new Date(a.Initiated));
  return mine[0]?.UploadId ?? null;
}

/** Every piece B2 already has: [{ partNumber, size, etag }] (paginated past 1,000), or null when there's no such upload. */
async function listParts(config, video, uploadId) {
  const parts = [];
  let marker;
  do {
    let page;
    try {
      page = await s3(config).send(new ListPartsCommand({ Bucket: config.bucket, Key: video.object_key, UploadId: uploadId, PartNumberMarker: marker }));
    } catch (error) {
      // Finished, cancelled, or not this video's upload.
      if (error?.name === "NoSuchUpload" || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
    for (const part of page.Parts ?? []) parts.push({ partNumber: part.PartNumber, size: Number(part.Size), etag: part.ETag });
    marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
  } while (marker);
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

/** The finished file's size, or null if there's no file yet. */
async function storedSize(config, video) {
  try {
    const head = await s3(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: video.object_key }));
    return Number(head.ContentLength);
  } catch {
    return null;
  }
}

const markReady = (admin, id) => admin.from("couple_videos").update({ status: "ready" }).eq("id", id);

/**
 * Step 2 (also how an upload resumes, on any device): which pieces B2 already
 * has, plus signed URLs for the ones asked for. With no uploadId the open upload
 * is found from the video itself; if its pieces are gone, a fresh upload starts
 * for the same video (unless `peek`: just looking, as the TV does on open);
 * a file that's already whole is simply marked ready.
 *   → { status: "uploading", uploadId, parts, partBytes, done: [partNumber…], uploadedBytes, urls: { [partNumber]: url } }
 *   → { status: "ready" }
 */
export async function uploadParts({ admin, userId, id, uploadId, partNumbers = [], peek = false }) {
  const config = requireConfig();
  const video = await ownUpload(admin, userId, id);
  if (video.status === "ready") return { status: "ready" };
  const size = Number(video.size_bytes);
  const total = partCount(size);
  if (uploadId !== undefined && !UPLOAD_ID.test(uploadId)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  if (!Array.isArray(partNumbers) || partNumbers.length > MAX_SIGN_PER_CALL || !partNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= total)) {
    throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  }

  let current = uploadId ?? (await openUpload(config, video));
  let done = current ? await listParts(config, video, current) : null;
  if (!done) {
    // A whole file already there (an upload from before pieces, or a finish whose answer was lost).
    if ((await storedSize(config, video)) === size) {
      await markReady(admin, id);
      return { status: "ready" };
    }
    if (peek) return { status: "uploading", uploadId: null, parts: total, partBytes: PART_BYTES, done: [], uploadedBytes: 0, urls: {} };
    ({ UploadId: current } = await s3(config).send(new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: video.object_key, ContentType: video.content_type })));
    done = [];
  }
  const urls = {};
  for (const partNumber of new Set(partNumbers)) {
    urls[partNumber] = await getSignedUrl(s3(config), new UploadPartCommand({ Bucket: config.bucket, Key: video.object_key, UploadId: current, PartNumber: partNumber }), { expiresIn: PART_URL_SECONDS });
  }
  return { status: "uploading", uploadId: current, parts: total, partBytes: PART_BYTES, done: done.map((part) => part.partNumber), uploadedBytes: done.reduce((sum, part) => sum + part.size, 0), urls };
}

/** True when `parts` are exactly pieces 1…n of a file of `size` bytes. */
export function partsComplete(parts, size) {
  const total = partCount(size);
  if (parts.length !== total) return false;
  return parts.every((part, i) => part.partNumber === i + 1 && part.size === (i + 1 < total ? PART_BYTES : size - PART_BYTES * (total - 1)));
}

/**
 * Step 3: every piece is up — complete the upload, check it, mark it ready.
 * Safe to repeat: pieces still missing → { status: "uploading", done } (carry on);
 * already completed → just checked and marked ready.
 */
export async function finishVideoUpload({ admin, userId, id, uploadId }) {
  const config = requireConfig();
  const video = await ownVideo(admin, userId, id);
  if (video.status === "ready") return { id, status: "ready" };
  if (uploadId !== undefined) {
    if (!UPLOAD_ID.test(uploadId)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
    await ownUpload(admin, userId, id);
    const parts = await listParts(config, video, uploadId);
    if (parts) {
      if (!partsComplete(parts, Number(video.size_bytes))) return { id, status: "uploading", done: parts.map((part) => part.partNumber) };
      try {
        await s3(config).send(
          new CompleteMultipartUploadCommand({
            Bucket: config.bucket,
            Key: video.object_key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
          }),
        );
      } catch (error) {
        reportError(error, { operation: "complete video upload" });
        throw new PairingError(PAIRING_ERROR.UNKNOWN);
      }
    }
  }
  if ((await storedSize(config, video)) !== Number(video.size_bytes)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST); // nothing (whole) uploaded
  await markReady(admin, id);
  return { id, status: "ready" };
}

/** The series columns aren't there yet (migration not applied): carry on without them. */
const missingColumn = (error) => ["PGRST204", "42703"].includes(error?.code) || /column .* does not exist|schema cache/i.test(error?.message ?? "");

/**
 * Put a video in a series (or take it out): { series: "Squid Game" | null, season, episode }.
 * Either partner can sort the library.
 */
export async function updateVideo({ admin, userId, id, series, season, episode }) {
  await ownVideo(admin, userId, id);
  const name = series === null || series === undefined ? null : cleanTitle(series).slice(0, 80);
  const number = (value, max) => (value === null || value === undefined || value === "" ? null : Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : NaN);
  const patch = { series: name || null, season: name ? (number(season, 99) ?? 1) : null, episode: name ? number(episode, 9999) : null };
  if (Number.isNaN(patch.season) || Number.isNaN(patch.episode)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  const { error } = await admin.from("couple_videos").update(patch).eq("id", id);
  if (error) {
    if (missingColumn(error)) throw new PairingError(PAIRING_ERROR.SERIES_UNAVAILABLE);
    reportError(error, { operation: "update video" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  return { id, ...patch };
}

/** A short-lived link to stream a ready video (range requests work, so seeking is instant). */
export async function playVideoUrl({ admin, userId, id }) {
  const config = requireConfig();
  const video = await ownVideo(admin, userId, id);
  if (video.status !== "ready") throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  return getSignedUrl(s3(config), new GetObjectCommand({ Bucket: config.bucket, Key: video.object_key }), { expiresIn: PLAY_URL_SECONDS });
}

/**
 * Either partner can remove a video (or an unfinished upload); the file and any
 * pieces already sent go too. Unfinished uploads are found by the video's own
 * key, so this works even for the partner, whose browser never had the uploadId.
 */
export async function deleteVideo({ admin, userId, id }) {
  const config = requireConfig();
  const video = await ownVideo(admin, userId, id);
  if (video.status === "uploading") {
    try {
      const { Uploads = [] } = await s3(config).send(new ListMultipartUploadsCommand({ Bucket: config.bucket, Prefix: video.object_key }));
      await Promise.all(
        Uploads.filter((upload) => upload.Key === video.object_key).map((upload) => s3(config).send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: video.object_key, UploadId: upload.UploadId }))),
      );
    } catch (error) {
      reportError(error, { operation: "cancel video upload" });
    }
  }
  try {
    await s3(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: video.object_key }));
  } catch (error) {
    reportError(error, { operation: "delete video file" });
  }
  await admin.from("couple_videos").delete().eq("id", id);
}
