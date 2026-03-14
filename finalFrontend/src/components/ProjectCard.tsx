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
  children?: React.ReactNode;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  [ProjectStatus.CREATED]: { bg: 'rgba(138, 135, 128, 0.12)', text: '#8A8780' },
  [ProjectStatus.UPLOADING]: { bg: 'rgba(245, 158, 11, 0.12)', text: '#D97706' },
  [ProjectStatus.PROCESSING]: { bg: 'rgba(245, 166, 35, 0.12)', text: '#D4870A' },
  [ProjectStatus.READY]: { bg: 'rgba(34, 197, 94, 0.12)', text: '#16A34A' },
  [ProjectStatus.FAILED]: { bg: 'rgba(220, 38, 38, 0.12)', text: '#DC2626' },
};

export function ProjectCard({ project, onClick, children }: ProjectCardProps) {
  const statusStyle = STATUS_COLORS[project.status] ?? { bg: 'rgba(138, 135, 128, 0.12)', text: '#8A8780' };

  return (
    <button
      onClick={() => onClick(project.id)}
      className="w-full text-left glass-card rounded-2xl p-4 cursor-pointer relative"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg">{project.name}</h3>
        <span
          className="text-xs px-2 py-1 rounded-full backdrop-blur-sm"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
        >
          {project.status}
        </span>
      </div>
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Created {new Date(project.createdAt).toLocaleDateString()}
      </p>
      {children}
    </button>
  );
}
