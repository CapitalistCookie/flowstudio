'use client';

/**
 * SpacetimeDB native SDK connection singleton for the production frontend.
 *
 * Replaces the HTTP bridge (connection.ts) with WebSocket push via the SDK.
 * Provides getConnection(), typed reducer calls, and store sync helpers.
 *
 * STDB uses its own identity system; Firebase UID is passed via registerIdentity reducer.
 */

import { DbConnection, type SubscriptionEventContext, type ErrorContext } from './module_bindings';
import type { ProjectStatus } from '@flowstudio/shared';
import { stdbClipToLocalClip, stdbMediaToLocalMedia, stdbEffectToLocalEffect } from './converters';
import type { TimelineClip, MediaFile } from '@/components/editor-context';
import type { EffectBlockData } from '@/lib/types';

// ─── Connection singleton ────────────────────────────────────────────

const HOST = process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000';
const MODULE = process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';

let connection: DbConnection | null = null;
let subscriptionActive = false;
let currentUid: string | null = null;

export function getConnection(): DbConnection {
  if (!connection) throw new Error('SpacetimeDB not connected. Call initSpacetimeDb() first.');
  return connection;
}

export function isConnected(): boolean {
  return connection !== null && subscriptionActive;
}

// ─── BigInt → Number helpers ─────────────────────────────────────────

function toNum(v: bigint | number): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

// ─── Store sync types ────────────────────────────────────────────────

export interface StdbProject {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  metadata: string;
  starred: boolean;
  folderId: string;
}

