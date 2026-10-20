import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PAIRING_ERROR, PairingError } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";

/**
 * Videos for the TV (movies and the couple's own clips), stored in a PRIVATE
 * Backblaze B2 bucket through its S3-compatible API. Configure (server-only):
 *   B2_KEY_ID, B2_APPLICATION_KEY   an application key for that bucket (read + write)
 *   B2_BUCKET                       the bucket name
 *   B2_ENDPOINT                     e.g. s3.us-east-005.backblazeb2.com
 *
 * Upload: the server creates the row ("uploading") and a short-lived signed
 * PUT URL for <couple_id>/<uuid>.<ext>; the browser uploads straight to B2
 * (big files never pass through our server); then the server checks the
 * object really exists with the announced size and marks it "ready".
 * Playback: a signed GET URL (6 h) per request — the bucket is never public.
 * The couple always comes from membership, never the request.
 */
export const MAX_VIDEO_BYTES = 5 * 1024 ** 3; // B2's single-upload limit
const UPLOAD_URL_SECONDS = 6 * 3600;
const PLAY_URL_SECONDS = 6 * 3600;
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

/** Step 1: register the video and hand out a signed upload URL. */
export async function startVideoUpload({ admin, userId, title, kind, size, contentType }) {
  const config = requireConfig();
  const ext = TYPES[contentType];
  if (!ext || !["movie", "clip"].includes(kind) || !Number.isInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES || !cleanTitle(title)) {
    throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  }
  const coupleId = await coupleOf(admin, userId);
  const objectKey = `${coupleId}/${randomUUID()}.${ext}`;
  const { data, error } = await admin
    .from("couple_videos")
    .insert({ couple_id: coupleId, uploader_id: userId, kind, title: cleanTitle(title), object_key: objectKey, size_bytes: size, content_type: contentType, status: "uploading" })
    .select("id")
    .single();
  if (error) {
    reportError(error, { operation: "register video" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  const uploadUrl = await getSignedUrl(s3(config), new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, ContentType: contentType, ContentLength: size }), { expiresIn: UPLOAD_URL_SECONDS });
  return { id: data.id, uploadUrl, contentType };
}

async function ownVideo(admin, userId, id) {
  const coupleId = await coupleOf(admin, userId);
  const { data } = await admin.from("couple_videos").select("id, object_key, size_bytes, status, uploader_id").eq("id", id).eq("couple_id", coupleId).maybeSingle();
  if (!data) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  return data;
}

/** Step 2: the upload finished — check the object and mark it ready. */
export async function finishVideoUpload({ admin, userId, id }) {
  const config = requireConfig();
  const video = await ownVideo(admin, userId, id);
  if (video.status === "ready") return { id, status: "ready" };
  let head;
  try {
    head = await s3(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: video.object_key }));
  } catch {
    throw new PairingError(PAIRING_ERROR.INVALID_REQUEST); // nothing was uploaded
  }
  if (Number(head.ContentLength) !== Number(video.size_bytes)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  await admin.from("couple_videos").update({ status: "ready" }).eq("id", id);
  return { id, status: "ready" };
}

/** A short-lived link to stream a ready video (range requests work, so seeking is instant). */
export async function playVideoUrl({ admin, userId, id }) {
  const config = requireConfig();
  const video = await ownVideo(admin, userId, id);
  if (video.status !== "ready") throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  return getSignedUrl(s3(config), new GetObjectCommand({ Bucket: config.bucket, Key: video.object_key }), { expiresIn: PLAY_URL_SECONDS });
}

/** Either partner can remove a video (or cancel an upload); the file goes too. */
export async function deleteVideo({ admin, userId, id }) {
  const config = requireConfig();
  const video = await ownVideo(admin, userId, id);
  try {
    await s3(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: video.object_key }));
  } catch (error) {
    reportError(error, { operation: "delete video file" });
  }
  await admin.from("couple_videos").delete().eq("id", id);
}
