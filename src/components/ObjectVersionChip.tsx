'use client';

import { useState } from 'react';
import type { ObjectType } from '@/lib/objects/schemas';
import { FIELDS_BY_TYPE, IDENTITY_FIELD, getIdentityLabel } from '@/lib/objects/fieldConfig';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2023-01" (native month input value, day-precision legacy values also tolerated) -> "Jan-2023".
// Hardcoded month names, not Intl/toLocaleDateString, so server/client rendering can't disagree.
function formatMonthYear(value: string): string {
  const [year, month] = value.split('-');
  const index = Number(month) - 1;
  if (!year || Number.isNaN(index) || index < 0 || index > 11) return value;
  return `${MONTH_ABBR[index]}-${year}`;
}

type Version = {
  id: string;
  fields?: unknown;
  body: string;
  createdAt?: string | Date;
  tags?: string[];
  usedInResumeNames?: string[];
};

// Shared full-object chip: identity + secondary fields + body + created date.
// Used both by the Object Dashboard's filmstrip and the picker modal's "all versions" view.
export function ObjectVersionChip({
  type,
  version,
  onClick,
  editTrigger,
  clampBody,
}: {
  type: ObjectType;
  version: Version;
  onClick?: () => void;
  // A small trigger (e.g. an edit-icon ObjectPickerModal) rendered in the chip's corner.
  editTrigger?: React.ReactNode;
  // Caps the body to a few lines instead of showing it in full — for pickers listing several
  // objects at once (e.g. ResumeForm's "Recent objects"), where full bodies would run too long.
  clampBody?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = (version.fields as Record<string, unknown> | null) ?? {};
  const secondaryFields = FIELDS_BY_TYPE[type].filter((f) => f.name !== IDENTITY_FIELD[type]);
  // Date fields (startDate/endDate, issueDate/expiryDate, ...) get their own "from – to" line
  // instead of competing with the other fields for the first-2 slots.
  const [startField, endField] = secondaryFields.filter((f) => f.type === 'month');
  const otherFields = secondaryFields.filter((f) => f.type !== 'month');
  const dateRange =
    startField && fields[startField.name]
      ? `${formatMonthYear(String(fields[startField.name]))}${
          endField ? ` – ${fields[endField.name] ? formatMonthYear(String(fields[endField.name])) : 'Present'}` : ''
        }`
      : null;
  const title = version.usedInResumeNames
    ? `used in: ${version.usedInResumeNames.length > 0 ? version.usedInResumeNames.join(', ') : 'not used'}`
    : undefined;

  const content = (
    <>
      <div className="w-full truncate text-sm font-semibold text-foreground">{getIdentityLabel(type, version.fields)}</div>
      {otherFields.slice(0, 2).map((f) =>
        fields[f.name] ? (
          <div key={f.name} className="w-full truncate text-sm text-muted-foreground">
            {String(fields[f.name])}
          </div>
        ) : null
      )}
      {dateRange && <div className="w-full truncate text-sm text-muted-foreground">{dateRange}</div>}
      {version.body && (
        <div className={cn('whitespace-pre-wrap text-sm text-foreground', clampBody && !expanded && 'line-clamp-3')}>
          {version.body}
        </div>
      )}
      {clampBody && version.body && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
      {version.tags && version.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {version.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}
      {version.createdAt && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(version.createdAt).toISOString().slice(0, 10)}</div>
      )}
    </>
  );

  return (
    <Card
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={cn('relative flex w-full flex-col gap-1 p-3.5 text-left text-sm', onClick && 'cursor-pointer hover:border-[#2da44e]/40')}
    >
      {editTrigger && (
        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
          {editTrigger}
        </div>
      )}
      {content}
    </Card>
  );
}
