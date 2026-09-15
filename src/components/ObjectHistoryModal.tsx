'use client';

import { useState } from 'react';
import { getObjectHistoryAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { ObjectVersionChip } from './ObjectVersionChip';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type HistoryEntry = {
  id: string;
  versionNumber: number;
  body: string;
  fields: unknown;
  tags: string[];
  createdAt: string | Date;
  usedInResumeNames: string[];
};

// Read-only browsing for one variation: click the chip to see its version history as
// a list (version #, edit date), then click a version to see that revision's actual
// content — separate from ObjectPickerModal, which is about picking/editing for use
// elsewhere, not just looking at what's there.
export function ObjectHistoryModal({
  type,
  objectVariationId,
  trigger,
}: {
  type: ObjectType;
  objectVariationId: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'history' | 'detail'>('history');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    const result = await getObjectHistoryAction(objectVariationId);
    setHistory(result);
    setSelectedIndex(result.length - 1);
    setView('history');
  }

  const selected = history[selectedIndex];

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
        {view === 'history' && (
          <>
            <DialogTitle>Version History</DialogTitle>
            <ul className="mt-4 flex flex-col gap-1">
              {history.map((v, i) => (
                <li key={v.id} className="mb-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(i);
                      setView('detail');
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    Version {i + 1} {i === history.length - 1 && '(current)'} — edited{' '}
                    {new Date(v.createdAt).toISOString().slice(0, 10)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {view === 'detail' && selected && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <DialogTitle>Version {selectedIndex + 1}</DialogTitle>
              <Button type="button" variant="secondary" size="sm" onClick={() => setView('history')}>
                History
              </Button>
            </div>
            <ObjectVersionChip type={type} version={selected} />
            <div className="mt-3 text-sm text-muted-foreground">
              {selected.usedInResumeNames.length > 0
                ? `Used in: ${selected.usedInResumeNames.join(', ')}`
                : 'Not used in any resume'}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
