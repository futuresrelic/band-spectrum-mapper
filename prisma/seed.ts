import { PrismaClient, SourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Custom stopwords
  const stopwords = [
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'that', 'this',
    'these', 'those', 'it', 'its', 'i', 'my', 'me', 'we', 'our', 'you',
    'your', 'he', 'she', 'they', 'them', 'their', 'not', 'no', 'so', 'as',
  ];

  for (const word of stopwords) {
    await prisma.customStopword.upsert({
      where: { word },
      update: {},
      create: { word },
    });
  }

  // Example band — generic placeholder, not hardcoded to any real band
  const band = await prisma.band.upsert({
    where: { slug: 'example-band' },
    update: {},
    create: {
      name: 'Example Band',
      slug: 'example-band',
      description: 'A placeholder band created by the seed script. Replace with your own bands.',
    },
  });

  // Example album
  const album = await prisma.album.upsert({
    where: { bandId_slug: { bandId: band.id, slug: 'example-album' } },
    update: {},
    create: {
      bandId: band.id,
      title: 'Example Album',
      slug: 'example-album',
      year: 2024,
      notes: 'Placeholder album. Add your own albums via the Library page.',
    },
  });

  // Example song
  const song = await prisma.song.upsert({
    where: { bandId_slug: { bandId: band.id, slug: 'example-song' } },
    update: {},
    create: {
      bandId: band.id,
      albumId: album.id,
      title: 'Example Song',
      slug: 'example-song',
      trackNumber: 1,
      notes: 'Placeholder song. Add your own lyrics via the Song Detail page.',
    },
  });

  // Example lyric
  const existingLyric = await prisma.lyric.findFirst({ where: { songId: song.id } });
  if (!existingLyric) {
    await prisma.lyric.create({
      data: {
        songId: song.id,
        sourceType: SourceType.manual,
        sourceLabel: 'seed script',
        text: 'This is an example lyric.\nReplace this with real lyric content via the Song Detail page.\nAll lyrics are fully editable.',
        isPrimary: true,
      },
    });
  }

  // Example axis score
  await prisma.songAxisScore.upsert({
    where: { songId: song.id },
    update: {},
    create: {
      songId: song.id,
      bandId: band.id,
      aggression: 5,
      complexity: 6,
      atmosphere: 7,
      emotion: 6,
      psychedelic: 4,
      concept: 5,
      notes: 'Example scores — edit via the Spectrum page.',
    },
  });

  console.log('Seed complete.');
  console.log(`  Band: ${band.name} (${band.id})`);
  console.log(`  Album: ${album.title} (${album.id})`);
  console.log(`  Song: ${song.title} (${song.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
