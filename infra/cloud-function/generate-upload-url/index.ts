import { Storage } from '@google-cloud/storage';
import type { Request, Response } from 'express';

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET ?? 'flowstudio-assets';

export async function generateUploadUrl(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { projectId, filename, contentType } = req.body as {
    projectId: string;
    filename: string;
    contentType: string;
  };

  if (!projectId || !filename) {
    res.status(400).json({ error: 'Missing projectId or filename' });
    return;
  }

  const gcsPath = `projects/${projectId}/source_video/${filename}`;
  const file = storage.bucket(BUCKET).file(gcsPath);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType: contentType ?? 'video/mp4',
  });

  res.json({ url, gcsPath: `gs://${BUCKET}/${gcsPath}` });
}
