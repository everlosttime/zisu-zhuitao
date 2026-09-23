import { AI_SPEEDS, ROUND_MS, aiProgressAt, normalizeForTyping, resolveWinner, sanitizeName, type AiDifficulty } from "../../lib/game.ts";

export type Role = "police" | "thief";
export type Player = {
  name: string;
  ready: boolean;
  progress: number;
  correct: number;
  typed: number;
};

export type PeerRoom = {
  code: string;
  status: "waiting" | "playing" | "finished";
  round: number;
  article: string;
  startedAt: number | null;
  durationMs: number;
  winner: Role | "void" | null;
  police: Player;
  thief: Player | null;
  updatedAt: number;
  aiDifficulty?: AiDifficulty;
  articleIndex?: number;
};

export type PeerMessage =
  | { type: "join"; name: string }
  | { type: "ready"; role: Role }
  | { type: "start"; startedAt: number }
  | { type: "progress"; role: Role; progress: number; correct: number; typed: number };

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeRoomCode(value: string) {
  const code = value.trim().toUpperCase();
  return ROOM_CODE.test(code) ? code : "";
}

export function estimateHostClockOffset(clientSentAt: number, clientReceivedAt: number, hostNow: number) {
  return hostNow - (clientSentAt + clientReceivedAt) / 2;
}

function blankPlayer(name: string): Player {
  return { name: sanitizeName(name), ready: false, progress: 0, correct: 0, typed: 0 };
}

export function createPeerRoom(code: string, policeName: string, article: string, now = Date.now()): PeerRoom {
  return {
    code: normalizeRoomCode(code),
    status: "waiting",
    round: 1,
    article,
    startedAt: null,
    durationMs: ROUND_MS,
    winner: null,
    police: blankPlayer(policeName),
    thief: null,
    updatedAt: now,
  };
}

export function applyPeerMessage(room: PeerRoom, message: PeerMessage, now = Date.now()): PeerRoom {
  const next: PeerRoom = {
    ...room,
    police: { ...room.police },
    thief: room.thief ? { ...room.thief } : null,
    updatedAt: now,
  };

  if (message.type === "join") {
    if (!next.thief) next.thief = blankPlayer(message.name);
    return next;
  }
  if (message.type === "ready") {
    const player = message.role === "police" ? next.police : next.thief;
    if (player) player.ready = true;
    return next;
  }
  if (message.type === "start") {
    if (next.police.ready && next.thief?.ready) {
      next.status = "playing";
      next.startedAt = message.startedAt;
    }
    return next;
  }

  const player = message.role === "police" ? next.police : next.thief;
  if (player && Number.isFinite(message.progress) && message.progress >= player.progress) {
    player.progress = Math.max(0, Math.floor(message.progress));
    player.correct = Math.max(player.correct, Math.floor(message.correct));
    player.typed = Math.max(player.typed, Math.floor(message.typed));
  }
  return next;
}

export function finishPeerRoom(room: PeerRoom, winner: Role | "void", now = Date.now()): PeerRoom {
  return { ...room, status: "finished", winner, updatedAt: now };
}

export function createAiPeerRoom(name: string, article: string, difficulty: AiDifficulty, now = Date.now(), round = 1, articleIndex = 0): PeerRoom {
  return {
    code: "LOCALAI",
    status: "playing",
    round,
    article,
    startedAt: now + 3_000,
    durationMs: ROUND_MS,
    winner: null,
    police: { name: sanitizeName(name), ready: true, progress: 0, correct: 0, typed: 0 },
    thief: { name: "电脑小偷", ready: true, progress: 0, correct: 0, typed: 0 },
    updatedAt: now,
    aiDifficulty: difficulty,
    articleIndex,
  };
}

export function advanceAiPeerRoom(room: PeerRoom, difficulty: AiDifficulty, now: number): PeerRoom {
  if (room.status !== "playing" || room.startedAt === null || !room.thief) return room;
  const elapsedMs = now - room.startedAt;
  const progress = aiProgressAt(
    AI_SPEEDS[difficulty],
    elapsedMs,
    Array.from(normalizeForTyping(room.article)).length,
  );
  if (progress === room.thief.progress && elapsedMs < ROUND_MS) return room;
  const next: PeerRoom = {
    ...room,
    thief: { ...room.thief, progress, correct: progress, typed: progress },
    updatedAt: now,
  };
  const winner = resolveWinner({ policeProgress: next.police.progress, thiefProgress: progress, elapsedMs });
  return winner ? finishPeerRoom(next, winner, now) : next;
}

export function replayPeerRoom(room: PeerRoom, article: string, now = Date.now()): PeerRoom {
  return {
    ...room,
    status: "waiting",
    round: room.round + 1,
    article,
    startedAt: null,
    winner: null,
    police: blankPlayer(room.police.name),
    thief: room.thief ? blankPlayer(room.thief.name) : null,
    updatedAt: now,
  };
}
