import assert from "node:assert/strict";
import test from "node:test";
import { readRelayEnvelope, relayTopics } from "../fallback/src/relay-room.ts";

test("房间消息按警察和小偷方向隔离", () => {
  assert.deepEqual(relayTopics(" gh8r5r "), {
    toPolice: "zisu-zhuitao/v3/GH8R5R/to-police",
    toThief: "zisu-zhuitao/v3/GH8R5R/to-thief",
  });
});

test("服务器重复投递不会让同一条游戏消息执行两次", () => {
  const seen = new Map<string, number>();
  const raw = JSON.stringify({ sender: "friend", seq: 7, sentAt: 10_000, message: { type: "ready", role: "thief" } });

  assert.deepEqual(readRelayEnvelope(raw, "me", seen, 20_000), { type: "ready", role: "thief" });
  assert.equal(readRelayEnvelope(raw, "me", seen, 20_000), null);
});

test("忽略自己、过期和损坏的公共中继消息", () => {
  const seen = new Map<string, number>();
  const self = JSON.stringify({ sender: "me", seq: 1, sentAt: 20_000, message: { type: "join" } });
  const stale = JSON.stringify({ sender: "friend", seq: 1, sentAt: 1, message: { type: "join" } });

  assert.equal(readRelayEnvelope(self, "me", seen, 20_000), null);
  assert.equal(readRelayEnvelope(stale, "me", seen, 60_002), null);
  assert.equal(readRelayEnvelope("not-json", "me", seen, 20_000), null);
});