export interface StdbFolder {
  id: string;
  name: string;
  ownerId: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface StdbAsset {
  id: string;
  projectId: string;
  assetType: string;
  gcsPath: string;
  sizeBytes: number;
  mimeType: string;
  durationMs: number;
  createdAt: number;
  metadata: string;
}

// ─── Callbacks ───────────────────────────────────────────────────────

type OnConnectCallback = () => void;
type OnDisconnectCallback = () => void;
type OnProjectsChanged = (projects: StdbProject[]) => void;
type OnFoldersChanged = (folders: StdbFolder[]) => void;

// Store-friendly types (bigint → number)
export interface StdbPresenceUser {
  id: string;
  projectId: string;
  firebaseUid: string;
  displayName: string;
  color: string;
  lastHeartbeat: number;
  currentTimelinePosition: number;
}

export interface StdbProjectLock {
  projectId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: number;
  expiresAt: number;
  lockVersion: number;
}

// Project-scoped subscription callbacks
type OnTimelineClipsChanged = (clips: TimelineClip[]) => void;
type OnMediaFilesChanged = (files: MediaFile[]) => void;
type OnEffectBlocksChanged = (blocks: EffectBlockData[]) => void;
type OnPresenceChanged = (users: StdbPresenceUser[]) => void;
type OnLockChanged = (lock: StdbProjectLock | null) => void;

export interface StdbCollaborator {
  id: string;
  projectId: string;
  firebaseUid: string;
  role: string;
  displayName: string;
  email: string;
  addedBy: string;
  addedAt: number;
}

export interface StdbShareLink {
  id: string;
  projectId: string;
  token: string;
  role: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  useCount: number;
}

type OnCollaboratorsChanged = (collaborators: StdbCollaborator[]) => void;
type OnShareLinksChanged = (links: StdbShareLink[]) => void;

let onConnectCb: OnConnectCallback | null = null;
let onDisconnectCb: OnDisconnectCallback | null = null;
let onProjectsChangedCb: OnProjectsChanged | null = null;
let onFoldersChangedCb: OnFoldersChanged | null = null;
let onTimelineClipsChangedCb: OnTimelineClipsChanged | null = null;
let onMediaFilesChangedCb: OnMediaFilesChanged | null = null;
let onEffectBlocksChangedCb: OnEffectBlocksChanged | null = null;
let onPresenceChangedCb: OnPresenceChanged | null = null;
let onLockChangedCb: OnLockChanged | null = null;
let onCollaboratorsChangedCb: OnCollaboratorsChanged | null = null;
let onShareLinksChangedCb: OnShareLinksChanged | null = null;
let subscribedProjectId: string | null = null;
let projectSubscriptionActive = false;

export function setOnProjectsChanged(cb: OnProjectsChanged | null) {
  onProjectsChangedCb = cb;
}

export function setOnFoldersChanged(cb: OnFoldersChanged | null) {
  onFoldersChangedCb = cb;
}

export function setOnTimelineClipsChanged(cb: OnTimelineClipsChanged | null) {
  onTimelineClipsChangedCb = cb;
}

export function setOnMediaFilesChanged(cb: OnMediaFilesChanged | null) {
  onMediaFilesChangedCb = cb;
}

export function setOnEffectBlocksChanged(cb: OnEffectBlocksChanged | null) {
  onEffectBlocksChangedCb = cb;
}

export function setOnPresenceChanged(cb: OnPresenceChanged | null) {
  onPresenceChangedCb = cb;
}

export function setOnLockChanged(cb: OnLockChanged | null) {
  onLockChangedCb = cb;
}

export function setOnCollaboratorsChanged(cb: OnCollaboratorsChanged | null) {
  onCollaboratorsChangedCb = cb;
}

export function setOnShareLinksChanged(cb: OnShareLinksChanged | null) {
  onShareLinksChangedCb = cb;
}

// Debounce helpers
let projectsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let foldersDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function notifyProjectsChanged() {
  if (!onProjectsChangedCb || !connection) return;
  if (projectsDebounceTimer) clearTimeout(projectsDebounceTimer);
  projectsDebounceTimer = setTimeout(() => {
    if (!onProjectsChangedCb || !connection) return;
    const projects: StdbProject[] = [];
    for (const row of connection.db.projects.iter()) {
      projects.push(projectRowToStore(row));
    }
    onProjectsChangedCb(projects);
  }, 100);
}

function notifyFoldersChanged() {
  if (!onFoldersChangedCb || !connection) return;
  if (foldersDebounceTimer) clearTimeout(foldersDebounceTimer);
  foldersDebounceTimer = setTimeout(() => {
    if (!onFoldersChangedCb || !connection) return;
    const folders: StdbFolder[] = [];
    for (const row of connection.db.folders.iter()) {
      folders.push(folderRowToStore(row));
    }
    onFoldersChangedCb(folders);
  }, 100);
}

function notifyTimelineClipsChanged() {
  if (!onTimelineClipsChangedCb || !connection || !subscribedProjectId) return;
  const clips: TimelineClip[] = [];
  for (const row of connection.db.timelineClips.byProjectId.filter(subscribedProjectId)) {
    clips.push(stdbClipToLocalClip(row as any));
  }
  onTimelineClipsChangedCb(clips);
}

function notifyMediaFilesChanged() {
  if (!onMediaFilesChangedCb || !connection || !subscribedProjectId) return;
  const files: MediaFile[] = [];
  for (const row of connection.db.mediaFiles.byProjectId.filter(subscribedProjectId)) {
    files.push(stdbMediaToLocalMedia(row as any));
  }
  onMediaFilesChangedCb(files);
}

function notifyEffectBlocksChanged() {
  if (!onEffectBlocksChangedCb || !connection || !subscribedProjectId) return;
  const blocks: EffectBlockData[] = [];
  for (const row of connection.db.effectBlocks.byProjectId.filter(subscribedProjectId)) {
    blocks.push(stdbEffectToLocalEffect(row as any));
  }
  onEffectBlocksChangedCb(blocks);
}

function notifyPresenceChanged() {
  if (!onPresenceChangedCb || !connection || !subscribedProjectId) return;
  const users: StdbPresenceUser[] = [];
  for (const row of connection.db.projectPresence.byProjectId.filter(subscribedProjectId)) {
    users.push({
      id: (row as any).id,
      projectId: (row as any).projectId,
      firebaseUid: (row as any).firebaseUid,
      displayName: (row as any).displayName,
      color: (row as any).color,
      lastHeartbeat: toNum((row as any).lastHeartbeat),
      currentTimelinePosition: (row as any).currentTimelinePosition,
    });
  }
  onPresenceChangedCb(users);
}

function notifyLockChanged() {
  if (!onLockChangedCb || !connection || !subscribedProjectId) return;
  const lock = connection.db.projectLocks.projectId.find(subscribedProjectId);
  if (lock) {
    onLockChangedCb({
      projectId: (lock as any).projectId,
      lockedBy: (lock as any).lockedBy,
      lockedByName: (lock as any).lockedByName,
      lockedAt: toNum((lock as any).lockedAt),
      expiresAt: toNum((lock as any).expiresAt),
      lockVersion: (lock as any).lockVersion,
    });
  } else {
    onLockChangedCb(null);
  }
}

function notifyCollaboratorsChanged() {
  if (!onCollaboratorsChangedCb || !connection || !subscribedProjectId) return;
  const collabs: StdbCollaborator[] = [];
  try {
    for (const row of connection.db.projectCollaborators.byProjectId.filter(subscribedProjectId)) {
      collabs.push({
        id: (row as any).id,
        projectId: (row as any).projectId,
        firebaseUid: (row as any).firebaseUid,
        role: (row as any).role,
        displayName: (row as any).displayName,
        email: (row as any).email,
        addedBy: (row as any).addedBy,
        addedAt: toNum((row as any).addedAt),
      });
    }
  } catch {
    for (const row of connection.db.projectCollaborators.iter()) {
      if ((row as any).projectId === subscribedProjectId) {
        collabs.push({
          id: (row as any).id,
          projectId: (row as any).projectId,
          firebaseUid: (row as any).firebaseUid,
          role: (row as any).role,
          displayName: (row as any).displayName,
          email: (row as any).email,
          addedBy: (row as any).addedBy,
          addedAt: toNum((row as any).addedAt),
        });
      }
    }
  }
  onCollaboratorsChangedCb(collabs);
}

function notifyShareLinksChanged() {
  if (!onShareLinksChangedCb || !connection || !subscribedProjectId) return;
  const links: StdbShareLink[] = [];
  try {
    for (const row of connection.db.shareLinks.byProjectId.filter(subscribedProjectId)) {
      links.push({
        id: (row as any).id,
        projectId: (row as any).projectId,
        token: (row as any).token,
        role: (row as any).role,
        createdBy: (row as any).createdBy,
        createdAt: toNum((row as any).createdAt),
        expiresAt: toNum((row as any).expiresAt),
        maxUses: (row as any).maxUses,
        useCount: (row as any).useCount,
      });
    }
  } catch {
    for (const row of connection.db.shareLinks.iter()) {
      if ((row as any).projectId === subscribedProjectId) {
        links.push({
          id: (row as any).id,
          projectId: (row as any).projectId,
          token: (row as any).token,
          role: (row as any).role,
          createdBy: (row as any).createdBy,
          createdAt: toNum((row as any).createdAt),
          expiresAt: toNum((row as any).expiresAt),
          maxUses: (row as any).maxUses,
          useCount: (row as any).useCount,
        });
      }
    }
  }
  onShareLinksChangedCb(links);
}

// ─── Row converters ──────────────────────────────────────────────────

function projectRowToStore(row: any): StdbProject {
  return {
    id: row.id,
    name: row.name,
    status: row.status as string,
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
    ownerId: row.ownerId,
    metadata: row.metadata,
    starred: row.starred ?? false,
    folderId: row.folderId ?? '',
  };
}

function folderRowToStore(row: any): StdbFolder {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    color: row.color,
    sortOrder: toNum(row.sortOrder),
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
  };
}

