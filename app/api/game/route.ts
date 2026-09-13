import { ARTICLES } from "@/lib/articles";
import { canAcceptTyping, ROUND_MS, resolveWinner, sanitizeName, scoreSubmission } from "@/lib/game";
import { createRoom, execute, findRoom, type RoomRow } from "@/db/game-store";

export const runtime = "edge";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => CODE_CHARS[value % CODE_CHARS.length]).join("");
}

function roleFor(room: RoomRow, token: string) {
  if (room.police_token === token) return "police" as const;
  if (room.thief_token === token) return "thief" as const;
  return null;
}

function publicRoom(room: RoomRow, token: string) {
  const now = Date.now();
  return {
    code: room.code, status: room.status, round: room.round, role: roleFor(room, token),
    article: ARTICLES[room.article_index % ARTICLES.length], startedAt: room.started_at,
    serverNow: now, durationMs: ROUND_MS, winner: room.winner,
    police: { name: room.police_name, ready: !!room.police_ready, progress: room.police_progress, correct: room.police_correct, typed: room.police_typed },
    thief: room.thief_name ? { name: room.thief_name, ready: !!room.thief_ready, progress: room.thief_progress, correct: room.thief_correct, typed: room.thief_typed } : null,
  };
}

function failure(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function load(code: unknown) {
  const clean = String(code ?? "").trim().toUpperCase();
  if (!codePattern.test(clean)) return { error: "请输入正确的六位房间号" } as const;
  const room = await findRoom(clean);
  if (!room) return { error: "没有找到这个房间" } as const;
  if (Date.now() - room.updated_at > 30 * 60_000) return { error: "房间已经失效，请重新创建" } as const;
  return { room } as const;
}

async function settleIfNeeded(room: RoomRow) {
  if (room.status !== "playing" || !room.started_at) return room;
  const now = Date.now();
  let winner = resolveWinner({ policeProgress: room.police_progress, thiefProgress: room.thief_progress, elapsedMs: now - room.started_at });
  if (!winner && room.thief_seen_at && now - room.thief_seen_at > 15_000) winner = "police";
  if (!winner && now - room.police_seen_at > 15_000) winner = "thief";
  if (winner) {
    await execute("UPDATE rooms SET status = 'finished', winner = ?, updated_at = ? WHERE id = ? AND status = 'playing'", winner, now, room.id);
    return (await findRoom(room.code)) ?? room;
  }
  return room;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await load(url.searchParams.get("code"));
    if ("error" in result) return failure(result.error, 404);
    const token = url.searchParams.get("token") ?? "";
    const role = roleFor(result.room, token);
    if (!role) return failure("你的房间凭证已经失效", 403);
    const now = Date.now();
    await execute(`UPDATE rooms SET ${role}_seen_at = ? WHERE id = ?`, now, result.room.id);
    const touched = { ...result.room, [`${role}_seen_at`]: now } as RoomRow;
    return Response.json({ room: publicRoom(await settleIfNeeded(touched), token) });
  } catch (error) {
    console.error(error);
    return failure("联机服务暂时不可用，请稍后再试", 503);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const now = Date.now();
    if (action === "create") {
      const name = sanitizeName(String(body.name ?? ""));
      if (!name) return failure("请先输入昵称");
      let code = randomCode();
      for (let attempts = 0; attempts < 4 && await findRoom(code); attempts += 1) code = randomCode();
      const token = crypto.randomUUID();
      await createRoom({ id: crypto.randomUUID(), code, police_token: token, police_name: name, updated_at: now, police_seen_at: now, article_index: Math.floor(Math.random() * ARTICLES.length) });
      return Response.json({ token, room: publicRoom((await findRoom(code))!, token) }, { status: 201 });
    }

    const result = await load(body.code);
    if ("error" in result) return failure(result.error, 404);
    let room = result.room;
    if (action === "join") {
      const name = sanitizeName(String(body.name ?? ""));
      if (!name) return failure("请先输入昵称");
      if (room.thief_token) return failure("房间已经满了", 409);
      if (room.status !== "waiting") return failure("这局已经开始了", 409);
      const token = crypto.randomUUID();
      const joined = await execute("UPDATE rooms SET thief_token = ?, thief_name = ?, thief_seen_at = ?, updated_at = ? WHERE id = ? AND thief_token IS NULL", token, name, now, now, room.id);
      if (!joined.meta.changes) return failure("房间刚刚被其他玩家加入了", 409);
      room = (await findRoom(room.code))!;
      return Response.json({ token, room: publicRoom(room, token) });
    }

    const token = String(body.token ?? "");
    const role = roleFor(room, token);
    if (!role) return failure("你的房间凭证已经失效", 403);
    if (action === "ready") {
      if (!room.thief_token) return failure("请等待另一位玩家加入");
      await execute(`UPDATE rooms SET ${role}_ready = 1, ${role}_seen_at = ?, updated_at = ? WHERE id = ?`, now, now, room.id);
      room = (await findRoom(room.code))!;
      if (room.police_ready && room.thief_ready && room.status === "waiting") {
        await execute("UPDATE rooms SET status = 'playing', started_at = ?, updated_at = ? WHERE id = ? AND status = 'waiting'", now + 3_000, now, room.id);
        room = (await findRoom(room.code))!;
      }
    } else if (action === "sync") {
      if (!canAcceptTyping(room.status, room.started_at, now)) return failure("倒计时还没有结束");
      const seq = Math.max(1, Number(body.seq) || 1);
      const previous = role === "police" ? room.police_progress : room.thief_progress;
      const score = scoreSubmission(ARTICLES[room.article_index % ARTICLES.length], String(body.typed ?? ""), previous);
      await execute(`UPDATE rooms SET ${role}_progress = ?, ${role}_correct = ?, ${role}_typed = ?, ${role}_seq = ?, ${role}_seen_at = ?, updated_at = ? WHERE id = ? AND ${role}_seq < ?`, score.acceptedProgress, score.correctChars, score.typedChars, seq, now, now, room.id, seq);
      room = await settleIfNeeded((await findRoom(room.code))!);
    } else if (action === "replay") {
      if (room.status !== "finished") return failure("本局还没有结束");
      await execute("UPDATE rooms SET status = 'waiting', round = round + 1, article_index = (article_index + 1) % 10, started_at = NULL, winner = NULL, police_ready = 0, thief_ready = 0, police_progress = 0, thief_progress = 0, police_correct = 0, thief_correct = 0, police_typed = 0, thief_typed = 0, police_seq = 0, thief_seq = 0, police_seen_at = ?, thief_seen_at = ?, updated_at = ? WHERE id = ? AND status = 'finished'", now, now, now, room.id);
      room = (await findRoom(room.code))!;
    } else {
      return failure("未知操作");
    }
    return Response.json({ room: publicRoom(room, token) });
  } catch (error) {
    console.error(error);
    return failure("联机服务暂时不可用，请稍后再试", 503);
  }
}
