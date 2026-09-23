import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeForTyping,
  scoreSubmission,
  resolveWinner,
  sanitizeName,
  canAcceptTyping,
  remainingRoundMs,
  distanceGapMeters,
} from "../lib/game.ts";
import * as gameModule from "../lib/game.ts";
import * as articleModule from "../lib/articles.ts";
import { ARTICLES } from "../lib/articles.ts";

test("中文标点和排版空白会被统一后比较", () => {
  assert.equal(normalizeForTyping("你好， 世界！\n继续。"), "你好,世界!继续.");
});

test("只有从开头连续正确的文字才能计入进度", () => {
  assert.deepEqual(scoreSubmission("春风吹过小路", "春风吹错了", 0), {
    acceptedProgress: 3,
    correctChars: 3,
    typedChars: 5,
    hasError: true,
  });
});

test("进度不能倒退也不能超过文章长度", () => {
  assert.equal(scoreSubmission("一路向前", "一路", 3).acceptedProgress, 3);
  assert.equal(scoreSubmission("一路向前", "一路向前冲", 0).acceptedProgress, 4);
});

test("每个正确字让双方距离变化两米", () => {
  assert.equal(distanceGapMeters(0, 0), 20);
  assert.equal(distanceGapMeters(1, 0), 18);
  assert.equal(distanceGapMeters(0, 1), 22);
});

test("一个字两米时警察净领先十字即可获胜", () => {
  assert.equal(resolveWinner({ policeProgress: 30, thiefProgress: 20, elapsedMs: 20_000 }), "police");
});

test("两分钟结束且双方有输入时小偷获胜", () => {
  assert.equal(resolveWinner({ policeProgress: 10, thiefProgress: 8, elapsedMs: 120_000 }), "thief");
});

test("两分钟无人输入时对局无效", () => {
  assert.equal(resolveWinner({ policeProgress: 0, thiefProgress: 0, elapsedMs: 120_000 }), "void");
});

test("昵称去除多余空白并限制为八个字符", () => {
  assert.equal(sanitizeName("  小 王 同 学 123  "), "小王同学123");
});

test("内置词库有两百条原创句子和三十篇足够完成比赛的文章", () => {
  assert.ok(Array.isArray(articleModule.SENTENCES));
  assert.equal(articleModule.SENTENCES.length, 200);
  assert.equal(new Set(articleModule.SENTENCES).size, 200);
  assert.ok(articleModule.SENTENCES.every((sentence) => Array.from(sentence).length >= 18));
  assert.equal(ARTICLES.length, 30);
  assert.ok(ARTICLES.every((article) => Array.from(article).length >= 800));
  assert.equal(new Set(ARTICLES).size, 30);
  for (const article of ARTICLES) {
    const sentences = article.match(/[^。！？]+[。！？]/gu) ?? [];
    assert.equal(sentences.length, 45);
    assert.equal(new Set(sentences).size, sentences.length);
  }
});

test("AI uses fixed low medium and high speeds and follows elapsed time", () => {
  assert.deepEqual(gameModule.AI_SPEEDS, { low: 20, medium: 40, high: 60 });
  assert.equal(gameModule.aiProgressAt(20, -1, 800), 0);
  assert.equal(gameModule.aiProgressAt(20, 60_000, 800), 20);
  assert.equal(gameModule.aiProgressAt(40, 60_000, 800), 40);
  assert.equal(gameModule.aiProgressAt(60, 30_000, 800), 30);
  assert.equal(gameModule.aiProgressAt(60, 120_000, 50), 50);
});

test("文章重赛索引会遍历完整词库后回到开头", () => {
  assert.equal(typeof articleModule.nextArticleIndex, "function");
  assert.equal(articleModule.nextArticleIndex(28), 29);
  assert.equal(articleModule.nextArticleIndex(29), 0);
});

test("三秒倒计时结束前服务端不接受输入", () => {
  assert.equal(canAcceptTyping("playing", 10_000, 9_999), false);
  assert.equal(canAcceptTyping("playing", 10_000, 10_000), true);
});

test("倒计时阶段比赛时间最多显示两分钟", () => {
  assert.equal(remainingRoundMs(13_000, 10_000, 120_000), 120_000);
  assert.equal(remainingRoundMs(13_000, 14_000, 120_000), 119_000);
});
