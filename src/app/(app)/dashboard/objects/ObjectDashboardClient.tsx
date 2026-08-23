'use client';

import { useRouter } from 'next/navigation';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import type { ObjectType } from '@/lib/objects/schemas';
import styles from './ObjectDashboardClient.module.css';

const TYPES: ObjectType[] = [
  'WORK_EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'SUMMARY',
  'PROJECT',
  'CERTIFICATION',
  'EXTRACURRICULAR',
];

type DashboardEntry = {
  rootVersionId: string;
  type: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    body: string;
    tags: string[];
    usedInResumeNames: string[];
  }>;
};

export function ObjectDashboardClient({
  dashboard,
  allTags,
  searchType,
  searchTags,
}: {
  dashboard: DashboardEntry[];
  allTags: string[];
  searchType?: string;
  searchTags?: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div>
      <h1>Objects</h1>

      <form>
        <select name="type" defaultValue={searchType ?? ''}>
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input name="tags" defaultValue={searchTags ?? ''} placeholder="Tags, comma-separated" list="known-tags" />
        <datalist id="known-tags">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="submit">Filter</button>
      </form>

      {TYPES.map((type) => {
        const entries = dashboard.filter((e) => e.type === type);
        return (
          <section key={type}>
            <h2>{type}</h2>
            <ObjectPickerModal type={type} onPick={refresh} triggerLabel={`+ New ${type}`} />
            {entries.map((entry) => {
              const latest = entry.versions[entry.versions.length - 1];
              return (
                <div key={entry.rootVersionId} className={styles.card}>
                  <div className={styles.caption}>{latest.body.slice(0, 40)}</div>
                  <div className={styles.versionRow}>
                    {entry.versions.map((v) => (
                      <div
                        key={v.id}
                        className={v.id === latest.id ? styles.chipActive : styles.chip}
                        title={v.tags.length > 0 ? `tags: ${v.tags.join(', ')}` : undefined}
                      >
                        v{v.versionNumber}: {v.body.slice(0, 30)}
                        <div className={styles.usedIn}>
                          {v.usedInResumeNames.length > 0 ? v.usedInResumeNames.join(', ') : 'not used'}
                        </div>
                      </div>
                    ))}
                    <div className={styles.moreChip}>
                      <ObjectPickerModal
                        type={type}
                        editingRootVersionId={entry.rootVersionId}
                        onPick={refresh}
                        triggerLabel="→"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
