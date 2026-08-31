'use client';

import { useRef, useState } from 'react';
import { createObjectAction, editObjectAction, getObjectHistoryAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { FIELDS_BY_TYPE } from '@/lib/objects/fieldConfig';
import { ObjectVersionChip } from './ObjectVersionChip';
import styles from './ObjectPickerModal.module.css';

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'recent' | 'allVersions'>('recent');
  const [allVersions, setAllVersions] = useState<ObjectSummary[]>([]);

  async function openAllVersions(rootVersionId: string) {
    setAllVersions(await getObjectHistoryAction(rootVersionId));
    setView('allVersions');
  }

  function open() {
    if (editingRootVersionId) {
      openAllVersions(editingRootVersionId);
    } else {
      setView('recent');
      onOpen?.();
    }
    dialogRef.current?.showModal();
  }

  function pick(picked: ObjectSummary) {
    onPick(picked);
    dialogRef.current?.close();
  }

  const prefillFields = (prefillFrom?.fields as Record<string, unknown> | undefined) ?? {};

  return (
    <>
      <button type="button" onClick={open}>
        {triggerLabel}
      </button>
      <dialog ref={dialogRef}>
        <button type="button" onClick={() => dialogRef.current?.close()}>
          ✕
        </button>

        {view === 'recent' && (
          <>
            <h2>{prefillFrom ? `Edit ${type}` : `Add Object — ${type}`}</h2>
            {!prefillFrom && recentObjects.length > 0 && (
              <fieldset>
                <legend>Recent objects</legend>
                <div className={styles.versionsGrid}>
                  {recentObjects.map((o) => (
                    <ObjectVersionChip
                      key={o.id}
                      type={type}
                      version={o}
                      clampBody
                      onClick={() => pick(o)}
                      editTrigger={
                        <button
                          type="button"
                          onClick={() => o.rootVersionId && openAllVersions(o.rootVersionId)}
                          aria-label="See all versions"
                        >
                          +
                        </button>
                      }
                    />
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend>{prefillFrom ? 'Edit fields, then save' : 'or create new'}</legend>
              <form
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
                  <input
                    key={f.name}
                    name={f.name}
                    type={f.type ?? 'text'}
                    placeholder={f.label}
                    required={f.required}
                    defaultValue={String(prefillFields[f.name] ?? '')}
                  />
                ))}
                <textarea name="body" placeholder="Markdown content" required defaultValue={prefillFrom?.body ?? ''} />
                <input name="tags" placeholder="Tags, comma-separated" defaultValue={prefillFrom?.tags?.join(', ') ?? ''} />
                <button type="submit">{prefillFrom ? 'Save new version' : 'Create'}</button>
              </form>
            </fieldset>
          </>
        )}

        {view === 'allVersions' && (
          <>
            <h2>All versions</h2>
            <div className={styles.versionsGrid}>
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
              <button type="button" onClick={() => setView('recent')}>
                ← Back
              </button>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
