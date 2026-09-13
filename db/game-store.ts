import { env } from "cloudflare:workers";

export type RoomRow = {
  id: string; code: string; status: string; round: number; article_index: number;
  started_at: number | null; updated_at: number; winner: string | null;
  police_token: string; police_name: string; police_ready: number; police_progress: number;
  police_correct: number; police_typed: number; police_seq: number; police_seen_at: number;
  thief_token: string | null; thief_name: string | null; thief_ready: number; thief_progress: number;
  thief_correct: number; thief_typed: number; thief_seq: number; thief_seen_at: number | null;
};

function database() {
  if (!env.DB) throw new Error("联机服务暂时不可用，请稍后再试");
  return env.DB;
}

export async function findRoom(code: string) {
  return database().prepare("SELECT * FROM rooms WHERE code = ? LIMIT 1").bind(code).first<RoomRow>();
}

export async function createRoom(row: Pick<RoomRow, "id" | "code" | "police_token" | "police_name" | "updated_at" | "police_seen_at" | "article_index">) {
  await database().prepare("INSERT INTO rooms (id, code, police_token, police_name, updated_at, police_seen_at, article_index) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.code, row.police_token, row.police_name, row.updated_at, row.police_seen_at, row.article_index).run();
}

export async function execute(sql: string, ...values: unknown[]) {
  return database().prepare(sql).bind(...values).run();
}