function assetRowToStore(row: any): StdbAsset {
  return {
    id: row.id,
    projectId: row.projectId,
    assetType: row.assetType,
    gcsPath: row.gcsPath,
    sizeBytes: toNum(row.sizeBytes),
    mimeType: row.mimeType,
    durationMs: toNum(row.durationMs),
    createdAt: toNum(row.createdAt),
    metadata: row.metadata,
  };
}

// ─── Init ────────────────────────────────────────────────────────────

/**
 * Initialize the SpacetimeDB WebSocket connection.
 * Subscribes to all public tables and wires reactive callbacks.
 *
 * @param onConnect - called when subscription is applied
 * @param onDisconnect - called on disconnect
 * @param firebaseToken - unused, kept for API compat
 * @param firebaseUid - optional Firebase UID for subscription filtering and identity registration
 */
export function initSpacetimeDb(
  onConnect?: OnConnectCallback,
  onDisconnect?: OnDisconnectCallback,
  firebaseToken?: string,
  firebaseUid?: string,
): Promise<void> {
  if (connection && subscriptionActive) {
    onConnect?.();
    return Promise.resolve();
  }

  // Validate and store UID for subscription filtering
  if (firebaseUid && !/^[a-zA-Z0-9._-]+$/.test(firebaseUid)) {
    throw new Error('Invalid firebaseUid format');
  }
  currentUid = firebaseUid ?? null;

  onConnectCb = onConnect ?? null;
  onDisconnectCb = onDisconnect ?? null;

  return new Promise<void>((resolve, reject) => {
    const builder = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(MODULE);

    connection = builder
      .onConnect((conn: DbConnection, identity: any, token: string) => {
        console.log('[STDB] Connected, identity:', identity.toHexString());

        // Subscribe to all 5 public tables
        conn.subscriptionBuilder()
          .onApplied(async (_ctx: SubscriptionEventContext) => {
            console.log('[STDB] Subscription applied — initial data loaded');
            subscriptionActive = true;
            wireTableCallbacks(conn);
            if (currentUid) {
              try {
                await conn.reducers.registerIdentity({ firebaseUid: currentUid });
              } catch (err) {
                console.error('[STDB] Failed to register identity:', err);
              }

              // Subscribe to projects shared with this user
              const sharedProjectIds: string[] = [];
              try {
                for (const row of conn.db.projectCollaborators.byFirebaseUid.filter(currentUid)) {
                  const r = row as any;
                  if (r.role !== 'owner') {
                    sharedProjectIds.push(r.projectId);
                  }
                }
              } catch {
                for (const row of conn.db.projectCollaborators.iter()) {
                  const r = row as any;
                  if (r.firebaseUid === currentUid && r.role !== 'owner') {
                    sharedProjectIds.push(r.projectId);
                  }
                }
              }
              if (sharedProjectIds.length > 0) {
                const queries = sharedProjectIds.map(pid => `SELECT * FROM projects WHERE id = '${pid}'`);
                conn.subscriptionBuilder()
                  .onApplied(() => {
                    console.log(`[STDB] Shared projects subscription applied (${sharedProjectIds.length} projects)`);
                    notifyProjectsChanged();
                  })
                  .subscribe(queries);
              }
            }
            onConnectCb?.();
            resolve();
          })
          .onError((ctx: any) => {
            console.error('[STDB] Subscription error:', ctx);
          })
          .subscribe([
            currentUid
              ? `SELECT * FROM projects WHERE ownerId = '${currentUid}'`
              : 'SELECT * FROM projects WHERE 1=0',
            currentUid
              ? `SELECT * FROM folders WHERE ownerId = '${currentUid}'`
              : 'SELECT * FROM folders WHERE 1=0',
            currentUid
              ? `SELECT * FROM project_collaborators WHERE firebaseUid = '${currentUid}'`
              : 'SELECT * FROM project_collaborators WHERE 1=0',
          ]);
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        console.error('[STDB] Connection error:', err);
        reject(err);
      })
      .onDisconnect((_ctx: ErrorContext, err?: Error) => {
        console.log('[STDB] Disconnected', err?.message ?? '');
        subscriptionActive = false;
        onDisconnectCb?.();
      })
      .build();

  });
}

