import OpenAI from 'openai';

// Lazy-initialised so a missing key doesn't crash the server on startup.
// The error surfaces only when the feature is actually used.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env['OPENAI_API_KEY']) {
      throw new Error('OPENAI_API_KEY is not set — comment mining is unavailable');
    }
    _openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
  }
  return _openai;
}

export interface CommentMiningResult {
  suggestedLyrics: string[];
  recurringThemes: string[];
  fanPhrasing: string[];
  futurePostIdeas: string[];
  pollQuestions: string[];
  corrections: string[];
  engagementNotes: string;
}

export async function mineComments(rawComments: string, bandName?: string): Promise<CommentMiningResult> {
  const bandCtx = bandName ? ` The band being discussed is "${bandName}".` : '';

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a music social media analyst.${bandCtx}
Analyze the provided fan comments and extract structured insights.
Return a JSON object with these exact keys:
- suggestedLyrics: string[] — lyric lines or quotes fans reference or would love to see posted
- recurringThemes: string[] — themes that come up repeatedly (e.g. "nostalgia", "aggression", "spirituality")
- fanPhrasing: string[] — memorable fan-coined phrases or descriptions worth reusing
- futurePostIdeas: string[] — concrete post ideas inspired by the comments
- pollQuestions: string[] — poll questions that would resonate with this fan base
- corrections: string[] — factual corrections or misconceptions from fans that may need addressing
- engagementNotes: string — one short paragraph summarizing overall engagement tone and key takeaways`,
      },
      { role: 'user', content: rawComments },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(text) as Partial<CommentMiningResult>;

  return {
    suggestedLyrics:  Array.isArray(parsed.suggestedLyrics)  ? parsed.suggestedLyrics  : [],
    recurringThemes:  Array.isArray(parsed.recurringThemes)  ? parsed.recurringThemes  : [],
    fanPhrasing:      Array.isArray(parsed.fanPhrasing)      ? parsed.fanPhrasing      : [],
    futurePostIdeas:  Array.isArray(parsed.futurePostIdeas)  ? parsed.futurePostIdeas  : [],
    pollQuestions:    Array.isArray(parsed.pollQuestions)    ? parsed.pollQuestions    : [],
    corrections:      Array.isArray(parsed.corrections)      ? parsed.corrections      : [],
    engagementNotes:  typeof parsed.engagementNotes === 'string' ? parsed.engagementNotes : '',
  };
}
