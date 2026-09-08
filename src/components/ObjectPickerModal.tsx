'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { createObjectAction, editObjectAction, getObjectHistoryAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { FIELDS_BY_TYPE } from '@/lib/objects/fieldConfig';
import { ObjectVersionChip } from './ObjectVersionChip';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type ObjectSummary = {
  id: string;
  rootVersionId?: string;
  body: string;
  versionNumber: number;
  fields?: unknown;
  tags?: string[];
  createdAt?: string | Date;
};

function parseTags(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  // Receives the full saved object, not just its id, so callers can update their
  // display state (body/fields/tags) without a stale copy or a follow-up fetch.
  onPick: (picked: ObjectSummary) => void;
  triggerLabel?: string;
  editingRootVersionId?: string;
  // Prefills the form from this version's fields/body/tags. Submitting saves a new version
  // of this same object (same rootVersionId) via editObjectAction — an edit-in-place, not a copy.
  prefillFrom?: ObjectSummary;
  // Fires when the plain "recent picker" view opens (not the editingRootVersionId browse view,
  // which already fetches on open). Lets a caller lazy-load recentObjects on first open.
  onOpen?: () => void;
};

export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingRootVersionId,
  prefillFrom,
  onOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'recent' | 'allVersions'>('recent');
  const [allVersions, setAllVersions] = useState<ObjectSummary[]>([]);

  async function openAllVersions(rootVersionId: string) {
    setAllVersions(await getObjectHistoryAction(rootVersionId));
    setView('allVersions');
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    if (editingRootVersionId) {
      openAllVersions(editingRootVersionId);
    } else {
      setView('recent');
      onOpen?.();
    }
  }

  function pick(picked: ObjectSummary) {
    onPick(picked);
    setOpen(false);
  }

  const prefillFields = (prefillFrom?.fields as Record<string, unknown> | undefined) ?? {};
  const isIconTrigger = triggerLabel.length <= 2;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant={isIconTrigger ? 'ghost' : 'secondary'} size={isIconTrigger ? 'icon' : 'sm'} aria-label={triggerLabel === '✎' ? 'Edit' : triggerLabel === '→' ? 'See all versions' : undefined}>
            {triggerLabel === '✎' ? <Pencil className="size-3.5" /> : triggerLabel === '+ Object' ? (
              <>
                <Plus className="size-3.5" /> Object
              </>
            ) : (
              triggerLabel
            )}
          </Button>
        }
      />
      <DialogContent>
        {view === 'recent' && (
          <>
            <DialogTitle>{prefillFrom ? `Edit ${type}` : `Add Object — ${type}`}</DialogTitle>
            {!prefillFrom && recentObjects.length > 0 && (
              <fieldset className="mt-4 flex flex-col gap-2 rounded-none border-0 p-0">
                <legend className="mb-1 p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent objects</legend>
                <div className="flex flex-wrap gap-2">
                  {recentObjects.map((o) => (
                    <ObjectVersionChip
                      key={o.id}
                      type={type}
                      version={o}
                      clampBody
                      onClick={() => pick(o)}
                      editTrigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => o.rootVersionId && openAllVersions(o.rootVersionId)}
                          aria-label="See all versions"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      }
                    />
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="mt-4 flex flex-col gap-3 rounded-none border-0 p-0">
              <legend className="mb-1 p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {prefillFrom ? 'Edit fields, then save' : 'or create new'}
              </legend>
              <form
                className="flex max-w-none flex-col gap-3 mb-0"
                action={async (formData) => {
                  const fields = Object.fromEntries(
                    FIELDS_BY_TYPE[type].map((f) => [f.name, String(formData.get(f.name) ?? '')])
                  );
                  const body = String(formData.get('body'));
                  const tags = parseTags(formData.get('tags'));
                  const saved = prefillFrom
                    ? await editObjectAction(prefillFrom.id, fields, body, tags)
                    : await createObjectAction(type, fields, body, tags);
                  pick(saved);
                }}
              >
                {FIELDS_BY_TYPE[type].map((f) => (
                  <div key={f.name} className="flex flex-col gap-1">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <Input
                      id={f.name}
                      name={f.name}
                      type={f.type ?? 'text'}
                      required={f.required}
                      defaultValue={String(prefillFields[f.name] ?? '')}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="body">Markdown content</Label>
                  <Textarea id="body" name="body" required defaultValue={prefillFrom?.body ?? ''} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tags">Tags, comma-separated</Label>
                  <Input id="tags" name="tags" defaultValue={prefillFrom?.tags?.join(', ') ?? ''} />
                </div>
                <Button type="submit" className="mt-1 self-start">
                  {prefillFrom ? 'Save new version' : 'Create'}
                </Button>
              </form>
            </fieldset>
          </>
        )}

        {view === 'allVersions' && (
          <>
            <DialogTitle>All versions</DialogTitle>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...allVersions].reverse().map((v) => (
                <ObjectVersionChip
                  key={v.id}
                  type={type}
                  version={v}
                  onClick={editingRootVersionId ? undefined : () => pick(v)}
                  editTrigger={<ObjectPickerModal type={type} prefillFrom={v} onPick={onPick} triggerLabel="✎" />}
                />
              ))}
            </div>
            {!editingRootVersionId && (
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setView('recent')}>
                ← Back
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
