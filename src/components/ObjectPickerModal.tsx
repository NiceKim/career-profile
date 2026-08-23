'use client';

import { useRef, useState } from 'react';
import { createObjectAction, editObjectAction, getObjectHistoryAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';

type ObjectSummary = { id: string; rootVersionId: string; body: string; versionNumber: number };

type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  onPick: (objectVersionId: string) => void;
  triggerLabel?: string;
  editingRootVersionId?: string;
};

export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingRootVersionId,
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
    }
    dialogRef.current?.showModal();
  }

  function pick(id: string) {
    onPick(id);
    dialogRef.current?.close();
  }

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
            <h2>Add Object — {type}</h2>
            <fieldset>
              <legend>Recent objects</legend>
              {recentObjects.map((o) => (
                <span key={o.id}>
                  <button type="button" onClick={() => pick(o.id)}>
                    {o.body.slice(0, 20)}
                  </button>
                  <button type="button" onClick={() => openAllVersions(o.rootVersionId)} aria-label="See all versions">
                    +
                  </button>
                </span>
              ))}
            </fieldset>
            <fieldset>
              <legend>or create new</legend>
              <form
                action={async (formData) => {
                  const { id } = await createObjectAction(
                    type,
                    { category: String(formData.get('category') ?? '') },
                    String(formData.get('body'))
                  );
                  pick(id);
                }}
              >
                <input name="category" placeholder="Title / category" />
                <textarea name="body" placeholder="Markdown content" required />
                <button type="submit">Create</button>
              </form>
            </fieldset>
          </>
        )}

        {view === 'allVersions' && (
          <>
            <h2>All versions</h2>
            <ul>
              {allVersions.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => pick(v.id)}>
                    v{v.versionNumber}: {v.body.slice(0, 40)}
                  </button>
                </li>
              ))}
            </ul>
            <form
              action={async (formData) => {
                const latest = allVersions[allVersions.length - 1];
                const { id } = await editObjectAction(
                  latest.id,
                  { category: String(formData.get('category') ?? '') },
                  String(formData.get('body'))
                );
                pick(id);
              }}
            >
              <textarea name="body" placeholder="Edit and save as a new version" required defaultValue={allVersions.at(-1)?.body} />
              <button type="submit">Save new version</button>
            </form>
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
