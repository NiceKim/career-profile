import { z } from 'zod';

const dateRange = { startDate: z.string(), endDate: z.string().optional() };

const workExperience = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  ...dateRange,
});

const education = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  fieldOfStudy: z.string().optional(),
  ...dateRange,
});

const skills = z.object({
  category: z.string().min(1),
});

const summary = z.object({});

const project = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  ...dateRange,
});

const certification = z.object({
  issuer: z.string().min(1),
  issueDate: z.string(),
  expiryDate: z.string().optional(),
});

const extracurricular = z.object({
  organization: z.string().min(1),
  role: z.string().min(1),
  ...dateRange,
});

export const objectFieldSchemas = {
  WORK_EXPERIENCE: workExperience,
  EDUCATION: education,
  SKILLS: skills,
  SUMMARY: summary,
  PROJECT: project,
  CERTIFICATION: certification,
  EXTRACURRICULAR: extracurricular,
} as const;

export type ObjectType = keyof typeof objectFieldSchemas;

export function validateObjectFields(type: ObjectType, fields: unknown) {
  return objectFieldSchemas[type].parse(fields);
}
