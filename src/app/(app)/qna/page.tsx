'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {messages.length === 0 && <p>Ask anything about your career, based on everything in your objects.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ display: 'inline-block', borderRadius: 12, padding: '8px 12px', whiteSpace: 'pre-wrap' }}>
              {m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p style={{ color: 'crimson' }}>
          {ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES.unknown}{' '}
          <button type="button" onClick={() => regenerate()}>
            Retry
          </button>
        </p>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a career question…"
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={status === 'streaming' || status === 'submitted'}>
          Send
        </button>
      </form>
    </div>
  );
}
