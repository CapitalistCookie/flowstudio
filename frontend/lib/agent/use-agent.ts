import { useState } from 'react';

export interface ToolCall {
  id: string;
  status: 'running' | 'success' | 'error';
  description: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

export function useVideoAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('idle');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const newUserMessage: Message = { role: 'user', content: input };
    
    setMessages((prev) => [...prev, newUserMessage]);
    setInput('');
    setIsLoading(true);
    setStatus('submitted');

    // Mock a response
    setTimeout(() => {
      setStatus('streaming');
      setTimeout(() => {
        const newAssistantMessage: Message = {
          role: 'assistant',
          content: 'I am a local-first editor. AI editing capabilities are currently mocked.',
          toolCalls: [
            { id: '1', status: 'success', description: 'Simulated AI action' }
          ]
        };
        setMessages((prev) => [...prev, newAssistantMessage]);
        setIsLoading(false);
        setStatus('idle');
      }, 1000);
    }, 500);
  };

  const sendQuickAction = (action: string) => {
    setInput(action);
    // Note: just setting input for this simple mock
  };

  const clearChat = () => {
    setMessages([]);
  };

  const sendMessage = async (msg: { text: string }) => {
    setInput(msg.text);
  };

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
    sendMessage
  };
}
