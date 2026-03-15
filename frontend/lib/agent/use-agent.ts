'use client';

import { useState, useCallback, useRef } from 'react';
import { fetchProjectSignals, hasMinimumSignals, type GatewaySignals } from '../services/signal-fetcher';

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_RAILTRACKS_URL ?? 'http://localhost:8000';

export interface ToolCall {
  id: string;
  status: 'running' | 'success' | 'error';
  description: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  editPlan?: EditDecision[];
}

export interface EditDecision {
  editType: string;
  sourceStartMs: number;
  sourceEndMs: number;
  outputStartMs: number;
  outputEndMs: number;
  parameters: Record<string, unknown>;
  reasoning: string;
}

export interface EditPlanVersion {
  version: number;
  plan: EditDecision[];
  feedback?: string;
  timestamp: string;
}

export function useVideoAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('idle');
  const [currentEditPlan, setCurrentEditPlan] = useState<EditDecision[]>([]);
  const [editHistory, setEditHistory] = useState<EditPlanVersion[]>([]);
  const projectIdRef = useRef<string>('');

  const setProjectId = useCallback((id: string) => {
    projectIdRef.current = id;
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const submitMessage = useCallback(
    async (directMessage?: string) => {
      const userMessage = (directMessage ?? input).trim();
      if (!userMessage) return;

      const newUserMessage: Message = { role: 'user', content: userMessage };
      setMessages((prev) => [...prev, newUserMessage]);
      setInput('');
      setIsLoading(true);
      setStatus('submitted');

      try {
        let result: { edit_plan: EditDecision[]; intent_graph?: unknown[]; narrative_plan?: unknown[] };

        if (currentEditPlan.length > 0) {
          setStatus('streaming');
          const toolCallId = crypto.randomUUID();
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                { id: toolCallId, status: 'running', description: 'Re-planning edits based on your feedback...' },
              ],
            },
          ]);

          const { fetchWithAuth } = await import('@/lib/auth/fetch-with-auth');
          const res = await fetchWithAuth(`${GATEWAY_URL}/api/v1/reprompt`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.NEXT_PUBLIC_GATEWAY_API_KEY ? { 'X-API-Key': process.env.NEXT_PUBLIC_GATEWAY_API_KEY } : {}),
            },
            body: JSON.stringify({
              project_id: projectIdRef.current || 'default',
              previous_edit_plan: currentEditPlan,
              feedback: userMessage,
            }),
          });

          if (!res.ok) {
            throw new Error(`Gateway error: ${res.status} ${await res.text()}`);
          }

          result = await res.json();

          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.toolCalls) {
              lastMsg.toolCalls = [
                { id: toolCallId, status: 'success', description: 'Edit plan revised' },
              ];
            }
            return updated;
          });
        } else {
          setStatus('streaming');
          const toolCallId = crypto.randomUUID();
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                { id: toolCallId, status: 'running', description: 'Generating initial edit plan...' },
              ],
            },
          ]);

          let signals: GatewaySignals = {
            speech_segments: [{ text: userMessage, timestampMs: 0 }],
            scene_descriptions: [],
            ui_transitions: [],
            interaction_clusters: [],
          };

          if (projectIdRef.current) {
            try {
              const realSignals = await fetchProjectSignals(projectIdRef.current);
              if (hasMinimumSignals(realSignals)) {
                signals = realSignals;
                signals.speech_segments.unshift({ text: userMessage, timestampMs: 0, isUserPrompt: true });
              }
            } catch {
              // STDB not available — fall back to text-only signals
            }
          }

          const { fetchWithAuth: fetchWithAuth2 } = await import('@/lib/auth/fetch-with-auth');
          const res = await fetchWithAuth2(`${GATEWAY_URL}/api/v1/generate-edits`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.NEXT_PUBLIC_GATEWAY_API_KEY ? { 'X-API-Key': process.env.NEXT_PUBLIC_GATEWAY_API_KEY } : {}),
            },
            body: JSON.stringify({
              project_id: projectIdRef.current || 'default',
              signals,
            }),
          });

          if (!res.ok) {
            throw new Error(`Gateway error: ${res.status} ${await res.text()}`);
          }

          result = await res.json();

          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.toolCalls) {
              lastMsg.toolCalls = [
                { id: toolCallId, status: 'success', description: `Generated ${result.edit_plan?.length ?? 0} edit decisions` },
              ];
            }
            return updated;
          });
        }

        const editPlan = result.edit_plan ?? [];
        setCurrentEditPlan(editPlan);

        const version = editHistory.length + 1;
        setEditHistory((prev) => [
          ...prev,
          { version, plan: editPlan, feedback: userMessage, timestamp: new Date().toISOString() },
        ]);

        const summary = summarizeEditPlan(editPlan, userMessage);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: summary, editPlan: editPlan },
        ]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg?.toolCalls) {
            lastMsg.toolCalls = lastMsg.toolCalls.map((tc) => ({
              ...tc,
              status: 'error' as const,
              description: `Failed: ${errorMsg}`,
            }));
          }
          return [
            ...updated,
            { role: 'assistant', content: `Something went wrong: ${errorMsg}. Make sure the gateway is running at ${GATEWAY_URL}.` },
          ];
        });
      } finally {
        setIsLoading(false);
        setStatus('idle');
      }
    },
    [input, currentEditPlan, editHistory],
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      await submitMessage();
    },
    [submitMessage],
  );

  const sendQuickAction = useCallback(
    (action: string) => {
      setInput(action);
      submitMessage(action);
    },
    [submitMessage],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setCurrentEditPlan([]);
    setEditHistory([]);
  }, []);

  const sendMessage = useCallback(
    async (msg: { text: string }) => {
      setInput('');
      await submitMessage(msg.text);
    },
    [submitMessage],
  );

  const revertToVersion = useCallback(
    (version: number) => {
      const entry = editHistory.find((h) => h.version === version);
      if (entry) {
        setCurrentEditPlan(entry.plan);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Reverted to edit plan v${version}.`, editPlan: entry.plan },
        ]);
      }
    },
    [editHistory],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    isLoadingHistory: false,
    sendQuickAction,
    clearChat,
    status,
    sendMessage,
    currentEditPlan,
    editHistory,
    setProjectId,
    revertToVersion,
  };
}

function summarizeEditPlan(plan: EditDecision[], feedback: string): string {
  if (plan.length === 0) return 'No edit decisions were generated.';

  const editTypes = plan.reduce(
    (acc, e) => {
      acc[e.editType] = (acc[e.editType] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const typeSummary = Object.entries(editTypes)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  const totalDuration =
    plan.reduce((sum, e) => sum + (e.outputEndMs - e.outputStartMs), 0) / 1000;

  return `Here's my edit plan (${plan.length} edits: ${typeSummary}). The edited output would be ~${totalDuration.toFixed(1)}s long.\n\nYou can tell me to adjust anything — "zoom in at 0:50", "speed up the intro", "add a transition between cuts", etc.`;
}
