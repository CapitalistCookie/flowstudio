'use client';

import { ProjectStatus } from '@flowstudio/shared';

interface ProjectCardProject {
  id: string;
  name: string;
  status: ProjectStatus | string;
  createdAt: number;
}

interface ProjectCardProps {
  project: ProjectCardProject;
  onClick: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  [ProjectStatus.CREATED]: 'var(--color-muted)',
  [ProjectStatus.UPLOADING]: 'var(--color-warning)',
  [ProjectStatus.PROCESSING]: 'var(--color-primary)',
  [ProjectStatus.READY]: 'var(--color-success)',
  [ProjectStatus.FAILED]: 'var(--color-error)',
};

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const statusColor = STATUS_COLORS[project.status] ?? 'var(--color-muted)';

  return (
    <button
      onClick={() => onClick(project.id)}
      className="w-full text-left rounded-lg p-4 border transition-colors hover:border-opacity-50 cursor-pointer"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-surface)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg">{project.name}</h3>
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{ backgroundColor: statusColor, color: 'var(--color-text)' }}
        >
          {project.status}
        </span>
      </div>
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Created {new Date(project.createdAt).toLocaleDateString()}
      </p>
    </button>
  );
}
