// Resets demo@example.com back to a clean set of sample objects and one resume
// built from them, creating the account (or resetting its password) if needed.
// Login: demo@example.com / devpassword123 — see README's "Demo login" section.
// Run with: node --env-file=.env prisma/seed.ts   (or `npm run db:seed`)
//
// Deliberately scoped to one user (by email) — never touches other accounts.
// Reuses the real createObjectVersion/editObjectVersion functions instead of
// hand-rolling Prisma writes, so seeded data goes through the same
// validation/versioning rules as the app itself.

import { prisma } from '@/lib/prisma';
import { createObjectVersion, editObjectVersion } from '@/lib/objects/versioning';
import { createResumeFromScratch } from '@/lib/resumes/versioning';
import { hashPassword } from '@/lib/password';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'devpassword123';

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, passwordHash },
  });

  // Delete children before parents (no onDelete: Cascade in the schema).
  await prisma.resumeVersionItem.deleteMany({ where: { resumeVersion: { ownerUserId: user.id } } });
  await prisma.resumeVersionSection.deleteMany({ where: { resumeVersion: { ownerUserId: user.id } } });
  await prisma.resumeVersion.deleteMany({ where: { ownerUserId: user.id } });
  await prisma.objectVersion.deleteMany({ where: { ownerUserId: user.id } });

  const techCorpV1 = await createObjectVersion(
    user.id,
    'WORK_EXPERIENCE',
    { company: 'TechCorp', title: 'Software Engineer', location: 'San Francisco, CA', startDate: '2022-01' },
    'Built and maintained internal tooling for the platform team.',
    ['current']
  );
  const techCorp = await editObjectVersion(
    user.id,
    techCorpV1.id,
    { company: 'TechCorp', title: 'Senior Software Engineer', location: 'San Francisco, CA', startDate: '2022-01' },
    '- Led the migration of the internal tooling platform to a service-oriented architecture.\n- Mentored two junior engineers.\n- Shipped a self-serve deployment pipeline used by 8 teams.',
    ['current']
  );

  const startupXYZ = await createObjectVersion(
    user.id,
    'WORK_EXPERIENCE',
    { company: 'StartupXYZ', title: 'Software Engineer', location: 'Austin, TX', startDate: '2019-06', endDate: '2021-12' },
    'Full-stack engineer on a 5-person team building a B2B SaaS product from scratch.',
    []
  );

  const education = await createObjectVersion(
    user.id,
    'EDUCATION',
    { institution: 'University of Washington', degree: 'B.S. Computer Science', startDate: '2015-09', endDate: '2019-06' },
    'Focus on distributed systems and human-computer interaction.',
    []
  );

  const skillsLangs = await createObjectVersion(
    user.id,
    'SKILLS',
    { category: 'Languages & Frameworks' },
    'TypeScript, Python, React, Node.js',
    ['technical']
  );

  const skillsTools = await createObjectVersion(
    user.id,
    'SKILLS',
    { category: 'Tools' },
    'Docker, Kubernetes, AWS, PostgreSQL',
    ['technical', 'devops']
  );

  const summary = await createObjectVersion(
    user.id,
    'SUMMARY',
    {},
    'Full-stack engineer with 6+ years building scalable web applications, from early-stage startups to platform teams at larger companies.',
    []
  );

  const project = await createObjectVersion(
    user.id,
    'PROJECT',
    { name: 'Resume Version Control', url: 'https://github.com/example/resume-vc', startDate: '2026-06' },
    'A git-inspired version control system for resumes and reusable resume components, with an AI-assisted Q&A layer.',
    ['side-project']
  );

  const certification = await createObjectVersion(
    user.id,
    'CERTIFICATION',
    { issuer: 'Amazon Web Services', issueDate: '2023-05', expiryDate: '2026-05' },
    'AWS Certified Solutions Architect — Associate.',
    []
  );

  await createObjectVersion(
    user.id,
    'EXTRACURRICULAR',
    { organization: 'Local Coding Bootcamp', role: 'Volunteer Mentor', startDate: '2021-01' },
    'Mentor early-career developers in JavaScript fundamentals and career guidance.',
    []
  );

  // One resume tying most of the above together, so there's something to open on
  // /dashboard/resumes right after seeding, not just a bare Object Dashboard.
  await createResumeFromScratch(user.id, 'Software Engineer Resume', [
    { sectionType: 'SUMMARY', order: 0, items: [{ objectVersionId: summary.id, order: 0 }] },
    {
      sectionType: 'WORK_EXPERIENCE',
      order: 1,
      items: [
        { objectVersionId: techCorp.id, order: 0 },
        { objectVersionId: startupXYZ.id, order: 1 },
      ],
    },
    { sectionType: 'EDUCATION', order: 2, items: [{ objectVersionId: education.id, order: 0 }] },
    {
      sectionType: 'SKILLS',
      order: 3,
      items: [
        { objectVersionId: skillsLangs.id, order: 0 },
        { objectVersionId: skillsTools.id, order: 1 },
      ],
    },
    { sectionType: 'PROJECT', order: 4, items: [{ objectVersionId: project.id, order: 0 }] },
    { sectionType: 'CERTIFICATION', order: 5, items: [{ objectVersionId: certification.id, order: 0 }] },
  ]);

  const count = await prisma.objectVersion.count({ where: { ownerUserId: user.id } });
  console.log(`Seeded ${count} object versions and 1 resume for ${DEMO_EMAIL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