/**
 * Wire onInsert/onUpdate/onDelete callbacks on tables
 * to notify the project store of changes.
 */
function wireTableCallbacks(conn: DbConnection) {
  conn.db.projects.onInsert(() => notifyProjectsChanged());
  conn.db.projects.onUpdate(() => notifyProjectsChanged());
  conn.db.projects.onDelete(() => notifyProjectsChanged());

  conn.db.folders.onInsert(() => notifyFoldersChanged());
  conn.db.folders.onUpdate(() => notifyFoldersChanged());
  conn.db.folders.onDelete(() => notifyFoldersChanged());
}

/**
 * Subscribe to project-scoped tables (timeline_clips, media_files, etc.)
 * Call this when entering the editor for a specific project.
 */
export function subscribeToProject(projectId: string): Promise<void> {
  if (!connection) return Promise.reject(new Error('Not connected'));
  if (subscribedProjectId === projectId && projectSubscriptionActive) return Promise.resolve();

  subscribedProjectId = projectId;
  projectSubscriptionActive = false;

  return new Promise<void>((resolve, reject) => {
    connection!.subscriptionBuilder()
      .onApplied(() => {
        console.log(`[STDB] Project subscription applied for ${projectId}`);
        projectSubscriptionActive = true;
        wireProjectCallbacks(connection!);
        // Push initial state for all project-scoped tables (data loaded before
        // callbacks were wired, so onInsert won't fire for pre-existing rows)
        notifyLockChanged();
        notifyPresenceChanged();
        notifyTimelineClipsChanged();
        notifyMediaFilesChanged();
        notifyEffectBlocksChanged();
        notifyCollaboratorsChanged();
        notifyShareLinksChanged();
        resolve();
      })
      .onError((ctx: any) => {
        console.error('[STDB] Project subscription error:', ctx);
        reject(new Error('Project subscription failed'));
      })
      .subscribe([
        `SELECT * FROM assets WHERE projectId = '${projectId}'`,
        `SELECT * FROM tasks WHERE projectId = '${projectId}'`,
        `SELECT * FROM signals WHERE projectId = '${projectId}'`,
        `SELECT * FROM timeline_clips WHERE projectId = '${projectId}'`,
        `SELECT * FROM media_files WHERE projectId = '${projectId}'`,
        `SELECT * FROM effect_blocks WHERE projectId = '${projectId}'`,
        `SELECT * FROM project_presence WHERE projectId = '${projectId}'`,
        `SELECT * FROM project_locks WHERE projectId = '${projectId}'`,
        `SELECT * FROM project_collaborators WHERE projectId = '${projectId}'`,
        `SELECT * FROM share_links WHERE projectId = '${projectId}'`,
      ]);
  });
}

