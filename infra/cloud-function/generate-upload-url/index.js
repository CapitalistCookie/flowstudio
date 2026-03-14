const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'flowstudio-assets';

/**
 * Cloud Function: Generate a signed GCS upload URL for source video uploads.
 * Fallback for when SpacetimeDB procedures are unavailable.
 */
exports.generateUploadUrl = async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { projectId, filename, contentType } = req.body;

  if (!projectId || !filename || !contentType) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Reject path traversal
  if (projectId.includes('..') || projectId.includes('/') || filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid projectId or filename' });
    return;
  }

  // Validate content type
  if (!contentType.startsWith('video/')) {
    res.status(400).json({ error: 'Only video files are accepted' });
    return;
  }

  const gcsPath = `projects/${projectId}/source_video/${filename}`;
  const file = storage.bucket(BUCKET).file(gcsPath);

  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType || 'video/mp4',
    });

    res.json({ url, gcsPath: `gs://${BUCKET}/${gcsPath}` });
  } catch (err) {
    console.error('Failed to generate signed URL:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};
