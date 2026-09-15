import { getCurrentUserId } from '@/lib/session';
import { getResumeForest } from '@/lib/resumes/queries';
import Link from 'next/link';
import { GitFork, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Tree = Awaited<ReturnType<typeof getResumeForest>>[number];

// Recurses to arbitrary depth — `forest` is already a flat list of every tree with a
// forkedFromResumeId link, so a fork-of-a-fork just keeps matching one level deeper.
function ResumeTreeRow({ tree, forest, depth = 0 }: { tree: Tree; forest: Tree[]; depth?: number }) {
  const children = forest.filter((t) => t.forkedFromResumeId === tree.resumeId);
  return (
    <li style={{ marginLeft: depth * 24 }}>
      {/* Whole row is one link — not just the name — so clicking anywhere on it
          (the fork badge, the edited date) routes to the resume, not just the name text. */}
      <Link
        href={`/resumes/${tree.headVersionId}`}
        className="flex items-center justify-between gap-3 border-b border-border px-1.5 py-2 text-sm transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-1.5">
          {depth > 0 && <GitFork className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          <span className="font-medium text-foreground">{tree.name}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">edited {tree.headCreatedAt.toISOString().slice(0, 10)}</span>
        </span>
        {depth > 0 && <Badge variant="accent">fork</Badge>}
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <ResumeTreeRow key={child.resumeId} tree={child} forest={forest} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function ResumeDashboardPage() {
  const userId = await getCurrentUserId();
  const forest = await getResumeForest(userId);
  const roots = forest.filter((t) => !t.forkedFromResumeId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Resumes</h1>
      <ul className="border-t border-border">
        {roots.map((tree) => (
          <ResumeTreeRow key={tree.resumeId} tree={tree} forest={forest} />
        ))}
      </ul>
      <Button render={<Link href="/resumes/new" />} className="mt-2 self-start">
        <Plus className="size-4" /> New resume
      </Button>
    </div>
  );
}
