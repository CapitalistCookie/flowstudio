'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { StarButton } from '@/components/StarButton';
import { FolderCard } from '@/components/FolderCard';
import { CreateFolderDialog } from '@/components/CreateFolderDialog';
import { MoveToFolderDialog } from '@/components/MoveToFolderDialog';
import { useProjectStore } from '@/hooks/useStores';
import { getConnection } from '@/lib/spacetimedb';
import { ProjectStatus } from '@flowstudio/shared';
import {
  Search,
  Grid3X3,
  List,
  FolderOpen,
  FolderPlus,
  Trash2,
  Copy,
  Pencil,
  Star,
  ArrowLeft,
  MoveRight,
  Video,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'starred' | ProjectStatus;

const STATUS_BADGE: Record<string, { variant: 'default' | 'success' | 'warning' | 'error'; label: string }> = {
  [ProjectStatus.CREATED]: { variant: 'default', label: 'Created' },
  [ProjectStatus.UPLOADING]: { variant: 'warning', label: 'Uploading' },
  [ProjectStatus.PROCESSING]: { variant: 'warning', label: 'Processing' },
  [ProjectStatus.READY]: { variant: 'success', label: 'Ready' },
  [ProjectStatus.FAILED]: { variant: 'error', label: 'Failed' },
};

export default function ProjectsPage() {
  const projects = useProjectStore((s) => s.projects);
  const folders = useProjectStore((s) => s.folders);
  const activeFolderId = useProjectStore((s) => s.activeFolderId);
  const setActiveFolderId = useProjectStore((s) => s.setActiveFolderId);
  const toggleStar = useProjectStore((s) => s.toggleStar);
  const moveProjectToFolder = useProjectStore((s) => s.moveProjectToFolder);
  const loading = useProjectStore((s) => s.loading);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [moveDialogProject, setMoveDialogProject] = useState<string | null>(null);

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter === 'starred' && !p.starred) return false;
        if (statusFilter !== 'all' && statusFilter !== 'starred' && p.status !== statusFilter) return false;
        if (activeFolderId && p.folderId !== activeFolderId) return false;
        if (!activeFolderId && statusFilter !== 'starred' && p.folderId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, search, statusFilter, activeFolderId]);

  const folderProjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      if (p.folderId) {
        counts[p.folderId] = (counts[p.folderId] ?? 0) + 1;
      }
    }
    return counts;
  }, [projects]);

  const handleToggleStar = async (projectId: string) => {
    toggleStar(projectId);
    try {
      await getConnection().reducers.toggleProjectStar({ projectId });
    } catch {
      toggleStar(projectId); // revert on failure
    }
  };

  const handleMoveToFolder = async (projectId: string, folderId: string) => {
    const prev = projects.find((p) => p.id === projectId)?.folderId ?? '';
    moveProjectToFolder(projectId, folderId);
    try {
      await getConnection().reducers.moveProjectToFolder({ projectId, folderId });
    } catch {
      moveProjectToFolder(projectId, prev);
    }
  };

  const handleCreateFolder = async (name: string, color: string) => {
    try {
      await getConnection().reducers.createFolder({ name, ownerId: '', color, sortOrder: folders.length });
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await getConnection().reducers.deleteFolder({ folderId });
      if (activeFolderId === folderId) setActiveFolderId(null);
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const newName = prompt('Rename folder:', folder.name);
    if (!newName?.trim()) return;
    try {
      await getConnection().reducers.renameFolder({ folderId, name: newName.trim() });
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  };

  const contextMenuItems = (projectId: string) => [
    {
      label: 'Open',
      icon: <FolderOpen className="h-4 w-4" />,
      onClick: () => router.push(`/project/${projectId}`),
    },
    {
      label: projects.find((p) => p.id === projectId)?.starred ? 'Unstar' : 'Star',
      icon: <Star className="h-4 w-4" />,
      onClick: () => handleToggleStar(projectId),
    },
    {
      label: 'Move to Folder',
      icon: <MoveRight className="h-4 w-4" />,
      onClick: () => setMoveDialogProject(projectId),
    },
    {
      label: 'Rename',
      icon: <Pencil className="h-4 w-4" />,
      onClick: () => {/* TODO */},
    },
    {
      label: 'Duplicate',
      icon: <Copy className="h-4 w-4" />,
      onClick: () => {/* TODO */},
    },
    { label: '', onClick: () => {}, separator: true },
    {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => {/* TODO */},
      destructive: true,
    },
  ];

  const moveTarget = projects.find((p) => p.id === moveDialogProject);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {activeFolderId && (
              <button
                onClick={() => setActiveFolderId(null)}
                className="flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-primary)' }}
              >
                <ArrowLeft className="h-4 w-4" />
                Projects
              </button>
            )}
            <h2 className="text-2xl font-bold">
              {activeFolder ? activeFolder.name : 'Projects'}
            </h2>
          </div>
          <Button onClick={() => setCreateFolderOpen(true)} variant="outline" className="gap-2">
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: 'var(--color-muted)' }}
            />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'starred', ProjectStatus.READY, ProjectStatus.PROCESSING, ProjectStatus.FAILED] as StatusFilter[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className="px-3 py-1.5 rounded-xl text-xs transition-all duration-200 flex items-center gap-1"
                  style={{
                    backgroundColor:
                      statusFilter === status
                        ? 'rgba(245, 166, 35, 0.12)'
                        : 'transparent',
                    color:
                      statusFilter === status
                        ? 'var(--color-primary)'
                        : 'var(--color-muted)',
                    backdropFilter: statusFilter === status ? 'blur(8px)' : undefined,
                  }}
                >
                  {status === 'starred' && <Star className="h-3 w-3" />}
                  {status === 'all' ? 'All' : status === 'starred' ? 'Starred' : STATUS_BADGE[status]?.label ?? status}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto glass-subtle rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className="p-1.5 rounded-lg transition-colors"
              style={{
                color: viewMode === 'grid' ? 'var(--color-primary)' : 'var(--color-muted)',
                backgroundColor: viewMode === 'grid' ? 'rgba(255,255,255,0.5)' : 'transparent',
              }}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="p-1.5 rounded-lg transition-colors"
              style={{
                color: viewMode === 'list' ? 'var(--color-primary)' : 'var(--color-muted)',
                backgroundColor: viewMode === 'list' ? 'rgba(255,255,255,0.5)' : 'transparent',
              }}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Folders (at root level only) */}
        {!activeFolderId && folders.length > 0 && statusFilter !== 'starred' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {[...folders].sort((a, b) => a.sortOrder - b.sortOrder).map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                projectCount={folderProjectCounts[folder.id] ?? 0}
                onClick={() => setActiveFolderId(folder.id)}
                onRename={() => handleRenameFolder(folder.id)}
                onDelete={() => handleDeleteFolder(folder.id)}
              />
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <FolderOpen
              className="h-12 w-12 mx-auto mb-3"
              style={{ color: 'var(--color-muted)' }}
            />
            <p className="text-lg mb-1">No projects found</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {search ? 'Try a different search term' : 'Create a project from the Dashboard'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <ContextMenu key={project.id} items={contextMenuItems(project.id)}>
                <button
                  onClick={() => router.push(`/project/${project.id}`)}
                  className="w-full text-left glass-card rounded-2xl p-4 cursor-pointer relative"
                >
                  <StarButton
                    starred={project.starred}
                    onClick={() => handleToggleStar(project.id)}
                    className="absolute top-3 right-3 z-10"
                  />
                  <div
                    className="h-24 rounded-xl mb-3 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.05) 0%, rgba(26,158,143,0.05) 100%)' }}
                  >
                    <Video className="h-8 w-8" style={{ color: 'var(--color-muted)' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium truncate pr-6">{project.name}</h3>
                    <Badge variant={STATUS_BADGE[project.status]?.variant ?? 'default'}>
                      {STATUS_BADGE[project.status]?.label ?? project.status}
                    </Badge>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              </ContextMenu>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((project) => (
              <ContextMenu key={project.id} items={contextMenuItems(project.id)}>
                <button
                  onClick={() => router.push(`/project/${project.id}`)}
                  className="w-full flex items-center gap-4 glass rounded-xl px-4 py-3 cursor-pointer"
                >
                  <StarButton
                    starred={project.starred}
                    onClick={() => handleToggleStar(project.id)}
                  />
                  <FolderOpen className="h-5 w-5 shrink-0" style={{ color: 'var(--color-muted)' }} />
                  <span className="flex-1 text-left font-medium truncate">{project.name}</span>
                  <Badge variant={STATUS_BADGE[project.status]?.variant ?? 'default'}>
                    {STATUS_BADGE[project.status]?.label ?? project.status}
                  </Badge>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              </ContextMenu>
            ))}
          </div>
        )}

        <CreateFolderDialog
          open={createFolderOpen}
          onClose={() => setCreateFolderOpen(false)}
          onCreate={handleCreateFolder}
        />

        {moveDialogProject && moveTarget && (
          <MoveToFolderDialog
            open={!!moveDialogProject}
            onClose={() => setMoveDialogProject(null)}
            folders={folders}
            currentFolderId={moveTarget.folderId}
            onMove={(folderId) => handleMoveToFolder(moveDialogProject, folderId)}
          />
        )}
      </main>
    </div>
  );
}