function wireProjectCallbacks(conn: DbConnection) {
  conn.db.timelineClips.onInsert(() => notifyTimelineClipsChanged());
  conn.db.timelineClips.onUpdate(() => notifyTimelineClipsChanged());
  conn.db.timelineClips.onDelete(() => notifyTimelineClipsChanged());

  conn.db.mediaFiles.onInsert(() => notifyMediaFilesChanged());
  conn.db.mediaFiles.onUpdate(() => notifyMediaFilesChanged());
  conn.db.mediaFiles.onDelete(() => notifyMediaFilesChanged());

  conn.db.effectBlocks.onInsert(() => notifyEffectBlocksChanged());
  conn.db.effectBlocks.onUpdate(() => notifyEffectBlocksChanged());
  conn.db.effectBlocks.onDelete(() => notifyEffectBlocksChanged());

  conn.db.projectPresence.onInsert(() => notifyPresenceChanged());
  conn.db.projectPresence.onUpdate(() => notifyPresenceChanged());
  conn.db.projectPresence.onDelete(() => notifyPresenceChanged());

  conn.db.projectLocks.onInsert(() => notifyLockChanged());
  conn.db.projectLocks.onUpdate(() => notifyLockChanged());
  conn.db.projectLocks.onDelete(() => notifyLockChanged());

  conn.db.projectCollaborators.onInsert(() => { notifyCollaboratorsChanged(); notifyProjectsChanged(); });
  conn.db.projectCollaborators.onUpdate(() => notifyCollaboratorsChanged());
  conn.db.projectCollaborators.onDelete(() => { notifyCollaboratorsChanged(); notifyProjectsChanged(); });

  conn.db.shareLinks.onInsert(() => notifyShareLinksChanged());
  conn.db.shareLinks.onUpdate(() => notifyShareLinksChanged());
  conn.db.shareLinks.onDelete(() => notifyShareLinksChanged());
}

