// test/db.ts
import { prisma } from '@/lib/prisma';

export async function resetDb() {
  await prisma.resumeVersionItem.deleteMany();
  await prisma.resumeVersionSection.deleteMany();
  await prisma.resumeVersion.deleteMany();
  await prisma.objectVersion.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}
