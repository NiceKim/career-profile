import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn().mockResolvedValue('user-1') }));
vi.mock('@/lib/objects/queries', () => ({
  listObjectsForUser: vi.fn().mockResolvedValue([
    { type: 'SKILLS', body: 'Python', fields: { category: 'Languages' } },
  ]),
}));
vi.mock('@/lib/profile', () => ({
  getProfile: vi.fn().mockResolvedValue({ fullName: 'Ada Lovelace', location: 'London' }),
}));

const { streamTextMock, toUIMessageStreamResponseMock } = vi.hoisted(() => {
  const toUIMessageStreamResponseMock = vi.fn().mockReturnValue(new Response('ok'));
  return {
    streamTextMock: vi.fn().mockReturnValue({ toUIMessageStreamResponse: toUIMessageStreamResponseMock }),
    toUIMessageStreamResponseMock,
  };
});
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: streamTextMock };
});
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn().mockReturnValue('mock-model') }));

import { LoadAPIKeyError, APICallError } from 'ai';
import { POST } from './route';

describe('POST /api/qna', () => {
  it('includes the career context as a system message and converts UI messages to model messages', async () => {
    const request = new Request('http://localhost/api/qna', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'What role fits me?' }] }],
      }),
    });

    await POST(request);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.system).toContain('Ada Lovelace');
    expect(call.system).toContain('Python');
    expect(call.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'What role fits me?' }] },
    ]);
  });

  async function getOnError() {
    const request = new Request('http://localhost/api/qna', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
      }),
    });
    await POST(request);
    return toUIMessageStreamResponseMock.mock.calls[0][0].onError;
  }

  it('flags a missing API key as invalid_api_key, without leaking the raw message', async () => {
    const onError = await getOnError();
    const code = onError(new LoadAPIKeyError({ message: 'OPENAI_API_KEY environment variable is missing.' }));
    expect(code).toBe('invalid_api_key');
  });

  it('flags a 401 from the provider as invalid_api_key too (present but wrong key)', async () => {
    const onError = await getOnError();
    const code = onError(
      new APICallError({
        message: 'Unauthorized',
        url: 'https://api.openai.com/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 401,
      })
    );
    expect(code).toBe('invalid_api_key');
  });

  it('flags any other error as unknown, without leaking details', async () => {
    const onError = await getOnError();
    const code = onError(new Error('some internal detail that should never reach the client'));
    expect(code).toBe('unknown');
  });
});
