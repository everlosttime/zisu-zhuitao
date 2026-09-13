export const ROUND_MS = 120_000;
export const STARTING_GAP = 20;

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
  if (input.policeProgress >= STARTING_GAP + input.thiefProgress) return "police" as const;
  if (input.elapsedMs >= ROUND_MS) {
    return input.policeProgress === 0 && input.thiefProgress === 0 ? "void" as const : "thief" as const;
  }
  return null;
}

export function canAcceptTyping(status: string, startedAt: number | null, now: number) {
  return status === "playing" && startedAt !== null && now >= startedAt;
}

export function remainingRoundMs(startedAt: number, now: number, durationMs = ROUND_MS) {
  return Math.min(durationMs, Math.max(0, startedAt + durationMs - now));
}
