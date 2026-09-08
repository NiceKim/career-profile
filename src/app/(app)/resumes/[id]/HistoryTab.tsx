import { getResumeTreeHistory } from '@/lib/resumes/queries';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export async function HistoryTab({
  userId,
  rootVersionId,
  currentId,
}: {
  userId: string;
  rootVersionId: string;
  currentId: string;
}) {
  const history = await getResumeTreeHistory(userId, rootVersionId);

  return (
    <ul className="flex flex-col gap-1">
      {history.map((v, i) => (
        <li key={v.id}>
          <Link
            href={`/resumes/${v.id}`}
            className={cn(
              'block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
              v.id === currentId ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            Version {i + 1} {v.id === currentId && '(current)'} — {v.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
