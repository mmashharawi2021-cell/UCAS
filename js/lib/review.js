// Smart review (Leitner system) for questions answered wrongly. Pure helpers.

/** Days until the next review for each box. Box 0 = due now. */
export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];
export const MASTERED_BOX = BOX_INTERVALS.length - 1;

function normalize(text) {
  return String(text || '')
    .replace(/[ً-ْ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Stable id for a question (sample questions have no id). */
export function questionKey(question) {
  const base = question?.id ? `id:${question.id}` : `q:${normalize(question?.question)}`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `rv-${(hash >>> 0).toString(36)}`;
}

function addDays(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Snapshot only what review needs, so later edits to the bank don't break records. */
export function snapshot(question) {
  return {
    question: String(question.question || ''),
    choices: (question.choices || []).map(String),
    answer: Number(question.answer),
    why: String(question.why || ''),
    source: String(question.source || ''),
  };
}

/**
 * Apply one answer to a review record (or create one).
 * Wrong → box 0, due now. Right → next box, due after its interval.
 */
export function applyAnswer(record, question, courseId, correct, now = new Date()) {
  const current = record || {
    id: questionKey(question),
    courseId,
    box: 0,
    right: 0,
    wrong: 0,
    createdAt: new Date(now).toISOString(),
  };
  const box = correct ? Math.min(MASTERED_BOX, (current.box || 0) + 1) : 0;
  return {
    ...current,
    courseId: courseId || current.courseId,
    q: snapshot(question),
    box,
    right: (current.right || 0) + (correct ? 1 : 0),
    wrong: (current.wrong || 0) + (correct ? 0 : 1),
    lastAnsweredAt: new Date(now).toISOString(),
    due: addDays(now, BOX_INTERVALS[box]),
  };
}

/**
 * Records to create/update after a quiz: wrong answers enter (or reset in) review;
 * right answers only advance questions that are already under review.
 */
export function reviewUpdatesFromQuiz(existing, questions, answers, courseId, now = new Date()) {
  const byId = new Map((existing || []).map(r => [r.id, r]));
  const updates = [];
  questions.forEach((q, i) => {
    const key = questionKey(q);
    const record = byId.get(key);
    const correct = answers[i] === q.answer;
    if (!correct || record) updates.push(applyAnswer(record, q, courseId, correct, now));
  });
  return updates;
}

export function dueReviews(records, now = new Date(), courseId = null) {
  const t = new Date(now).getTime();
  return (records || [])
    .filter(r => r.box < MASTERED_BOX && new Date(r.due).getTime() <= t)
    .filter(r => !courseId || r.courseId === courseId)
    .sort((a, b) => a.box - b.box || String(a.due).localeCompare(String(b.due)));
}

export function reviewStats(records) {
  const stats = { total: 0, mastered: 0, learning: 0 };
  for (const r of records || []) {
    stats.total++;
    if (r.box >= MASTERED_BOX) stats.mastered++;
    else stats.learning++;
  }
  return stats;
}
