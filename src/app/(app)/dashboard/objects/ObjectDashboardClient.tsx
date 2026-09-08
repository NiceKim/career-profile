'use client';

import { useRouter } from 'next/navigation';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
import { getIdentityLabel } from '@/lib/objects/fieldConfig';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-col gap-8">
      <h1 className="mb-0 text-2xl font-semibold tracking-tight text-foreground">Objects</h1>

      <form className="flex max-w-none flex-row gap-2 mb-0">
        <Input name="tags" defaultValue={searchTags ?? ''} placeholder="Tags, comma-separated" list="known-tags" className="max-w-xs" />
        <datalist id="known-tags">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {TYPES.map((type) => {
        const entries = dashboard.filter((e) => e.type === type);
        return (
          <section key={type} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="my-0 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{type}</h2>
              <ObjectPickerModal type={type} onPick={refresh} triggerLabel={`+ New ${type}`} />
            </div>
            <div className="flex flex-col gap-4">
              {entries.map((entry) => {
                const root = entry.versions[0];
                // Newest first (left-to-right): reverse the ascending list, then take the recent window.
                const shown = [...entry.versions].reverse().slice(0, CHIP_LIMIT);
                return (
                  <div key={entry.rootVersionId} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 text-sm text-muted-foreground">{getIdentityLabel(type, root.fields)}</div>
                    <div className="grid grid-cols-2 items-start gap-3">
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
                        <ObjectPickerModal
                          type={type}
                          editingRootVersionId={entry.rootVersionId}
                          onPick={refresh}
                          triggerLabel="→"
                        />
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
