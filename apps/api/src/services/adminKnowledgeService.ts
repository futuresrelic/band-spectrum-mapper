import { prisma } from '../lib/prisma.js';
import type { AdminKnowledgeEntry } from '@band-spectrum-mapper/shared';

function serialize(record: {
  id: string;
  title: string;
  content: string;
  scope: string;
  scopeId: string | null;
  tags: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminKnowledgeEntry {
  return {
    ...record,
    scope: record.scope as AdminKnowledgeEntry['scope'],
    tags:  Array.isArray(record.tags) ? (record.tags as string[]) : [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const adminKnowledgeService = {
  async list(): Promise<AdminKnowledgeEntry[]> {
    const rows = await prisma.adminKnowledgeEntry.findMany({
      orderBy: [{ scope: 'asc' }, { updatedAt: 'desc' }],
    });
    return rows.map(serialize);
  },

  async getById(id: string): Promise<AdminKnowledgeEntry | null> {
    const row = await prisma.adminKnowledgeEntry.findUnique({ where: { id } });
    return row ? serialize(row) : null;
  },

  async create(data: {
    title: string;
    content: string;
    scope: string;
    scopeId?: string | null;
    tags?: string[];
    isActive?: boolean;
  }): Promise<AdminKnowledgeEntry> {
    const row = await prisma.adminKnowledgeEntry.create({
      data: {
        title: data.title.trim(),
        content: data.content,
        scope: data.scope,
        scopeId: data.scopeId ?? null,
        tags: data.tags ?? [],
        isActive: data.isActive ?? true,
      },
    });
    return serialize(row);
  },

  async update(id: string, data: Partial<{
    title: string;
    content: string;
    scope: string;
    scopeId: string | null;
    tags: string[];
    isActive: boolean;
  }>): Promise<AdminKnowledgeEntry> {
    const row = await prisma.adminKnowledgeEntry.update({
      where: { id },
      data: {
        ...(data.title     !== undefined && { title:    data.title.trim() }),
        ...(data.content   !== undefined && { content:  data.content }),
        ...(data.scope     !== undefined && { scope:    data.scope }),
        ...(data.scopeId   !== undefined && { scopeId:  data.scopeId }),
        ...(data.tags      !== undefined && { tags:     data.tags }),
        ...(data.isActive  !== undefined && { isActive: data.isActive }),
        updatedAt: new Date(),
      },
    });
    return serialize(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.adminKnowledgeEntry.delete({ where: { id } });
  },

  // Returns a formatted context block ready to inject into an AI prompt.
  // Fetches global entries + band-scoped entries + song-scoped entries.
  async getContextForSong(songId: string, bandId: string): Promise<string> {
    const entries = await prisma.adminKnowledgeEntry.findMany({
      where: {
        isActive: true,
        OR: [
          { scope: 'global' },
          { scope: 'band',  scopeId: bandId },
          { scope: 'song',  scopeId: songId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (entries.length === 0) return '';

    const blocks = entries.map((e) =>
      `[${e.title}]\n${e.content.trim()}`,
    );

    return `CURATOR KNOWLEDGE (provided by site curator — treat as authoritative context):\n\n${blocks.join('\n\n---\n\n')}`;
  },
};
