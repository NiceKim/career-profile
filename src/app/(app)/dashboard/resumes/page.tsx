import { getCurrentUserId } from '@/lib/session';
import { getResumeForest } from '@/lib/resumes/queries';
import Link from 'next/link';
import styles from './ResumeDashboard.module.css';

type Tree = Awaited<ReturnType<typeof getResumeForest>>[number];

// Recurses to arbitrary depth — `forest` is already a flat list of every tree with a
// forkedFromRootVersionId link, so a fork-of-a-fork just keeps matching one level deeper.
function ResumeTreeRow({ tree, forest, depth = 0 }: { tree: Tree; forest: Tree[]; depth?: number }) {
  const children = forest.filter((t) => t.forkedFromRootVersionId === tree.rootVersionId);
  return (
    <li style={{ marginLeft: depth * 24 }}>
      {/* Whole row is one link — not just the name — so clicking anywhere on it
          (the fork badge, the edited date) routes to the resume, not just the name text. */}
      <Link href={`/resumes/${tree.headVersionId}`} className={styles.row}>
        <span>
          {depth > 0 ? '↳ ' : '📄 '}
          <span className={styles.name}>{tree.name}</span>
          <span className={styles.meta}>edited {tree.headCreatedAt.toISOString().slice(0, 10)}</span>
        </span>
        {depth > 0 && <span className={styles.forkBadge}>fork</span>}
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <ResumeTreeRow key={child.rootVersionId} tree={child} forest={forest} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function ResumeDashboardPage() {
  const userId = await getCurrentUserId();
  const forest = await getResumeForest(userId);
  const roots = forest.filter((t) => !t.forkedFromRootVersionId);

  return (
    <div>
      <h1>My Resumes</h1>
      <ul className={styles.list}>
        {roots.map((tree) => (
          <ResumeTreeRow key={tree.rootVersionId} tree={tree} forest={forest} />
        ))}
      </ul>
      <Link href="/resumes/new" className={styles.newButton}>
        + New resume
      </Link>
    </div>
  );
}
