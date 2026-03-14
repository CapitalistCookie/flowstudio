import { createStore } from 'zustand/vanilla';
import type { SignalEntry } from '../types';

export interface SignalStoreState {
  /** All signals for the active project */
  signals: SignalEntry[];
  /** Filter by signal type */
  filterType: string | null;
  /** Filter by minimum confidence */
  filterMinConfidence: number;
  /** Currently selected signal ID */
  selectedSignalId: string | null;
}

export interface SignalStoreActions {
  setSignals: (signals: SignalEntry[]) => void;
  addSignal: (signal: SignalEntry) => void;
  setFilterType: (type: string | null) => void;
  setFilterMinConfidence: (confidence: number) => void;
  selectSignal: (id: string | null) => void;
  /** Get filtered signals */
  getFiltered: () => SignalEntry[];
  reset: () => void;
}

export type SignalStoreType = SignalStoreState & SignalStoreActions;

const DEFAULT_SIGNAL: SignalStoreState = {
  signals: [],
  filterType: null,
  filterMinConfidence: 0,
  selectedSignalId: null,
};

export const createSignalStore = () =>
  createStore<SignalStoreType>((set, get) => ({
    ...DEFAULT_SIGNAL,

    setSignals: (signals) => set({ signals }),
    addSignal: (signal) =>
      set((s) => ({ signals: [...s.signals, signal] })),
    setFilterType: (type) => set({ filterType: type }),
    setFilterMinConfidence: (confidence) =>
      set({ filterMinConfidence: confidence }),
    selectSignal: (id) => set({ selectedSignalId: id }),
    getFiltered: () => {
      const s = get();
      return s.signals.filter((sig) => {
        if (s.filterType && sig.signalType !== s.filterType) return false;
        if (sig.confidence < s.filterMinConfidence) return false;
        return true;
      });
    },
    reset: () => set(DEFAULT_SIGNAL),
  }));
