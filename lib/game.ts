export const ROUND_MS = 120_000;
export const STARTING_GAP = 20;
export const METERS_PER_CHAR = 2;

export type AiDifficulty = "low" | "medium" | "high";
export const AI_SPEEDS: Record<AiDifficulty, number> = {
  low: 20,
  medium: 40,
  high: 60,
};

export function aiProgressAt(speedCpm: number, elapsedMs: number, articleLength: number) {
  const safeSpeed = Number.isFinite(speedCpm) ? Math.max(0, speedCpm) : 0;
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const safeLength = Number.isFinite(articleLength) ? Math.max(0, Math.floor(articleLength)) : 0;
  return Math.min(safeLength, Math.floor(safeElapsed * safeSpeed / 60_000));
}

const PUNCTUATION: Record<string, string> = {
  "，": ",", "。": ".", "！": "!", "？": "?", "：": ":", "；": ";",
  "（": "(", "）": ")", "“": '"', "”": '"', "‘": "'", "’": "'",
};

export function normalizeForTyping(value: string) {
  return Array.from(value.normalize("NFKC"))
    .map((char) => PUNCTUATION[char] ?? char)
    .join("")
    .replace(/\s+/g, "");
}

export function sanitizeName(value: string) {
  return Array.from(value.replace(/\s+/g, "").trim()).slice(0, 8).join("");
}

export function scoreSubmission(article: string, typed: string, previousProgress: number) {
  const expected = Array.from(normalizeForTyping(article));
  const actual = Array.from(normalizeForTyping(typed));
  let prefix = 0;
  while (prefix < actual.length && prefix < expected.length && actual[prefix] === expected[prefix]) prefix += 1;
  const acceptedProgress = Math.min(expected.length, Math.max(previousProgress, prefix));
  return {
    acceptedProgress,
    correctChars: prefix,
    typedChars: actual.length,
    hasError: prefix < actual.length,
  };
}

export function resolveWinner(input: { policeProgress: number; thiefProgress: number; elapsedMs: number }) {
  if (distanceGapMeters(input.policeProgress, input.thiefProgress) <= 0) return "police" as const;
  if (input.elapsedMs >= ROUND_MS) {
    return input.policeProgress === 0 && input.thiefProgress === 0 ? "void" as const : "thief" as const;
  }
  return null;
}

export function distanceGapMeters(policeProgress: number, thiefProgress: number) {
  return STARTING_GAP + (thiefProgress - policeProgress) * METERS_PER_CHAR;
}

export function canAcceptTyping(status: string, startedAt: number | null, now: number) {
  return status === "playing" && startedAt !== null && now >= startedAt;
}

export function remainingRoundMs(startedAt: number, now: number, durationMs = ROUND_MS) {
  return Math.min(durationMs, Math.max(0, startedAt + durationMs - now));
}
