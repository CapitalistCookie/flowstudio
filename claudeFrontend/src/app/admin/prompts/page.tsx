'use client';

import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { PROMPT_REGISTRY, type WorkerType } from '@flowstudio/shared';
import {
  Play,
  Download,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Trash2,
} from 'lucide-react';

interface TestResult {
  raw: string;
  parsed: unknown;
  validationErrors: string[] | null;
  confidence: number;
  metadata: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    stopReason: string;
  };
  promptSent: { system: string; user: string };
}

interface HistoryEntry {
  id: string;
  timestamp: number;
  workerType: WorkerType;
  confidence: number;
  result: TestResult;
  systemPrompt: string;
  userTemplate: string;
  signalData: string;
}

type OutputTab = 'raw' | 'parsed' | 'sent';

const WORKER_TYPES: WorkerType[] = ['intent-graph', 'narrative-planner', 'edit-planner'];
const MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'];

// Input signal type for each worker
const WORKER_INPUT_MAP: Record<WorkerType, string> = {
  'intent-graph': 'speech_segments',
  'narrative-planner': 'intent_graph',
  'edit-planner': 'narrative_plan',
};

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('flowstudio-prompt-history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    // Omit signalData from history to avoid exceeding localStorage limits
    const slim = entries.slice(0, 20).map(e => ({ ...e, signalData: '' }));
    localStorage.setItem('flowstudio-prompt-history', JSON.stringify(slim));
  } catch {
    // localStorage full — silently fail
  }
}

