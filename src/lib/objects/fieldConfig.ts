import type { ObjectType } from './schemas';

export type FieldConfig = { name: string; label: string; required?: boolean; type?: string };

export const FIELDS_BY_TYPE: Record<ObjectType, FieldConfig[]> = {
  WORK_EXPERIENCE: [
    { name: 'company', label: 'Company', required: true },
    { name: 'title', label: 'Title', required: true },
    { name: 'location', label: 'Location' },
    { name: 'startDate', label: 'Start date', required: true, type: 'month' },
    { name: 'endDate', label: 'End date', type: 'month' },
  ],
  EDUCATION: [
    { name: 'institution', label: 'Institution', required: true },
    { name: 'degree', label: 'Degree', required: true },
    { name: 'fieldOfStudy', label: 'Field of study' },
    { name: 'startDate', label: 'Start date', required: true, type: 'month' },
    { name: 'endDate', label: 'End date', type: 'month' },
  ],
  SKILLS: [{ name: 'category', label: 'Category', required: true }],
  SUMMARY: [],
  PROJECT: [
    { name: 'name', label: 'Name', required: true },
    { name: 'url', label: 'URL', type: 'url' },
    { name: 'startDate', label: 'Start date', required: true, type: 'month' },
    { name: 'endDate', label: 'End date', type: 'month' },
  ],
  CERTIFICATION: [
    { name: 'issuer', label: 'Issuer', required: true },
    { name: 'issueDate', label: 'Issue date', required: true, type: 'month' },
    { name: 'expiryDate', label: 'Expiry date', type: 'month' },
  ],
  EXTRACURRICULAR: [
    { name: 'organization', label: 'Organization', required: true },
    { name: 'role', label: 'Role', required: true },
    { name: 'startDate', label: 'Start date', required: true, type: 'month' },
    { name: 'endDate', label: 'End date', type: 'month' },
  ],
};

// The field that identifies *which* object this is (shown as the group's title label).
// SUMMARY has none — falls back to a static label wherever this is used.
export const IDENTITY_FIELD: Record<ObjectType, string | null> = {
  WORK_EXPERIENCE: 'company',
  EDUCATION: 'institution',
  SKILLS: 'category',
  SUMMARY: null,
  PROJECT: 'name',
  CERTIFICATION: 'issuer',
  EXTRACURRICULAR: 'organization',
};

export function getIdentityLabel(type: ObjectType, fields: unknown): string {
  const key = IDENTITY_FIELD[type];
  if (!key) return 'Summary';
  const value = (fields as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === 'string' && value.length > 0 ? value : 'Untitled';
}
