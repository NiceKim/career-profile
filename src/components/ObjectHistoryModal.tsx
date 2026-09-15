'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getObjectHistoryAction, getObjectVariationUsageAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { ObjectVersionChip } from './ObjectVersionChip';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type HistoryEntry = {
  id: string;
  versionNumber: number;
  body: string;
  fields: unknown;
  tags: string[];
  createdAt: string | Date;
  usedInResumeNames: string[];
};

type UsageEntry = {
  resumeName: string;
  resumeRevisionId: string;
  versionNumber: number;
};

type Tab = 'history' | 'usedIn';

// Read-only browsing for one variation: click the chip to see its version history as
// a list (version #, edit date), drill into a version's actual content, or switch to
// a "Used In" tab listing every resume using any revision of this variation and which
// version each one references. Separate from ObjectPickerModal, which is about
// picking/editing an object for use elsewhere, not just looking at what's there.
export function ObjectHistoryModal({
  type,
  objectVariationId,
  trigger,
  // When opened from a resume's content, marks which revision that resume is actually
  // using — opens straight to it, and flags it in the history list.
  highlightRevisionId,
}: {
  type: ObjectType;
  objectVariationId: string;
  trigger: React.ReactNode;
  highlightRevisionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('history');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [usage, setUsage] = useState<UsageEntry[] | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    const result = await getObjectHistoryAction(objectVariationId);
    setHistory(result);
    setTab('history');
    const highlightIndex = highlightRevisionId ? result.findIndex((v) => v.id === highlightRevisionId) : -1;
    setDetailIndex(highlightIndex === -1 ? null : highlightIndex);
    setUsage(null);
  }

  async function showUsedIn() {
    if (!usage) setUsage(await getObjectVariationUsageAction(objectVariationId));
    setTab('usedIn');
  }

  const selected = detailIndex !== null ? history[detailIndex] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleOpenChange(true)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleOpenChange(true)}
        className="cursor-pointer"
      >
        {trigger}
      </div>
      <DialogContent>
        <DialogTitle>{tab === 'usedIn' ? 'Used In' : 'Version History'}</DialogTitle>
        <div className="mt-3 mb-1 flex gap-4 border-b border-border text-sm">
          <button
            type="button"
            onClick={() => setTab('history')}
            className={cn('pb-2', tab === 'history' ? 'border-b-2 border-foreground font-medium text-foreground' : 'text-muted-foreground')}
          >
            History
          </button>
          <button
            type="button"
            onClick={showUsedIn}
            className={cn('pb-2', tab === 'usedIn' ? 'border-b-2 border-foreground font-medium text-foreground' : 'text-muted-foreground')}
          >
            Used In
          </button>
        </div>

        {tab === 'history' && !selected && (
          <ul className="mt-2 flex flex-col gap-1">
            {history.map((v, i) => (
              <li key={v.id} className="mb-0">
                <button
                  type="button"
                  onClick={() => setDetailIndex(i)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  Version {i + 1}
                  {i === history.length - 1 && ' (current)'}
                  {v.id === highlightRevisionId && ' (used in this resume)'} — edited{' '}
                  {new Date(v.createdAt).toISOString().slice(0, 10)}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === 'history' && selected && detailIndex !== null && (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDetailIndex(null)}>
                ← Back to history
              </Button>
              {selected.id === highlightRevisionId && (
                <span className="text-xs font-medium text-muted-foreground">Used in this resume</span>
              )}
            </div>
            <ObjectVersionChip type={type} version={selected} />
          </div>
        )}

        {tab === 'usedIn' && (
          <ul className="mt-2 flex flex-col gap-1">
            {usage && usage.length > 0 ? (
              usage.map((u) => (
                <li key={u.resumeRevisionId} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
                  <Link href={`/resumes/${u.resumeRevisionId}`} className="text-foreground hover:underline">
                    {u.resumeName}
                  </Link>
                  <span className="text-muted-foreground">v{u.versionNumber}</span>
                </li>
              ))
            ) : (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">Not used in any resume</li>
            )}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
