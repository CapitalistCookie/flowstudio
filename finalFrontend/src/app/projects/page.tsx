'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { useProjectStore } from '@/hooks/useStores';
import { ProjectStatus } from '@flowstudio/shared';
import {
  Search,
  Grid3X3,
  List,
  FolderOpen,
  Trash2,
  Copy,
  Pencil,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | ProjectStatus;

const STATUS_BADGE: Record<string, { variant: 'default' | 'success' | 'warning' | 'error'; label: string }> = {
  [ProjectStatus.CREATED]: { variant: 'default', label: 'Created' },
  [ProjectStatus.UPLOADING]: { variant: 'warning', label: 'Uploading' },
  [ProjectStatus.PROCESSING]: { variant: 'warning', label: 'Processing' },
  [ProjectStatus.READY]: { variant: 'success', label: 'Ready' },
  [ProjectStatus.FAILED]: { variant: 'error', label: 'Failed' },
};

export default function ProjectsPage() {
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, search, statusFilter]);

  const contextMenuItems = (projectId: string) => [
    {
      label: 'Open',
      icon: <FolderOpen className="h-4 w-4" />,
      onClick: () => router.push(`/project/${projectId}`),
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Projects</h2>
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
            {(['all', ProjectStatus.READY, ProjectStatus.PROCESSING, ProjectStatus.FAILED] as StatusFilter[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                  style={{
                    backgroundColor:
                      statusFilter === status
                        ? 'var(--color-primary-bg)'
                        : 'transparent',
                    color:
                      statusFilter === status
                        ? 'var(--color-primary)'
                        : 'var(--color-muted)',
                  }}
                >
                  {status === 'all' ? 'All' : STATUS_BADGE[status]?.label ?? status}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className="p-2 rounded-lg"
              style={{ color: viewMode === 'grid' ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="p-2 rounded-lg"
              style={{ color: viewMode === 'list' ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
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
                  className="w-full text-left rounded-xl p-4 transition-colors hover:shadow-md hover:border-primary/30 border border-transparent cursor-pointer"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                >
                  <div
                    className="h-24 rounded-lg mb-3 flex items-center justify-center"
                    style={{ backgroundColor: 'var(--color-background)' }}
                  >
                    <Video className="h-8 w-8" style={{ color: 'var(--color-muted)' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium truncate">{project.name}</h3>
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
                  className="w-full flex items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:shadow-md hover:border-primary/30 border border-transparent cursor-pointer"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                >
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
      </main>
    </div>
  );
}

function Video(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}