export default function AdminPromptsPage() {
  const [workerType, setWorkerType] = useState<WorkerType>('intent-graph');
  const [model, setModel] = useState(MODELS[0]!);
  const [projectId, setProjectId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(PROMPT_REGISTRY['intent-graph']!.systemPrompt);
  const [userTemplate, setUserTemplate] = useState(PROMPT_REGISTRY['intent-graph']!.userTemplate);
  const [signalData, setSignalData] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);

  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outputTab, setOutputTab] = useState<OutputTab>('parsed');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  // Switch worker type → load defaults from registry
  const handleWorkerChange = useCallback((type: WorkerType) => {
    setWorkerType(type);
    const registry = PROMPT_REGISTRY[type];
    if (registry) {
      setSystemPrompt(registry.systemPrompt);
      setUserTemplate(registry.userTemplate);
      setMaxTokens(registry.defaultMaxTokens);
    }
    setResult(null);
    setError(null);
  }, []);

  // Load signal data from GCS
  const handleLoadSignals = useCallback(async () => {
    if (!projectId.trim()) return;
    setLoadingSignals(true);
    setError(null);
    try {
      const signalType = WORKER_INPUT_MAP[workerType];
      const res = await fetch(`/api/signals?projectId=${encodeURIComponent(projectId)}&type=${signalType}`, {
        headers: { 'x-admin-key': adminKey },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.details || 'Failed to load');
      setSignalData(JSON.stringify(json.data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSignals(false);
    }
  }, [projectId, workerType, adminKey]);

  // Run prompt test
  const handleRun = useCallback(async () => {
    if (!signalData.trim()) {
      setError('Signal data is required');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/prompt-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ workerType, systemPrompt, userTemplate, signalData, model, maxTokens }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.details || 'Test failed');
      setResult(json);
      setOutputTab('parsed');

      // Save to history
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        workerType,
        confidence: json.confidence,
        result: json,
        systemPrompt,
        userTemplate,
        signalData,
      };
      const updated = [entry, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workerType, systemPrompt, userTemplate, signalData, model, maxTokens, history, adminKey]);

  // Restore from history
  const handleRestoreHistory = useCallback((entry: HistoryEntry) => {
    setWorkerType(entry.workerType);
    setSystemPrompt(entry.systemPrompt);
    setUserTemplate(entry.userTemplate);
    setSignalData(entry.signalData);
    setResult(entry.result);
    setOutputTab('parsed');
    setError(null);
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 p-6 space-y-4 max-w-[1600px] mx-auto w-full">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Prompt Prototyping</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
              Edit, test, and compare LLM prompts with real project data
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
          {/* Worker type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Worker</label>
            <select
              value={workerType}
              onChange={(e) => handleWorkerChange(e.target.value as WorkerType)}
              className="glass-subtle rounded-xl px-3 py-1.5 text-sm font-mono outline-none cursor-pointer"
            >
              {WORKER_TYPES.map(t => (
                <option key={t} value={t}>{PROMPT_REGISTRY[t]!.name}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="glass-subtle rounded-xl px-3 py-1.5 text-sm font-mono outline-none cursor-pointer"
            >
              {MODELS.map(m => (
                <option key={m} value={m}>{m.replace('claude-', '').replace(/-\d+$/, '')}</option>
              ))}
            </select>
          </div>

          {/* Project ID */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Project ID</label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="e.g. abc-123"
              className="glass-subtle rounded-xl px-3 py-1.5 text-sm font-mono outline-none w-40"
            />
          </div>

          {/* Admin key */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Admin Key</label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_API_KEY"
              className="glass-subtle rounded-xl px-3 py-1.5 text-sm font-mono outline-none w-36"
            />
          </div>

          {/* Max tokens */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Max Tokens</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={256}
              max={8192}
              className="glass-subtle rounded-xl px-3 py-1.5 text-sm font-mono outline-none w-24"
            />
          </div>

          {/* Load button */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium invisible">Action</label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadSignals}
              disabled={loadingSignals || !projectId.trim()}
              className="rounded-xl"
            >
              {loadingSignals ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1.5">Load</span>
            </Button>
          </div>

          {/* Run button */}
          <div className="flex flex-col gap-1 ml-auto">
            <label className="text-xs font-medium invisible">Action</label>
            <Button
              size="sm"
              onClick={handleRun}
              disabled={loading || !signalData.trim()}
              className="rounded-xl px-5"
              style={{ backgroundColor: 'var(--flux-amber)', color: 'var(--flux-charcoal)' }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span className="ml-1.5 font-medium">{loading ? 'Running...' : 'Run'}</span>
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded-2xl p-4 border-l-4" style={{ borderLeftColor: 'var(--destructive)' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--destructive)' }}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          </div>
        )}

        {/* Main editor + output grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Editors */}
          <div className="space-y-4">
            {/* System prompt */}
            <div className="glass rounded-2xl p-4 space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={10}
                className="w-full glass-subtle rounded-xl p-3 text-sm font-mono resize-y outline-none"
                spellCheck={false}
              />
            </div>

            {/* User template */}
            <div className="glass rounded-2xl p-4 space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                User Template
              </label>
              <textarea
                value={userTemplate}
                onChange={(e) => setUserTemplate(e.target.value)}
                rows={3}
                className="w-full glass-subtle rounded-xl p-3 text-sm font-mono resize-y outline-none"
                placeholder="{{DATA}} will be replaced with signal data"
                spellCheck={false}
              />
            </div>

            {/* Signal data */}
            <div className="glass rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                  Signal Data
                </label>
                {signalData && (
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {(signalData.length / 1024).toFixed(1)}KB
                  </span>
                )}
              </div>
              <textarea
                value={signalData}
                onChange={(e) => setSignalData(e.target.value)}
                rows={12}
                className="w-full glass-subtle rounded-xl p-3 text-sm font-mono resize-y outline-none"
                placeholder="Paste JSON signal data or use Load button to fetch from GCS"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Right: Output + metadata */}
          <div className="space-y-4">
            {/* Output */}
            <div className="glass rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                  Output
                </label>
                {result && (
                  <div className="flex items-center gap-1.5">
                    {result.confidence === 1 ? (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--color-success)' }}>
                        <CheckCircle className="h-3 w-3" /> Valid
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--destructive)' }}>
                        <AlertTriangle className="h-3 w-3" /> Errors
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1">
                {(['raw', 'parsed', 'sent'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setOutputTab(tab)}
                    className="px-3 py-1 text-xs rounded-lg transition-all"
                    style={{
                      backgroundColor: outputTab === tab ? 'rgba(245,166,35,0.15)' : 'transparent',
                      color: outputTab === tab ? 'var(--flux-amber)' : 'var(--muted-foreground)',
                      fontWeight: outputTab === tab ? 500 : 400,
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="glass-subtle rounded-xl p-3 min-h-[300px] max-h-[500px] overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Waiting for response...
                  </div>
                ) : result ? (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {outputTab === 'raw' && result.raw}
                    {outputTab === 'parsed' && (
                      result.parsed
                        ? JSON.stringify(result.parsed, null, 2)
                        : `Validation failed:\n${result.validationErrors?.join('\n') ?? 'Unknown error'}`
                    )}
                    {outputTab === 'sent' && (
                      `=== SYSTEM ===\n${result.promptSent.system}\n\n=== USER ===\n${result.promptSent.user}`
                    )}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    Run a test to see output
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            {result && (
              <div className="glass rounded-2xl p-4 space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                  Metadata
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="Input" value={`${result.metadata.inputTokens.toLocaleString()} tok`} />
                  <MetricCard label="Output" value={`${result.metadata.outputTokens.toLocaleString()} tok`} />
                  <MetricCard label="Latency" value={`${(result.metadata.latencyMs / 1000).toFixed(1)}s`} />
                  <MetricCard label="Stop" value={result.metadata.stopReason} />
                </div>
              </div>
            )}

            {/* Validation errors detail */}
            {result?.validationErrors && (
              <div className="glass rounded-2xl p-4 space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--destructive)' }}>
                  Validation Errors
                </label>
                <ul className="space-y-1">
                  {result.validationErrors.map((err, i) => (
                    <li key={i} className="text-xs font-mono px-2 py-1 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                History
              </label>
              <button
                onClick={handleClearHistory}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-red-50"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => handleRestoreHistory(entry)}
                  className="glass-subtle rounded-xl px-3 py-2 text-xs flex items-center gap-2 transition-all hover:shadow-md cursor-pointer"
                >
                  <Clock className="h-3 w-3" style={{ color: 'var(--muted-foreground)' }} />
                  <span className="font-mono">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: 'var(--flux-amber)' }}>{PROMPT_REGISTRY[entry.workerType]?.name}</span>
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      backgroundColor: entry.confidence === 1 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      color: entry.confidence === 1 ? 'var(--color-success)' : 'var(--destructive)',
                    }}
                  >
                    {entry.confidence.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-subtle rounded-xl px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{label}</div>
      <div className="text-sm font-mono font-medium mt-0.5">{value}</div>
    </div>
  );
}
