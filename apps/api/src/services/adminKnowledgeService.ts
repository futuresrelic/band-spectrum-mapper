import { prisma } from '../lib/prisma.js';
import type { AdminKnowledgeEntry, KnowledgeImage } from '@band-spectrum-mapper/shared';

function parseImages(raw: unknown): KnowledgeImage[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (i): i is KnowledgeImage =>
      typeof i === 'object' && i !== null &&
      'url' in i && 'caption' in i,
  );
}

function serialize(record: {
  id: string;
  title: string;
  content: string;
  scope: string;
  scopeId: string | null;
  tags: unknown;
  images?: unknown;
  isActive: boolean;
  entryType: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminKnowledgeEntry {
  return {
    ...record,
    scope:       record.scope as AdminKnowledgeEntry['scope'],
    entryType:   (record.entryType === 'social_influence' ? 'social_influence' : 'knowledge') as AdminKnowledgeEntry['entryType'],
    tags:        Array.isArray(record.tags) ? (record.tags as string[]) : [],
    images:      parseImages(record.images ?? []),
    sourceLabel: record.sourceLabel ?? null,
    sourceUrl:   record.sourceUrl   ?? null,
    createdAt:   record.createdAt.toISOString(),
    updatedAt:   record.updatedAt.toISOString(),
  };
}

export const adminKnowledgeService = {
  async list(): Promise<AdminKnowledgeEntry[]> {
    const rows = await prisma.adminKnowledgeEntry.findMany({
      orderBy: [{ entryType: 'asc' }, { scope: 'asc' }, { updatedAt: 'desc' }],
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
    images?: KnowledgeImage[];
    isActive?: boolean;
    entryType?: string;
    sourceLabel?: string | null;
    sourceUrl?: string | null;
  }): Promise<AdminKnowledgeEntry> {
    const row = await prisma.adminKnowledgeEntry.create({
      data: {
        title:       data.title.trim(),
        content:     data.content,
        scope:       data.scope,
        scopeId:     data.scopeId ?? null,
        tags:        data.tags    ?? [],
        images:      (data.images ?? []) as object[],
        isActive:    data.isActive    ?? true,
        entryType:   data.entryType   ?? 'knowledge',
        sourceLabel: data.sourceLabel ?? null,
        sourceUrl:   data.sourceUrl   ?? null,
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
    images: KnowledgeImage[];
    isActive: boolean;
    entryType: string;
    sourceLabel: string | null;
    sourceUrl: string | null;
  }>): Promise<AdminKnowledgeEntry> {
    const row = await prisma.adminKnowledgeEntry.update({
      where: { id },
      data: {
        ...(data.title       !== undefined && { title:       data.title.trim() }),
        ...(data.content     !== undefined && { content:     data.content }),
        ...(data.scope       !== undefined && { scope:       data.scope }),
        ...(data.scopeId     !== undefined && { scopeId:     data.scopeId }),
        ...(data.tags        !== undefined && { tags:        data.tags }),
        ...(data.images      !== undefined && { images:      data.images as object[] }),
        ...(data.isActive    !== undefined && { isActive:    data.isActive }),
        ...(data.entryType   !== undefined && { entryType:   data.entryType }),
        ...(data.sourceLabel !== undefined && { sourceLabel: data.sourceLabel }),
        ...(data.sourceUrl   !== undefined && { sourceUrl:   data.sourceUrl }),
        updatedAt: new Date(),
      },
    });
    return serialize(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.adminKnowledgeEntry.delete({ where: { id } });
  },

  // Build the full context string injected into AI analysis prompts.
  // Knowledge entries are authoritative; social influence entries are
  // presented as compounded community voice — the AI weighs them differently.
  async getContextForSong(songId: string, bandId: string): Promise<string> {
    const entries = await prisma.adminKnowledgeEntry.findMany({
      where: {
        isActive: true,
        OR: [
          { scope: 'global' },
          { scope: 'band', scopeId: bandId },
          { scope: 'song', scopeId: songId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (entries.length === 0) return '';

    const knowledge = entries.filter((e) => e.entryType !== 'social_influence');
    const social    = entries.filter((e) => e.entryType === 'social_influence');
    const parts: string[] = [];

    // Authoritative curator knowledge
    if (knowledge.length > 0) {
      const blocks = knowledge.map((e) => {
        const images = parseImages(e.images);
        const imageBlock = images.length > 0
          ? '\nImages:\n' + images.map((img) =>
              `  - ${img.caption}${img.creditWho ? ` (${img.creditWho}` : ''}${img.creditPlatform ? ` via ${img.creditPlatform}` : ''}${img.creditWho ? ')' : ''}`
            ).join('\n')
          : '';
        return `[${e.title}]\n${e.content.trim()}${imageBlock}`;
      });
      parts.push(
        `CURATOR KNOWLEDGE (provided by site curator — treat as authoritative context):\n\n` +
        blocks.join('\n\n---\n\n'),
      );
    }

    // Community / social influence — aggregated fan reactions
    if (social.length > 0) {
      const blocks = social.map((e) => {
        const from = e.sourceLabel ? ` · Source: ${e.sourceLabel}` : '';
        const url  = e.sourceUrl   ? ` (${e.sourceUrl})` : '';
        return `[${e.title}${from}${url}]\n${e.content.trim()}`;
      });
      const header = social.length === 1
        ? `COMMUNITY VOICE — 1 source captured`
        : `COMMUNITY VOICE — ${social.length} sources aggregated (treat as collective audience sentiment, not individual opinion)`;
      parts.push(`${header}:\n\n${blocks.join('\n\n---\n\n')}`);
    }

    return parts.join('\n\n================\n\n');
  },
};
