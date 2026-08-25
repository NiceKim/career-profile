// Resets demo@example.com back to a clean set of sample objects.
// Run with: node --env-file=.env prisma/seed.ts   (or `npm run db:seed`)
//
// Deliberately scoped to one user (by email) — never touches other accounts.
// Reuses the real createObjectVersion/editObjectVersion functions instead of
// hand-rolling Prisma writes, so seeded data goes through the same
// validation/versioning rules as the app itself.

import { prisma } from '@/lib/prisma';
import { createObjectVersion, editObjectVersion } from '@/lib/objects/versioning';

const DEMO_EMAIL = 'demo@example.com';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    throw new Error(`No user with email ${DEMO_EMAIL} — create it via signup first, this script won't invent a password.`);
  }

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
  await editObjectVersion(
    user.id,
    techCorpV1.id,
    { company: 'TechCorp', title: 'Senior Software Engineer', location: 'San Francisco, CA', startDate: '2022-01' },
    '- Led the migration of the internal tooling platform to a service-oriented architecture.\n- Mentored two junior engineers.\n- Shipped a self-serve deployment pipeline used by 8 teams.',
    ['current']
  );

  await createObjectVersion(
    user.id,
    'WORK_EXPERIENCE',
    { company: 'StartupXYZ', title: 'Software Engineer', location: 'Austin, TX', startDate: '2019-06', endDate: '2021-12' },
    'Full-stack engineer on a 5-person team building a B2B SaaS product from scratch.',
    []
  );

  await createObjectVersion(
    user.id,
    'EDUCATION',
    { institution: 'University of Washington', degree: 'B.S. Computer Science', startDate: '2015-09', endDate: '2019-06' },
    'Focus on distributed systems and human-computer interaction.',
    []
  );

  await createObjectVersion(
    user.id,
    'SKILLS',
    { category: 'Languages & Frameworks' },
    'TypeScript, Python, React, Node.js',
    ['technical']
  );

  await createObjectVersion(user.id, 'SKILLS', { category: 'Tools' }, 'Docker, Kubernetes, AWS, PostgreSQL', [
    'technical',
    'devops',
  ]);

  await createObjectVersion(
    user.id,
    'SUMMARY',
    {},
    'Full-stack engineer with 6+ years building scalable web applications, from early-stage startups to platform teams at larger companies.',
    []
  );

  await createObjectVersion(
    user.id,
    'PROJECT',
    { name: 'Resume Version Control', url: 'https://github.com/example/resume-vc', startDate: '2026-06' },
    'A git-inspired version control system for resumes and reusable resume components, with an AI-assisted Q&A layer.',
    ['side-project']
  );

  await createObjectVersion(
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

  const count = await prisma.objectVersion.count({ where: { ownerUserId: user.id } });
  console.log(`Seeded ${count} object versions for ${DEMO_EMAIL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
