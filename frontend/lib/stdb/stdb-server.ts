/**
 * Server-side SpacetimeDB helpers for API routes.
 * Provides project ownership verification via STDB SQL API.
 */

const STDB_BACKEND =
  process.env.STDB_BACKEND_URL ??
  process.env.NEXT_PUBLIC_STDB_BACKEND_URL ??
  'http://127.0.0.1:3000';
const DB_NAME = process.env.STDB_MODULE ?? process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';

/**
 * Verify that a user owns a project by querying STDB directly.
 * Returns true if the project exists and its ownerId matches uid.
 */
export async function verifyProjectOwnership(projectId: string, uid: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) return false;

  const res = await fetch(`${STDB_BACKEND}/v1/database/${DB_NAME}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `SELECT * FROM projects WHERE id = '${projectId}'`,
  });

  if (!res.ok) return false;

  const results = await res.json();
  if (!results?.[0]?.rows?.length) return false;

  const { schema, rows } = results[0];
  const cols: string[] = schema.elements.map((el: any) => el.name.some);
  let ownerIdx = cols.indexOf('owner_id');
  if (ownerIdx === -1) ownerIdx = cols.indexOf('ownerId');
  if (ownerIdx === -1) return false;

  return rows[0][ownerIdx] === uid;
}
