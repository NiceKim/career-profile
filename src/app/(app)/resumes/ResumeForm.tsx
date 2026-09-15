'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createResumeAction, editResumeAction, forkResumeAction } from '@/app/resumes/actions';
import { ObjectPickerModal, type ObjectDraft } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import { createObjectAction, editObjectAction, forkObjectVariationAction, listLatestObjectsAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TYPES: ObjectType[] = ['WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'SUMMARY', 'PROJECT', 'CERTIFICATION', 'EXTRACURRICULAR'];

// Mirrors ObjectPickerModal's ObjectSummary (objectRevisionId instead of id, since that's
// what a resume section stores) so recentObjects/prefillFrom never have to fabricate data.
// `draft` is present when this item hasn't been written to the DB yet — object creates/
// edits/duplicates made while authoring a resume are staged (objectRevisionId is a client-
// only placeholder), and only resolved into real rows when the resume itself is submitted.
type Item = {
  objectRevisionId: string;
  objectId?: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  objectVariationId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
  draft?: ObjectDraft;
};
// What ObjectPickerModal's onPick now hands back (the full saved/picked object, or a draft).
type Picked = {
  id: string;
  objectId?: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  objectVariationId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
  draft?: ObjectDraft;
};

function toItem(picked: Picked): Item {
  return {
    objectRevisionId: picked.id,
    objectId: picked.objectId,
    body: picked.body,
    fields: picked.fields,
    tags: picked.tags,
    objectVariationId: picked.objectVariationId,
    versionNumber: picked.versionNumber,
    createdAt: picked.createdAt,
    draft: picked.draft,
  };
}

// Resolves a staged item into a real objectRevisionId, writing it to the DB via whichever
// action its draft calls for. Already-real items (no draft) pass through untouched.
async function resolveItem(item: Item): Promise<string> {
  if (!item.draft) return item.objectRevisionId;
  const saved =
    item.draft.kind === 'create'
      ? await createObjectAction(item.draft.type, item.fields, item.body, item.tags)
      : item.draft.kind === 'edit'
        ? await editObjectAction(item.draft.sourceRevisionId, item.fields, item.body, item.tags)
        : await forkObjectVariationAction(item.draft.objectId, item.fields, item.body, item.tags);
  return saved.id;
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
          objectRevisionId: o.id,
          objectId: o.objectId,
          body: o.body,
          fields: o.fields,
          tags: o.tags,
          objectVariationId: o.objectVariationId,
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
  // same edit-in-place semantics as the dashboard's chip pencil icon (new revision, same variation).
  // Targets by index, not objectRevisionId — a section can legitimately hold the same object
  // revision twice (SectionObject has no uniqueness constraint on the reference itself, only on
  // order), and matching by value would silently replace every occurrence instead of just one.
  function replaceItem(type: ObjectType, index: number, picked: Picked) {
    setSections((prev) =>
      prev.map((s) =>
        s.sectionType === type
          ? { ...s, items: s.items.map((it, i) => (i === index ? toItem(picked) : it)) }
          : s
      )
    );
  }

  // Canonical form: name + ordered objectRevisionIds per section. Editing an item's content
  // yields a new objectRevisionId (a new object revision), so this also catches content edits,
  // not just add/remove/reorder.
  function canonical(n: string, s: typeof sections) {
    return JSON.stringify({
      name: n.trim(),
      sections: s.map((sec) => ({ type: sec.sectionType, items: sec.items.map((it) => it.objectRevisionId) })),
    });
  }

  const unchanged =
    mode !== 'create' && canonical(name, sections) === canonical(initialName, initialSections);
  const hasNoItems = sections.every((s) => s.items.length === 0);

  async function handleSubmit() {
    // Staged object drafts (create/edit/duplicate made while authoring this resume) only
    // get written now, resolved into real ids before the resume itself is saved.
    const payload = await Promise.all(
      sections.map(async (s, i) => ({
        sectionType: s.sectionType,
        order: i,
        items: await Promise.all(
          s.items.map(async (it, j) => ({ objectRevisionId: await resolveItem(it), order: j }))
        ),
      }))
    );

    const result =
      mode === 'create'
        ? await createResumeAction(name, payload)
        : mode === 'edit'
          ? await editResumeAction(sourceId!, name, payload)
          : await forkResumeAction(sourceId!, name, payload);

    router.push(`/resumes/${result.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {versionInfo && <p className="text-sm text-muted-foreground">{versionInfo}</p>}
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Resume name" required className="max-w-md" />

      {sections.map((section, index) => (
        <fieldset key={section.sectionType} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <legend className="flex items-center gap-2 px-1 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {section.sectionType}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => moveSection(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => moveSection(index, 1)}
              disabled={index === sections.length - 1}
              aria-label="Move down"
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeSection(index)} aria-label="Delete section">
              <X className="size-3.5" />
            </Button>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {section.items.map((item, itemIndex) => (
              <ObjectVersionChip
                key={`${item.objectRevisionId}-${itemIndex}`}
                type={section.sectionType}
                version={{ id: item.objectRevisionId, body: item.body, fields: item.fields, tags: item.tags }}
                editTrigger={
                  <div className="flex gap-1">
                    <ObjectPickerModal
                      type={section.sectionType}
                      prefillFrom={{
                        id: item.objectRevisionId,
                        body: item.body,
                        fields: item.fields,
                        tags: item.tags,
                        versionNumber: 0,
                        objectId: item.objectId,
                        objectVariationId: item.objectVariationId,
                        draft: item.draft,
                      }}
                      onPick={(picked) => replaceItem(section.sectionType, itemIndex, picked)}
                      triggerLabel="✎"
                      defer
                    />
                    <ObjectPickerModal
                      type={section.sectionType}
                      forkFrom={{
                        objectId: item.objectId,
                        id: item.objectRevisionId,
                        body: item.body,
                        fields: item.fields,
                        tags: item.tags,
                        versionNumber: item.versionNumber ?? 0,
                      }}
                      onPick={(picked) => addItem(section.sectionType, toItem(picked))}
                      triggerLabel="⧉"
                      defer
                    />
                  </div>
                }
              />
            ))}
          </div>
          <ObjectPickerModal
            type={section.sectionType}
            recentObjects={(recent[section.sectionType] ?? []).map((r) => ({
              id: r.objectRevisionId,
              objectId: r.objectId,
              objectVariationId: r.objectVariationId,
              body: r.body,
              versionNumber: r.versionNumber ?? 0,
              fields: r.fields,
              tags: r.tags,
              createdAt: r.createdAt,
            }))}
            onOpen={() => openPickerFor(section.sectionType)}
            onPick={(picked) => addItem(section.sectionType, toItem(picked))}
            defer
          />
        </fieldset>
      ))}

      <select
        onChange={(e) => e.target.value && addSectionType(e.target.value as ObjectType)}
        value=""
        className="h-9 max-w-xs rounded-md border border-border bg-background px-3 py-0 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">+ Add Section</option>
        {TYPES.filter((t) => !sections.some((s) => s.sectionType === t)).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim() || hasNoItems || unchanged}
        className="self-start"
        title={
          !name.trim()
            ? 'Resume title is required'
            : hasNoItems
              ? 'Add at least one object'
              : unchanged
                ? 'No changes to save'
                : undefined
        }
      >
        {mode === 'create' ? 'Done' : mode === 'edit' ? 'Save' : 'Save fork'}
      </Button>
    </div>
  );
}
