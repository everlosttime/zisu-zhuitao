import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPeerMessage,
  createPeerRoom,
  finishPeerRoom,
  normalizeRoomCode,
  replayPeerRoom,
  estimateHostClockOffset,
  type PeerMessage,
} from "../fallback/src/peer-room.ts";

test("备用入口只接受不易混淆的六位房间号", () => {
  assert.equal(normalizeRoomCode(" a7k2m9 "), "A7K2M9");
  assert.equal(normalizeRoomCode("A1O0IL"), "");
});

test("房主创建等待中的警察房间", () => {
  const room = createPeerRoom("A7K2M9", "小明", "晨风吹过街角。", 1000);
  assert.equal(room.status, "waiting");
  assert.equal(room.police.name, "小明");
  assert.equal(room.thief, null);
  assert.equal(room.article, "晨风吹过街角。");
});

test("加入消息只填充小偷且不会覆盖房主", () => {
  const room = createPeerRoom("A7K2M9", "小明", "晨风吹过街角。", 1000);
  const next = applyPeerMessage(room, { type: "join", name: "小红" }, 1200);
  assert.equal(next.police.name, "小明");
  assert.equal(next.thief?.name, "小红");
});

test("双方准备后房主可广播三秒后的开始状态", () => {
  let room = createPeerRoom("A7K2M9", "小明", "晨风吹过街角。", 1000);
  room = applyPeerMessage(room, { type: "join", name: "小红" }, 1100);
  room = applyPeerMessage(room, { type: "ready", role: "police" }, 1200);
  room = applyPeerMessage(room, { type: "ready", role: "thief" }, 1300);
  const message: PeerMessage = { type: "start", startedAt: 4300 };
  room = applyPeerMessage(room, message, 1300);
  assert.equal(room.status, "playing");
  assert.equal(room.startedAt, 4300);
});

test("进度消息按角色更新并忽略倒退", () => {
  let room = createPeerRoom("A7K2M9", "小明", "晨风吹过街角。", 1000);
  room = applyPeerMessage(room, { type: "join", name: "小红" }, 1100);
  room = applyPeerMessage(room, { type: "progress", role: "thief", progress: 5, correct: 5, typed: 6 }, 1200);
  room = applyPeerMessage(room, { type: "progress", role: "thief", progress: 3, correct: 3, typed: 3 }, 1300);
  assert.equal(room.thief?.progress, 5);
  assert.equal(room.thief?.typed, 6);
});

test("结算消息固定胜者并结束本局", () => {
  const room = createPeerRoom("A7K2M9", "小明", "晨风吹过街角。", 1000);
  const next = finishPeerRoom(room, "police", 5000);
  assert.equal(next.status, "finished");
  assert.equal(next.winner, "police");
});

test("再来一局会清空双方进度并替换文章", () => {
  let room = createPeerRoom("A7K2M9", "小明", "第一篇", 1000);
  room = applyPeerMessage(room, { type: "join", name: "小红" }, 1100);
  room = applyPeerMessage(room, { type: "progress", role: "police", progress: 8, correct: 8, typed: 9 }, 1200);
  const next = replayPeerRoom(room, "第二篇", 6000);
  assert.equal(next.round, 2);
  assert.equal(next.article, "第二篇");
  assert.equal(next.status, "waiting");
  assert.equal(next.police.progress, 0);
  assert.equal(next.thief?.progress, 0);
  assert.equal(next.police.ready, false);
  assert.equal(next.thief?.ready, false);
});

test("按往返时间中点估算房主时钟偏移", () => {
  assert.equal(estimateHostClockOffset(1000, 1200, 2100), 1000);
});
