import { prisma } from '../lib/prisma.js';
import { generateUniqueUsername } from '../lib/generateUsername.js';

interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export const userService = {
  async findOrCreate(profile: GoogleProfile) {
    let user = await prisma.user.upsert({
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

    // Assign a random username on first login (covers both new and existing users).
    if (!user.username) {
      const username = await generateUniqueUsername();
      user = await prisma.user.update({
        where: { id: user.id },
        data: { username },
      });
    }

    return user;
  },
};
