'use client';

import { useState } from 'react';
import { Header } from '../components/Header.js';
import { ProjectCard } from '../components/ProjectCard.js';
import { CreateProjectDialog } from '../components/CreateProjectDialog.js';
import { useProjects } from '../lib/hooks.js';

export default function DashboardPage() {
  const { projects, loading } = useProjects();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleProjectClick = (id: string) => {
    window.location.href = `/project/${id}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Projects</h2>
          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text)',
            }}
          >
            + New Project
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-muted)' }}>Loading projects...</p>
        ) : projects.length === 0 ? (
          <div
            className="rounded-lg p-12 text-center"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
              Create your first project to get started
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-text)',
              }}
            >
              + New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
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
