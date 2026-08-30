import { getResumeTreeHistory } from '@/lib/resumes/queries';
import Link from 'next/link';

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
    <ul>
      {history.map((v, i) => (
        <li key={v.id}>
          <Link href={`/resumes/${v.id}`}>
            Version {i + 1} {v.id === currentId && '(current)'} — {v.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