// ─── Query helpers for project-scoped data ──────────────────────────

export function getTimelineClips(projectId: string): TimelineClip[] {
  if (!connection || !projectSubscriptionActive) return [];
  const clips: TimelineClip[] = [];
  for (const row of connection.db.timelineClips.byProjectId.filter(projectId)) {
    clips.push(stdbClipToLocalClip(row as any));
  }
  return clips;
}

export function getMediaFiles(projectId: string): MediaFile[] {
  if (!connection || !projectSubscriptionActive) return [];
  const files: MediaFile[] = [];
  for (const row of connection.db.mediaFiles.byProjectId.filter(projectId)) {
    files.push(stdbMediaToLocalMedia(row as any));
  }
  return files;
}

export function getEffectBlocks(projectId: string): EffectBlockData[] {
  if (!connection || !projectSubscriptionActive) return [];
  const blocks: EffectBlockData[] = [];
  for (const row of connection.db.effectBlocks.byProjectId.filter(projectId)) {
    blocks.push(stdbEffectToLocalEffect(row as any));
  }
  return blocks;
}

export function getProjectPresence(projectId: string): StdbPresenceUser[] {
  if (!connection || !projectSubscriptionActive) return [];
  const users: StdbPresenceUser[] = [];
  for (const row of connection.db.projectPresence.byProjectId.filter(projectId)) {
    users.push({
      id: (row as any).id,
      projectId: (row as any).projectId,
      firebaseUid: (row as any).firebaseUid,
      displayName: (row as any).displayName,
      color: (row as any).color,
      lastHeartbeat: toNum((row as any).lastHeartbeat),
      currentTimelinePosition: (row as any).currentTimelinePosition,
    });
  }
  return users;
}

export function getProjectLock(projectId: string): StdbProjectLock | null {
  if (!connection || !projectSubscriptionActive) return null;
  const lock = connection.db.projectLocks.projectId.find(projectId);
  if (!lock) return null;
  return {
    projectId: (lock as any).projectId,
    lockedBy: (lock as any).lockedBy,
    lockedByName: (lock as any).lockedByName,
    lockedAt: toNum((lock as any).lockedAt),
    expiresAt: toNum((lock as any).expiresAt),
    lockVersion: (lock as any).lockVersion,
  };
}

export function getProjectCollaborators(projectId: string): StdbCollaborator[] {
  if (!connection) return [];
  const collabs: StdbCollaborator[] = [];
  try {
    for (const row of connection.db.projectCollaborators.byProjectId.filter(projectId)) {
      collabs.push({
        id: (row as any).id,
        projectId: (row as any).projectId,
        firebaseUid: (row as any).firebaseUid,
        role: (row as any).role,
        displayName: (row as any).displayName,
        email: (row as any).email,
        addedBy: (row as any).addedBy,
        addedAt: toNum((row as any).addedAt),
      });
    }
  } catch {
    for (const row of connection.db.projectCollaborators.iter()) {
      if ((row as any).projectId === projectId) {
        collabs.push({
          id: (row as any).id,
          projectId: (row as any).projectId,
          firebaseUid: (row as any).firebaseUid,
          role: (row as any).role,
          displayName: (row as any).displayName,
          email: (row as any).email,
          addedBy: (row as any).addedBy,
          addedAt: toNum((row as any).addedAt),
        });
      }
    }
  }
  return collabs;
}

