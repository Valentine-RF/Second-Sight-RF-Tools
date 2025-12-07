import { create } from 'zustand';

/**
 * Signal capture metadata
 */
export interface SignalCapture {
  id: number;
  name: string;
  description: string | null;
  datatype: string | null;
  sampleRate: number | null;
  hardware: string | null;
  author: string | null;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  createdAt: Date;
}

/**
 * Annotation for time-frequency region
 */
export interface Annotation {
  id: number;
  captureId: number;
  sampleStart: number;
  sampleCount: number;
  freqLowerEdge: number | null;
  freqUpperEdge: number | null;
  label: string | null;
  modulationType: string | null;
  confidence: number | null;
  estimatedSNR: number | null;
  estimatedCFO: number | null;
  estimatedBaud: number | null;
  color: string;
}

/**
 * Time-frequency selection bounds
 */
export interface Selection {
  sampleStart: number;
  sampleEnd: number;
  freqLowerHz: number;
  freqUpperHz: number;
}

/**
 * Viewport state for timeline navigation
 */
export interface Viewport {
  sampleStart: number;
  sampleEnd: number;
}

/**
 * Active tab in analysis dock
 */
export type AnalysisTab = 'spectrum' | 'constellation' | 'cyclostationary' | 'hex';

/**
 * Colormap options for spectrogram
 */
export type Colormap = 'viridis' | 'turbo' | 'plasma' | 'inferno';

interface SignalStore {
  // Current signal capture
  currentCapture: SignalCapture | null;
  setCurrentCapture: (capture: SignalCapture | null) => void;

  // Annotations
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: number, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: number) => void;

  // Selection state
  selection: Selection | null;
  setSelection: (selection: Selection | null) => void;

  // Viewport state for timeline
  viewport: Viewport | null;
  setViewport: (viewport: Viewport) => void;

  // UI state
  activeTab: AnalysisTab;
  setActiveTab: (tab: AnalysisTab) => void;

  // Visualization settings
  colormap: Colormap;
  setColormap: (colormap: Colormap) => void;

  minColorLevel: number;
  maxColorLevel: number;
  setColorLevels: (min: number, max: number) => void;

  // Analysis dock collapsed state
  isDockCollapsed: boolean;
  setDockCollapsed: (collapsed: boolean) => void;
}

/**
 * Global state store for forensic signal processing application
 * Uses Zustand for lightweight, performant state management
 * 
 * IMPORTANT: High-frequency data (FFT, IQ samples) should NOT be stored here.
 * Use useRef in components for high-frequency data to avoid re-renders.
 */
export const useSignalStore = create<SignalStore>((set) => ({
  // Current capture
  currentCapture: null,
  setCurrentCapture: (capture) => set({ currentCapture: capture }),

  // Annotations
  annotations: [],
  setAnnotations: (annotations) => set({ annotations }),
  addAnnotation: (annotation) => set((state) => ({
    annotations: [...state.annotations, annotation]
  })),
  updateAnnotation: (id, updates) => set((state) => ({
    annotations: state.annotations.map((ann) =>
      ann.id === id ? { ...ann, ...updates } : ann
    )
  })),
  removeAnnotation: (id) => set((state) => ({
    annotations: state.annotations.filter((ann) => ann.id !== id)
  })),

  // Selection
  selection: null,
  setSelection: (selection) => set({ selection }),

  // Viewport
  viewport: null,
  setViewport: (viewport) => set({ viewport }),

  // UI state
  activeTab: 'spectrum',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Visualization settings
  colormap: 'viridis',
  setColormap: (colormap) => set({ colormap }),

  minColorLevel: 0,
  maxColorLevel: 100,
  setColorLevels: (min, max) => set({ minColorLevel: min, maxColorLevel: max }),

  // Analysis dock
  isDockCollapsed: false,
  setDockCollapsed: (collapsed) => set({ isDockCollapsed: collapsed }),
}));
