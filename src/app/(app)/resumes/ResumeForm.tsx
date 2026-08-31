'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createResumeAction, editResumeAction, forkResumeAction } from '@/app/resumes/actions';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import { listLatestObjectsAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import styles from './ResumeForm.module.css';

const TYPES: ObjectType[] = ['WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'SUMMARY', 'PROJECT', 'CERTIFICATION', 'EXTRACURRICULAR'];

// Mirrors ObjectPickerModal's ObjectSummary (objectVersionId instead of id, since that's
// what a resume section stores) so recentObjects/prefillFrom never have to fabricate data.
type Item = {
  objectVersionId: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  rootVersionId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
};
// What ObjectPickerModal's onPick now hands back (the full saved/picked object).
type Picked = {
  id: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  rootVersionId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
};

function toItem(picked: Picked): Item {
  return {
    objectVersionId: picked.id,
    body: picked.body,
    fields: picked.fields,
    tags: picked.tags,
    rootVersionId: picked.rootVersionId,
    versionNumber: picked.versionNumber,
    createdAt: picked.createdAt,
  };
}

type Props = {
  mode: 'create' | 'edit' | 'fork';
  sourceId?: string;
  initialName?: string;
  initialSections?: Array<{ sectionType: ObjectType; items: Item[] }>;
  versionInfo?: string; // e.g. "v3" or "forked from Senior PM Resume"
};

export function ResumeForm({ mode, sourceId, initialName = '', initialSections = [], versionInfo }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [sections, setSections] = useState(initialSections);
  const [recent, setRecent] = useState<Record<string, Item[]>>({});

  function addSectionType(type: ObjectType) {
    if (sections.some((s) => s.sectionType === type)) return;
    setSections([...sections, { sectionType: type, items: [] }]);
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function openPickerFor(type: ObjectType) {
    if (!recent[type]) {
      const objs = await listLatestObjectsAction(type);
      setRecent((r) => ({
        ...r,
        [type]: objs.map((o) => ({
          objectVersionId: o.id,
          body: o.body,
          fields: o.fields,
          tags: o.tags,
          rootVersionId: o.rootVersionId,
          versionNumber: o.versionNumber,
          createdAt: o.createdAt,
        })),
      }));
    }
  }

  function addItem(type: ObjectType, item: Item) {
    setSections((prev) => prev.map((s) => (s.sectionType === type ? { ...s, items: [...s.items, item] } : s)));
  }

  // Item-level edit (Figma's per-item "Edit" button): reuses ObjectPickerModal's prefillFrom,
  // same edit-in-place semantics as Task 18's chip pencil icon (new version, same rootVersionId).
  function replaceItem(type: ObjectType, oldObjectVersionId: string, picked: Picked) {
    setSections((prev) =>
      prev.map((s) =>
        s.sectionType === type
          ? {
              ...s,
              items: s.items.map((it) => (it.objectVersionId === oldObjectVersionId ? toItem(picked) : it)),
            }
          : s
      )
    );
  }

  async function handleSubmit() {
    const payload = sections.map((s, i) => ({
      sectionType: s.sectionType,
      order: i,
      items: s.items.map((it, j) => ({ objectVersionId: it.objectVersionId, order: j })),
    }));

    const result =
      mode === 'create'
        ? await createResumeAction(name, payload)
        : mode === 'edit'
          ? await editResumeAction(sourceId!, name, payload)
          : await forkResumeAction(sourceId!, name, payload);

    router.push(`/resumes/${result.id}`);
  }

  return (
    <div>
      {versionInfo && <p>{versionInfo}</p>}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Resume name" required />

      {sections.map((section, index) => (
        <fieldset key={section.sectionType} className={styles.section}>
          <legend>
            {section.sectionType}
            <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="Move up">
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveSection(index, 1)}
              disabled={index === sections.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button type="button" onClick={() => removeSection(index)} aria-label="Delete section">
              ✕
            </button>
          </legend>
          <ul>
            {section.items.map((item) => (
              <li key={item.objectVersionId}>
                <ObjectVersionChip
                  type={section.sectionType}
                  version={{ id: item.objectVersionId, body: item.body, fields: item.fields, tags: item.tags }}
                  editTrigger={
                    <ObjectPickerModal
                      type={section.sectionType}
                      prefillFrom={{ id: item.objectVersionId, body: item.body, fields: item.fields, tags: item.tags, versionNumber: 0 }}
                      onPick={(picked) => replaceItem(section.sectionType, item.objectVersionId, picked)}
                      triggerLabel="Edit"
                    />
                  }
                />
              </li>
            ))}
          </ul>
          <ObjectPickerModal
            type={section.sectionType}
            recentObjects={(recent[section.sectionType] ?? []).map((r) => ({
              id: r.objectVersionId,
              rootVersionId: r.rootVersionId,
              body: r.body,
              versionNumber: r.versionNumber ?? 0,
              fields: r.fields,
              tags: r.tags,
              createdAt: r.createdAt,
            }))}
            onOpen={() => openPickerFor(section.sectionType)}
            onPick={(picked) => addItem(section.sectionType, toItem(picked))}
          />
        </fieldset>
      ))}

      <select onChange={(e) => e.target.value && addSectionType(e.target.value as ObjectType)} value="">
        <option value="">+ Add Section</option>
        {TYPES.filter((t) => !sections.some((s) => s.sectionType === t)).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <button type="button" onClick={handleSubmit}>
        {mode === 'create' ? 'Done' : mode === 'edit' ? 'Save new version' : 'Save fork'}
      </button>
    </div>
  );
}
