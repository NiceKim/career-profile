import { prisma } from '@/lib/prisma';

type ProfileData = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: Record<string, string>;
};

export async function getProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId } });
}

export async function upsertProfile(userId: string, data: ProfileData) {
  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
