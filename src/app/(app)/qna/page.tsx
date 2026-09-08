'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Matches the codes route.ts's onError returns — never render error.message directly, it's a
// fixed code, not user-facing text. 'invalid_api_key' is its own case (not just "unknown") so a
// later "enter your own API key" feature has a stable signal to hook into.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_api_key: "AI features aren't configured with a valid API key yet. Please contact the site owner.",
  unknown: 'Something went wrong generating a response. Please try again.',
};

export default function QnaPage() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: '/api/qna' }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Ask anything about your career, based on everything in your objects.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm',
                m.role === 'user' ? 'bg-[#2da44e] text-white' : 'bg-muted text-foreground'
              )}
            >
              {m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-2 text-sm text-red-600">
          {ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES.unknown}
          <Button type="button" variant="link" onClick={() => regenerate()}>
            Retry
          </Button>
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a career question…" className="flex-1" />
        <Button type="submit" disabled={status === 'streaming' || status === 'submitted'}>
          Send
        </Button>
      </form>
    </div>
  );
}
