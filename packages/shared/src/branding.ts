export const BRANDING = {
  name: 'FlowStudio',
  tagline: 'AI-powered video editing',
  company: 'FlowStudio Inc.',
  domain: 'flowstudio.ai',
  urls: {
    app: 'https://app.flowstudio.ai',
    api: 'https://api.flowstudio.ai',
    stdb: 'wss://stdb.flowstudio.ai',
  },
  colors: {
    primary: '#6366F1',    // Indigo
    secondary: '#8B5CF6',  // Purple
    accent: '#EC4899',     // Pink
    background: '#0F172A', // Slate-900
    surface: '#1E293B',    // Slate-800
    text: '#F8FAFC',       // Slate-50
    muted: '#94A3B8',      // Slate-400
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  prefix: 'flowstudio',   // Used for infra naming (GCS buckets, Docker repos, etc.)
} as const;

export type Branding = typeof BRANDING;
