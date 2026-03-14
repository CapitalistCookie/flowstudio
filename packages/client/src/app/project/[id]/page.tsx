'use client';

import { use } from 'react';
import { Header } from '../../../components/Header.js';
import { PipelineStatus } from '../../../components/PipelineStatus.js';
import { useProjectTasks } from '../../../lib/hooks.js';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const { tasks, loading } = useProjectTasks(id);

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="text-sm mb-4 inline-block"
            style={{ color: 'var(--color-primary)' }}
          >
            &larr; Back to Projects
          </button>
          <h2 className="text-2xl font-bold">Project: {id}</h2>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Processing Progress
            </span>
            <span className="text-sm font-semibold">{progress}%</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: 'var(--color-primary)',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline status */}
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            {loading ? (
              <p style={{ color: 'var(--color-muted)' }}>Loading tasks...</p>
            ) : (
              <PipelineStatus tasks={tasks} />
            )}
          </div>

          {/* Upload section */}
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: 'var(--color-muted)' }}
            >
              Upload
            </h3>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center"
              style={{ borderColor: 'var(--color-muted)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Drag &amp; drop a video file or click to browse
              </p>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                id="video-upload"
              />
              <label
                htmlFor="video-upload"
                className="mt-3 inline-block px-4 py-2 rounded text-sm font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-text)',
                }}
              >
                Select Video
              </label>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
