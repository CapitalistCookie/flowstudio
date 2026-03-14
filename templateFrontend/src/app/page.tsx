'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { ProjectCard } from '@/components/ProjectCard';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useProjectStore } from '@/hooks/useStores';
import { ProjectStatus } from '@flowstudio/shared';
import { Plus, Video, FolderOpen, Clock } from 'lucide-react';

export default function DashboardPage() {
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  const handleProjectClick = (id: string) => {
    router.push(`/project/${id}`);
  };

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  const stats = {
    total: projects.length,
    processing: projects.filter((p) => p.status === ProjectStatus.PROCESSING).length,
    ready: projects.filter((p) => p.status === ProjectStatus.READY).length,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Projects', value: stats.total, icon: FolderOpen },
            { label: 'Processing', value: stats.processing, icon: Clock },
            { label: 'Ready', value: stats.ready, icon: Video },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl p-4 flex items-center gap-4"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              <div
                className="rounded-lg p-2"
                style={{ backgroundColor: 'var(--color-primary-bg)' }}
              >
                <Icon className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Recent Projects</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/record')} className="gap-2">
              <Video className="h-4 w-4" />
              Record
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* Projects grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : recentProjects.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <FolderOpen
              className="h-12 w-12 mx-auto mb-3"
              style={{ color: 'var(--color-muted)' }}
            />
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
              Create your first project to get started
            </p>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={handleProjectClick}
              />
            ))}
          </div>
        )}

        <CreateProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </main>
    </div>
  );
}
