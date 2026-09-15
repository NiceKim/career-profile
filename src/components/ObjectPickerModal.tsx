'use client';

import { useState } from 'react';
import { Copy, Pencil, Plus } from 'lucide-react';
import { createObjectAction, editObjectAction, forkObjectVariationAction, getObjectHistoryAction } from '@/app/objects/actions';
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
  objectId?: string;
  objectVariationId?: string;
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
  editingObjectVariationId?: string;
  // Prefills the form from this revision's fields/body/tags. Submitting saves a new
  // revision of this same variation via editObjectAction — an edit-in-place, not a copy.
  prefillFrom?: ObjectSummary;
  // Prefills the form from this revision's content but submits via forkObjectVariationAction,
  // starting a brand-new variation under the same object (requires forkFrom.objectId).
  forkFrom?: ObjectSummary;
  // Fires when the plain "recent picker" view opens (not the editingObjectVariationId browse
  // view, which already fetches on open). Lets a caller lazy-load recentObjects on first open.
  onOpen?: () => void;
};

export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingObjectVariationId,
  prefillFrom,
  forkFrom,
  onOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'recent' | 'allVersions'>('recent');
  const [allVersions, setAllVersions] = useState<ObjectSummary[]>([]);

  async function openAllVersions(objectVariationId: string) {
    setAllVersions(await getObjectHistoryAction(objectVariationId));
    setView('allVersions');
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    if (editingObjectVariationId) {
      openAllVersions(editingObjectVariationId);
    } else {
      setView('recent');
      onOpen?.();
    }
  }

  function pick(picked: ObjectSummary) {
    onPick(picked);
    setOpen(false);
  }

  const prefillContent = forkFrom ?? prefillFrom;
  const prefillFields = (prefillContent?.fields as Record<string, unknown> | undefined) ?? {};
  const isIconTrigger = triggerLabel.length <= 2;
  const dialogTitle = forkFrom ? `New Variation — ${type}` : prefillFrom ? `Edit ${type}` : `Add Object — ${type}`;
  const submitLabel = forkFrom ? 'Save as new variation' : prefillFrom ? 'Save new version' : 'Create';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant={isIconTrigger ? 'ghost' : 'secondary'} size={isIconTrigger ? 'icon' : 'sm'} aria-label={triggerLabel === '✎' ? 'Edit' : triggerLabel === '→' ? 'See all versions' : triggerLabel === '⧉' ? 'New Variation' : undefined}>
            {triggerLabel === '✎' ? <Pencil className="size-3.5" /> : triggerLabel === '⧉' ? <Copy className="size-3.5" /> : triggerLabel === '+ Object' ? (
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
            <DialogTitle>{dialogTitle}</DialogTitle>
            {!prefillContent && recentObjects.length > 0 && (
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
                          onClick={() => o.objectVariationId && openAllVersions(o.objectVariationId)}
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
                {prefillContent ? 'Edit fields, then save' : 'or create new'}
              </legend>
              <form
                className="flex max-w-none flex-col gap-3 mb-0"
                action={async (formData) => {
                  const fields = Object.fromEntries(
                    FIELDS_BY_TYPE[type].map((f) => [f.name, String(formData.get(f.name) ?? '')])
                  );
                  const body = String(formData.get('body'));
                  const tags = parseTags(formData.get('tags'));
                  const saved = forkFrom
                    ? await forkObjectVariationAction(forkFrom.objectId!, fields, body, tags)
                    : prefillFrom
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
                  <Textarea id="body" name="body" required defaultValue={prefillContent?.body ?? ''} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tags">Tags, comma-separated</Label>
                  <Input id="tags" name="tags" defaultValue={prefillContent?.tags?.join(', ') ?? ''} />
                </div>
                <Button type="submit" className="mt-1 self-start">
                  {submitLabel}
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
                  onClick={editingObjectVariationId ? undefined : () => pick(v)}
                  editTrigger={<ObjectPickerModal type={type} prefillFrom={v} onPick={onPick} triggerLabel="✎" />}
                />
              ))}
            </div>
            {!editingObjectVariationId && (
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
