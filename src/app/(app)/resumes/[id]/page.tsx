import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { HistoryTab } from './HistoryTab';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function ViewResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, id);
  const tab = tabParam ?? 'resume';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-0 text-2xl font-semibold tracking-tight text-foreground">{resume.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">edited {resume.createdAt.toISOString().slice(0, 10)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" render={<Link href={`/resumes/${resume.id}/fork`} />}>
            Fork
          </Button>
          <Button render={<Link href={`/resumes/${resume.id}/edit`} />}>Edit</Button>
        </div>
      </div>

      <nav className="mb-0 flex gap-5 border-b border-border pb-2 text-sm">
        <Link
          href={`/resumes/${resume.id}?tab=resume`}
          className={cn('transition-colors', tab === 'resume' ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          Resume
        </Link>
        <Link
          href={`/resumes/${resume.id}?tab=history`}
          className={cn('transition-colors', tab === 'history' ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          History
        </Link>
        <span className="text-muted-foreground" title="Coming later — per-resume AI chat, not in Spike 1">
          Chat
        </span>
      </nav>

      {tab === 'resume' &&
        resume.sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-2">
            <h2 className="my-0 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{section.sectionType}</h2>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-border p-3">
              {section.items.map((item) => (
                <ObjectVersionChip key={item.id} type={section.sectionType} version={item.objectRevision} />
              ))}
            </div>
          </div>
        ))}

      {tab === 'history' && (
        <HistoryTab userId={userId} resumeId={resume.resumeId} resumeName={resume.name} currentId={resume.id} />
      )}
    </div>
  );
}
