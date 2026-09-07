import { streamText, convertToModelMessages, LoadAPIKeyError, APICallError, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getCurrentUserId } from '@/lib/session';
import { listObjectsForUser } from '@/lib/objects/queries';
import { getProfile } from '@/lib/profile';
import { buildCareerContext } from '@/lib/ai/context';

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const { messages }: { messages: UIMessage[] } = await request.json();

  const [objects, profile] = await Promise.all([listObjectsForUser(userId), getProfile(userId)]);

  const context = buildCareerContext(objects, profile);

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are a career advisor. Use the candidate's career context below to answer questions.\n\n${context}`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    // 'invalid_api_key' covers both a missing key (LoadAPIKeyError, checked before any request is
    // sent) and a present-but-wrong key (APICallError with a 401 from OpenAI itself) — lets the UI
    // tell the two apart from every other failure (and, later, prompt for a user-supplied key).
    // Only ever forward this fixed code, never the raw error, to the client.
    onError: (error) => {
      console.error('Q&A stream error:', error);
      const isApiKeyError =
        LoadAPIKeyError.isInstance(error) || (APICallError.isInstance(error) && error.statusCode === 401);
      return isApiKeyError ? 'invalid_api_key' : 'unknown';
    },
  });
}
