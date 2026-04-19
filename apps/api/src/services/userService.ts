import { prisma } from '../lib/prisma.js';

interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export const userService = {
  async findOrCreate(profile: GoogleProfile) {
    return prisma.user.upsert({
      where: { googleId: profile.googleId },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        ...(profile.name != null ? { name: profile.name } : {}),
        ...(profile.avatarUrl != null ? { avatarUrl: profile.avatarUrl } : {}),
      },
      update: {
        email: profile.email,
        ...(profile.name != null ? { name: profile.name } : {}),
        ...(profile.avatarUrl != null ? { avatarUrl: profile.avatarUrl } : {}),
      },
    });
  },
};
