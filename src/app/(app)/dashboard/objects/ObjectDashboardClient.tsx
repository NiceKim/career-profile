'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectHistoryModal } from '@/components/ObjectHistoryModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
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

// How many variation cards to show before you have to open "See all variations" for
// the rest. 4 = exactly 2 full rows at the 2-column chip grid width.
const VARIATION_LIMIT = 4;

type DashboardEntry = {
  objectId: string;
  type: string;
  variations: Array<{
    objectVariationId: string;
    tags: string[];
    revisions: Array<{
      id: string;
      versionNumber: number;
      body: string;
      fields: unknown;
      createdAt: string | Date;
      tags: string[];
      usedInResumeNames: string[];
    }>;
  }>;
};

function ObjectCard({ entry, type, refresh }: { entry: DashboardEntry; type: ObjectType; refresh: () => void }) {
  const [showAllVariations, setShowAllVariations] = useState(false);
  const shown = showAllVariations ? entry.variations : entry.variations.slice(0, VARIATION_LIMIT);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-2 items-start gap-3">
        {shown.map((variation) => {
          const latest = variation.revisions[variation.revisions.length - 1];
          return (
            <ObjectHistoryModal
              key={variation.objectVariationId}
              type={type}
              objectVariationId={variation.objectVariationId}
              trigger={
                <ObjectVersionChip
                  type={type}
                  version={latest}
                  editTrigger={
                    <div className="flex gap-1">
                      <ObjectPickerModal type={type} prefillFrom={latest} onPick={refresh} triggerLabel="✎" />
                      <ObjectPickerModal
                        type={type}
                        forkFrom={{
                          objectId: entry.objectId,
                          id: latest.id,
                          body: latest.body,
                          fields: latest.fields,
                          tags: latest.tags,
                          versionNumber: latest.versionNumber,
                        }}
                        onPick={refresh}
                        triggerLabel="⧉"
                      />
                    </div>
                  }
                />
              }
            />
          );
        })}
      </div>
      {entry.variations.length > VARIATION_LIMIT && !showAllVariations && (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setShowAllVariations(true)}>
          See all variations
        </Button>
      )}
    </div>
  );
}

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
              {entries.map((entry) => (
                <ObjectCard key={entry.objectId} entry={entry} type={type} refresh={refresh} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
