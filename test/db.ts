// test/db.ts
import { prisma } from '@/lib/prisma';

export async function resetDb() {
  await prisma.sectionObject.deleteMany();
  await prisma.resumeSection.deleteMany();
  await prisma.resumeRevision.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.objectRevision.deleteMany();
  await prisma.objectVariation.deleteMany();
  await prisma.resumeObject.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}
