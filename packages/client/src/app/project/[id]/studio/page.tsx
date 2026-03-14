'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import { AssetPanel } from '@/components/studio/AssetPanel';
import { VideoPreview } from '@/components/studio/VideoPreview';
import { PropertiesPanel } from '@/components/studio/PropertiesPanel';
import { Timeline } from '@/components/studio/Timeline';
import { PreviewModal } from '@/components/studio/PreviewModal';
import { useProjectStore, useUIStore } from '@/hooks/useStores';
import { useStudioShortcuts } from '@/components/studio/useStudioShortcuts';
import { ArrowLeft } from 'lucide-react';

interface StudioPageProps {
  params: Promise<{ id: string }>;
}

export default function StudioPage({ params }: StudioPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const previewFullscreen = useUIStore((s) => s.previewFullscreen);
  const togglePreviewFullscreen = useUIStore((s) => s.togglePreviewFullscreen);
  const assetPanelCollapsed = useUIStore((s) => s.assetPanelCollapsed);
  const propertiesPanelCollapsed = useUIStore((s) => s.propertiesPanelCollapsed);

  useStudioShortcuts();

  useEffect(() => {
    setActiveProject(id);
    return () => setActiveProject(null);
  }, [id, setActiveProject]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Compact studio header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${id}`)}
            className="flex items-center gap-1 text-sm"
            style={{ color: 'var(--color-primary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-sm font-semibold">Studio</span>
        </div>
      </div>

      {/* Main studio area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup orientation="vertical">
          {/* Top area: assets + preview + properties */}
          <Panel defaultSize={60} minSize={30}>
            <PanelGroup orientation="horizontal">
              {/* Asset browser */}
              {!assetPanelCollapsed && (
                <>
                  <Panel defaultSize={20} minSize={15} maxSize={35}>
                    <AssetPanel />
                  </Panel>
                  <PanelResizeHandle className="w-1 hover:bg-[var(--color-primary)]/30 transition-colors" />
                </>
              )}

              {/* Video preview */}
              <Panel defaultSize={assetPanelCollapsed && propertiesPanelCollapsed ? 100 : 55} minSize={30}>
                <VideoPreview />
              </Panel>

              {/* Properties */}
              {!propertiesPanelCollapsed && (
                <>
                  <PanelResizeHandle className="w-1 hover:bg-[var(--color-primary)]/30 transition-colors" />
                  <Panel defaultSize={25} minSize={15} maxSize={40}>
                    <PropertiesPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Resize handle between preview and timeline */}
          <PanelResizeHandle className="h-1 hover:bg-[var(--color-primary)]/30 transition-colors" />

          {/* Timeline */}
          <Panel defaultSize={40} minSize={20} maxSize={70}>
            <Timeline />
          </Panel>
        </PanelGroup>
      </div>

      {/* Preview modal */}
      {previewFullscreen && (
        <PreviewModal onClose={togglePreviewFullscreen} />
      )}
    </div>
  );
}
