import { createStore } from 'zustand/vanilla';
import type { UIState, PanelId, PanelLayout } from '../types';

export interface UIStoreActions {
  setActivePanel: (panel: PanelId | null) => void;
  toggleAssetPanel: () => void;
  togglePropertiesPanel: () => void;
  setLayout: (layout: PanelLayout) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  togglePreviewFullscreen: () => void;
}

export type UIStoreType = UIState & UIStoreActions;

const DEFAULT_UI: UIState = {
  activePanel: null,
  assetPanelCollapsed: false,
  propertiesPanelCollapsed: false,
  layout: { sizes: [20, 55, 25] },
  activeModal: null,
  previewFullscreen: false,
};

export const createUIStore = () =>
  createStore<UIStoreType>((set) => ({
    ...DEFAULT_UI,

    setActivePanel: (panel) => set({ activePanel: panel }),
    toggleAssetPanel: () =>
      set((s) => ({ assetPanelCollapsed: !s.assetPanelCollapsed })),
    togglePropertiesPanel: () =>
      set((s) => ({ propertiesPanelCollapsed: !s.propertiesPanelCollapsed })),
    setLayout: (layout) => set({ layout }),
    openModal: (modalId) => set({ activeModal: modalId }),
    closeModal: () => set({ activeModal: null }),
    togglePreviewFullscreen: () =>
      set((s) => ({ previewFullscreen: !s.previewFullscreen })),
  }));
