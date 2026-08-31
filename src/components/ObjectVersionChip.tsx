import { useState } from 'react';
import type { ObjectType } from '@/lib/objects/schemas';
import { FIELDS_BY_TYPE, IDENTITY_FIELD, getIdentityLabel } from '@/lib/objects/fieldConfig';
import styles from './ObjectVersionChip.module.css';

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
      <div className={styles.title}>{getIdentityLabel(type, version.fields)}</div>
      {otherFields.slice(0, 2).map((f) =>
        fields[f.name] ? (
          <div key={f.name} className={styles.field}>
            {String(fields[f.name])}
          </div>
        ) : null
      )}
      {dateRange && <div className={styles.field}>{dateRange}</div>}
      {version.body && (
        <div className={clampBody && !expanded ? `${styles.body} ${styles.bodyClamped}` : styles.body}>
          {version.body}
        </div>
      )}
      {clampBody && version.body && (
        <button
          type="button"
          className={styles.expandToggle}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      {version.tags && version.tags.length > 0 && (
        <div className={styles.tags}>
          {version.tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}
      {version.createdAt && (
        <div className={styles.date}>{new Date(version.createdAt).toISOString().slice(0, 10)}</div>
      )}
    </>
  );

  return (
    <div
      className={styles.chip}
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {editTrigger && (
        <div className={styles.editTrigger} onClick={(e) => e.stopPropagation()}>
          {editTrigger}
        </div>
      )}
      {content}
    </div>
  );
}
