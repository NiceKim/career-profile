'use client';

import { useRouter } from 'next/navigation';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
import { getIdentityLabel } from '@/lib/objects/fieldConfig';
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

// How many recent versions to show before you have to open "→" for the rest.
// 4 = exactly 2 full rows at the 2-column chip grid width.
const CHIP_LIMIT = 4;

type DashboardEntry = {
  rootVersionId: string;
  type: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    body: string;
    fields: unknown;
    createdAt: string | Date;
    tags: string[];
    usedInResumeNames: string[];
  }>;
};

export function ObjectDashboardClient({
  dashboard,
  allTags,
  searchTags,
}: {
  dashboard: DashboardEntry[];
  allTags: string[];
  searchTags?: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div>
      <h1>Objects</h1>

      <form>
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
            <div className={styles.sectionHeader}>
              <h2>{type}</h2>
              <ObjectPickerModal type={type} onPick={refresh} triggerLabel={`+ New ${type}`} />
            </div>
            <div className={styles.entriesGrid}>
              {entries.map((entry) => {
                const root = entry.versions[0];
                // Newest first (left-to-right): reverse the ascending list, then take the recent window.
                const shown = [...entry.versions].reverse().slice(0, CHIP_LIMIT);
                return (
                  <div key={entry.rootVersionId} className={styles.card}>
                    <div className={styles.caption}>{getIdentityLabel(type, root.fields)}</div>
                    <div className={styles.versionRow}>
                      {shown.map((v) => (
                        <ObjectVersionChip
                          key={v.id}
                          type={type}
                          version={v}
                          editTrigger={
                            <ObjectPickerModal type={type} prefillFrom={v} onPick={refresh} triggerLabel="✎" />
                          }
                        />
                      ))}
                      {entry.versions.length > CHIP_LIMIT && (
                        <div className={styles.moreChip}>
                          <ObjectPickerModal
                            type={type}
                            editingRootVersionId={entry.rootVersionId}
                            onPick={refresh}
                            triggerLabel="→"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
