import { prisma } from '../lib/prisma.js';

export const settingsService = {
  async getStopwords() {
    return prisma.customStopword.findMany({ orderBy: { word: 'asc' } });
  },

  async addStopword(word: string) {
    const normalized = word.toLowerCase().trim();
    return prisma.customStopword.upsert({
      where: { word: normalized },
      update: {},
      create: { word: normalized },
    });
  },

  async removeStopword(word: string) {
    const normalized = word.toLowerCase().trim();
    const existing = await prisma.customStopword.findUnique({ where: { word: normalized } });
    if (!existing) return null;
    return prisma.customStopword.delete({ where: { word: normalized } });
  },

  async bulkReplaceStopwords(words: string[]) {
    const normalized = words.map((w) => w.toLowerCase().trim()).filter(Boolean);
    await prisma.customStopword.deleteMany();
    await prisma.customStopword.createMany({
      data: normalized.map((word) => ({ word })),
      skipDuplicates: true,
    });
    return settingsService.getStopwords();
  },
};
