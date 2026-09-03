import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { HistoryTab } from './HistoryTab';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
import Link from 'next/link';
import styles from './ResumeView.module.css';

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
    <div>
      <div className={styles.header}>
        <div>
          <h1>{resume.name}</h1>
          <p className={styles.meta}>edited {resume.createdAt.toISOString().slice(0, 10)}</p>
        </div>
        <div className={styles.actions}>
          <Link href={`/resumes/${resume.id}/fork`} className={styles.buttonOutline}>
            Fork
          </Link>
          <Link href={`/resumes/${resume.id}/edit`} className={styles.buttonPrimary}>
            Edit
          </Link>
        </div>
      </div>

      <nav className={styles.tabs}>
        <Link href={`/resumes/${resume.id}?tab=resume`} className={tab === 'resume' ? styles.tabActive : styles.tab}>
          Resume
        </Link>
        <Link href={`/resumes/${resume.id}?tab=history`} className={tab === 'history' ? styles.tabActive : styles.tab}>
          History
        </Link>
        <span className={styles.tab} title="Coming later — per-resume AI chat, not in Spike 1">
          Chat
        </span>
      </nav>

      {tab === 'resume' &&
        resume.sections.map((section) => (
          <div key={section.id}>
            <h2>{section.sectionType}</h2>
            <ul className={styles.section}>
              {section.items.map((item) => (
                <li key={item.id}>
                  <ObjectVersionChip type={item.objectVersion.type as ObjectType} version={item.objectVersion} />
                </li>
              ))}
            </ul>
          </div>
        ))}

      {tab === 'history' && <HistoryTab userId={userId} rootVersionId={resume.rootVersionId} currentId={resume.id} />}
    </div>
  );
}
