const { Storage } = require("@google-cloud/storage");
const admin = require("firebase-admin");

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || "flowstudio-assets";

// Initialize Firebase Admin (uses default credentials on GCP)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Verify Firebase ID token from Authorization header.
 * Returns decoded token or null.
 */
async function verifyAuth(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  try {
    return await admin.auth().verifyIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

// Allowed origins for CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

function getCorsOrigin(req) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.length === 0) return "*";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/**
 * Cloud Function: Generate a signed GCS upload URL for source video uploads.
 * Requires Firebase authentication.
 */
exports.generateUploadUrl = async (req, res) => {
  const corsOrigin = getCorsOrigin(req);
  res.set("Access-Control-Allow-Origin", corsOrigin);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  // Verify Firebase auth
  const decodedToken = await verifyAuth(req);
  if (!decodedToken) {
    res.status(401).json({ error: "Unauthorized — valid Firebase token required" });
    return;
  }

  const { projectId, filename, contentType } = req.body;

  if (!projectId || !filename || !contentType) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Reject path traversal
  if (
    projectId.includes("..") ||
    projectId.includes("/") ||
    filename.includes("..") ||
    filename.includes("/")
  ) {
    res.status(400).json({ error: "Invalid projectId or filename" });
    return;
  }

  // Validate content type: video (e.g. .mp4) or audio (e.g. .mp3)
  const isVideo = contentType.startsWith("video/");
  const isAudio = contentType.startsWith("audio/");
  if (!isVideo && !isAudio) {
    res
      .status(400)
      .json({
        error: "Only video (.mp4, etc.) or audio (.mp3) files are accepted",
      });
    return;
  }

  const folder = isVideo ? "source_video" : "audio_track";
  const gcsPath = `projects/${projectId}/${folder}/${filename}`;
  const file = storage.bucket(BUCKET).file(gcsPath);

  try {
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType || "video/mp4",
    });

    res.json({ url, gcsPath: `gs://${BUCKET}/${gcsPath}` });
  } catch (err) {
    console.error("Failed to generate signed URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
};
