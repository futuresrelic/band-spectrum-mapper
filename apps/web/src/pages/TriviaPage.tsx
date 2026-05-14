import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { triviaApi, type TriviaQuestion } from '../api/trivia';
import { bandsApi } from '../api/bands';

// ---------------------------------------------------------------------------
// Export card as 1080×1080 PNG
// ---------------------------------------------------------------------------
function exportQuestionCard(question: TriviaQuestion) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, 1080, 1080);

  // Indigo top bar
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, 1080, 8);

  // BSM branding
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('BAND SPECTRUM MAPPER', 60, 70);

  ctx.fillStyle = '#6b7280';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Music Trivia', 60, 100);

  // Question
  ctx.fillStyle = '#f9fafb';
  ctx.font = 'bold 36px system-ui, sans-serif';
  const words = question.question.split(' ');
  let line = '';
  let y = 200;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > 960 && line) {
      ctx.fillText(line.trim(), 60, y);
      line = word + ' ';
      y += 50;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), 60, y);

  // Answer label
  y += 80;
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('ANSWER', 60, y);

  // Answer text
  y += 44;
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.fillText(question.answer, 60, y);

  // Explanation
  if (question.explanation) {
    y += 70;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '22px system-ui, sans-serif';
    const expWords = question.explanation.split(' ');
    let expLine = '';
    for (const word of expWords) {
      const test = expLine + word + ' ';
      if (ctx.measureText(test).width > 960 && expLine) {
        ctx.fillText(expLine.trim(), 60, y);
        expLine = word + ' ';
        y += 32;
      } else {
        expLine = test;
      }
    }
    ctx.fillText(expLine.trim(), 60, y);
  }

  // Bottom bar
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 1020, 1080, 60);
  ctx.fillStyle = '#6b7280';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('bandspectrummapper.com', 60, 1056);

  const link = document.createElement('a');
  link.download = `trivia-${question.id}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TriviaPage() {
  const [cardIdx, setCardIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);

  const { data: bands } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trivia', selectedBandIds],
    queryFn: () => triviaApi.getQuestions({
      count: 10,
      ...(selectedBandIds.length ? { bandIds: selectedBandIds } : {}),
    }),
    staleTime: 0,
  });

  const questions = data?.questions ?? [];
  const current = questions[cardIdx];

  function handleAnswer(option: string) {
    if (selectedOption) return;
    setSelectedOption(option);
    if (option === current?.answer) {
      setScore((s) => s + 1);
    }
    setAnswered((a) => a + 1);
  }

  function handleNext() {
    setSelectedOption(null);
    if (cardIdx < questions.length - 1) {
      setCardIdx((i) => i + 1);
    }
  }

  function handleRegenerate() {
    setCardIdx(0);
    setSelectedOption(null);
    setScore(0);
    setAnswered(0);
    void refetch();
  }

  const isLast = cardIdx >= questions.length - 1;
  const isDone = isLast && !!selectedOption;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Music Trivia</h1>
            <p className="text-sm text-gray-400 mt-1">
              Questions generated from your library — export any card as a social post.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Band filter */}
            {bands && bands.length > 0 && (
              <select
                value={selectedBandIds[0] ?? ''}
                onChange={(e) => setSelectedBandIds(e.target.value ? [e.target.value] : [])}
                className="text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All bands</option>
                {bands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleRegenerate}
              disabled={isLoading}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Loading…' : 'New questions'}
            </button>
          </div>
        </div>

        {/* Score */}
        {answered > 0 && (
          <div className="mb-6 flex items-center gap-4 text-sm">
            <span className="text-gray-400">Score:</span>
            <span className="font-bold text-white text-lg">{score} / {answered}</span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${answered > 0 ? Math.round((score / answered) * 100) : 0}%` }}
              />
            </div>
            <span className="text-gray-400">{questions.length > 0 ? `${cardIdx + 1} / ${questions.length}` : ''}</span>
          </div>
        )}

        {/* Error / loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            Generating questions from your library…
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm p-4">
            Could not load questions. Make sure your library has songs with analysis data.
          </div>
        )}

        {/* No questions */}
        {!isLoading && !error && questions.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">Not enough library data to generate questions.</p>
            <p className="text-sm mt-2">Add more songs, run AI analysis, and come back.</p>
          </div>
        )}

        {/* Game over */}
        {isDone && (
          <div className="mb-6 p-6 rounded-xl bg-indigo-900/30 border border-indigo-700 text-center">
            <p className="text-2xl font-bold text-white mb-1">Round complete!</p>
            <p className="text-gray-300">You scored <span className="text-indigo-300 font-bold">{score}</span> out of {questions.length}</p>
            <button
              onClick={handleRegenerate}
              className="mt-4 px-6 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
            >
              New round
            </button>
          </div>
        )}

        {/* Question card */}
        {current && !isDone && (
          <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden shadow-2xl">
            {/* Album art */}
            {current.imageUrl && (
              <img
                src={current.imageUrl}
                alt="Album art"
                className="w-full h-64 object-cover"
              />
            )}

            <div className="p-8 space-y-6">
              {/* Type badge */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 bg-indigo-900/40 px-3 py-1 rounded-full">
                  {current.type.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-gray-600">
                  {cardIdx + 1} / {questions.length}
                </span>
              </div>

              {/* Question */}
              <p className="text-xl font-semibold text-white leading-snug">{current.question}</p>

              {/* Options */}
              <div className="grid grid-cols-1 gap-3">
                {current.options.map((option) => {
                  const isSelected = selectedOption === option;
                  const isCorrect = option === current.answer;
                  const revealed = !!selectedOption;

                  let cls = 'w-full text-left px-5 py-4 rounded-xl border text-sm font-medium transition-all ';
                  if (!revealed) {
                    cls += 'border-gray-700 bg-gray-800 text-gray-200 hover:border-indigo-500 hover:bg-gray-750 cursor-pointer';
                  } else if (isCorrect) {
                    cls += 'border-green-500 bg-green-900/30 text-green-300 cursor-default';
                  } else if (isSelected && !isCorrect) {
                    cls += 'border-red-500 bg-red-900/20 text-red-300 cursor-default';
                  } else {
                    cls += 'border-gray-800 bg-gray-900 text-gray-500 cursor-default';
                  }

                  return (
                    <button
                      key={option}
                      className={cls}
                      onClick={() => handleAnswer(option)}
                      disabled={revealed}
                    >
                      {option}
                      {revealed && isCorrect && <span className="ml-2 text-green-400">✓</span>}
                      {revealed && isSelected && !isCorrect && <span className="ml-2 text-red-400">✗</span>}
                    </button>
                  );
                })}
              </div>

              {/* Explanation + actions */}
              {selectedOption && (
                <div className="space-y-4">
                  {current.explanation && (
                    <p className="text-sm text-gray-400 border-l-2 border-indigo-600 pl-4">
                      {current.explanation}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {!isLast && (
                      <button
                        onClick={handleNext}
                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
                      >
                        Next question →
                      </button>
                    )}
                    <button
                      onClick={() => exportQuestionCard(current)}
                      className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
                    >
                      Export as social post
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
