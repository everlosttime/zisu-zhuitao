export function relayTopics(code: string) {
  const room = code.trim().toUpperCase();
  const base = `zisu-zhuitao/v3/${room}`;
  return { toPolice: `${base}/to-police`, toThief: `${base}/to-thief` };
}

export function readRelayEnvelope(
  raw: string,
  ownSender: string,
  lastSequence: Map<string, number>,
  now: number,
): unknown | null {
  if (raw.length > 100_000) return null;
  try {
    const envelope = JSON.parse(raw) as Record<string, unknown>;
    const { sender, seq, sentAt, message } = envelope;
    if (typeof sender !== "string" || !sender || sender.length > 80 || sender === ownSender) return null;
    if (!Number.isSafeInteger(seq) || (seq as number) < 1) return null;
    if (typeof sentAt !== "number" || now - sentAt > 60_000 || sentAt - now > 15_000) return null;
    if (!message || typeof message !== "object" || typeof (message as { type?: unknown }).type !== "string") return null;
    if ((lastSequence.get(sender) ?? 0) >= (seq as number)) return null;
    lastSequence.set(sender, seq as number);
    return message;
  } catch {
    return null;
  }
}