export function getProjectShareLinks(projectId: string): StdbShareLink[] {
  if (!connection) return [];
  const links: StdbShareLink[] = [];
  try {
    for (const row of connection.db.shareLinks.byProjectId.filter(projectId)) {
      links.push({
        id: (row as any).id,
        projectId: (row as any).projectId,
        token: (row as any).token,
        role: (row as any).role,
        createdBy: (row as any).createdBy,
        createdAt: toNum((row as any).createdAt),
        expiresAt: toNum((row as any).expiresAt),
        maxUses: (row as any).maxUses,
        useCount: (row as any).useCount,
      });
    }
  } catch {
    for (const row of connection.db.shareLinks.iter()) {
      if ((row as any).projectId === projectId) {
        links.push({
          id: (row as any).id,
          projectId: (row as any).projectId,
          token: (row as any).token,
          role: (row as any).role,
          createdBy: (row as any).createdBy,
          createdAt: toNum((row as any).createdAt),
          expiresAt: toNum((row as any).expiresAt),
          maxUses: (row as any).maxUses,
          useCount: (row as any).useCount,
        });
      }
    }
  }
  return links;
}

/** Get collaborator rows where the given user is a member (for dashboard filtering) */
export function getUserCollaborations(firebaseUid: string): StdbCollaborator[] {
  if (!connection) return [];
  const collabs: StdbCollaborator[] = [];
  try {
    for (const row of connection.db.projectCollaborators.byFirebaseUid.filter(firebaseUid)) {
      collabs.push({
        id: (row as any).id,
        projectId: (row as any).projectId,
        firebaseUid: (row as any).firebaseUid,
        role: (row as any).role,
        displayName: (row as any).displayName,
        email: (row as any).email,
        addedBy: (row as any).addedBy,
        addedAt: toNum((row as any).addedAt),
      });
    }
  } catch {
    for (const row of connection.db.projectCollaborators.iter()) {
      if ((row as any).firebaseUid === firebaseUid) {
        collabs.push({
          id: (row as any).id,
          projectId: (row as any).projectId,
          firebaseUid: (row as any).firebaseUid,
          role: (row as any).role,
          displayName: (row as any).displayName,
          email: (row as any).email,
          addedBy: (row as any).addedBy,
          addedAt: toNum((row as any).addedAt),
        });
      }
    }
  }
  return collabs;
}

/** Disconnect and clean up. */
export function disconnectSpacetimeDb() {
  if (connection) {
    connection.disconnect();
    connection = null;
    subscriptionActive = false;
    projectSubscriptionActive = false;
    subscribedProjectId = null;
    currentUid = null;
    onConnectCb = null;
    onDisconnectCb = null;
    onProjectsChangedCb = null;
    onFoldersChangedCb = null;
    onTimelineClipsChangedCb = null;
    onMediaFilesChangedCb = null;
    onEffectBlocksChangedCb = null;
    onPresenceChangedCb = null;
    onLockChangedCb = null;
    onCollaboratorsChangedCb = null;
    onShareLinksChangedCb = null;
  }
}

// ─── Query helpers ───────────────────────────────────────────────────

/** Get all projects from the SDK cache. */
export function getProjects(): StdbProject[] {
  if (!connection || !subscriptionActive) return [];
  const projects: StdbProject[] = [];
  for (const row of connection.db.projects.iter()) {
    projects.push(projectRowToStore(row));
  }
  return projects;
}

/** Get all folders from the SDK cache. */
export function getFolders(): StdbFolder[] {
  if (!connection || !subscriptionActive) return [];
  const folders: StdbFolder[] = [];
  for (const row of connection.db.folders.iter()) {
    folders.push(folderRowToStore(row));
  }
  return folders;
}

/** Get all assets for a project from the SDK cache. */
export function getProjectAssets(projectId: string): StdbAsset[] {
  if (!connection || !subscriptionActive) return [];
  const assets: StdbAsset[] = [];
  try {
    for (const row of connection.db.assets.byProjectId.filter(projectId)) {
      assets.push(assetRowToStore(row));
    }
  } catch {
    // Fall back to full iter if index unavailable
    for (const row of connection.db.assets.iter()) {
      if (row.projectId === projectId) {
        assets.push(assetRowToStore(row));
      }
    }
  }
  return assets;
}
