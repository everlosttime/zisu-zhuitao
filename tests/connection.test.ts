import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionWatchdog } from "../fallback/src/connection.ts";

test("连接超时只触发一次，并允许界面结束等待", async () => {
  let timeoutCount = 0;
  const watchdog = createConnectionWatchdog(15, () => timeoutCount++);

  await new Promise(resolve => setTimeout(resolve, 40));
  watchdog.finish();

  assert.equal(timeoutCount, 1);
  assert.equal(watchdog.pending, false);
});

test("连接成功会取消超时提示", async () => {
  let timeoutCount = 0;
  const watchdog = createConnectionWatchdog(20, () => timeoutCount++);
  assert.equal(watchdog.finish(), true);

  await new Promise(resolve => setTimeout(resolve, 40));

  assert.equal(timeoutCount, 0);
  assert.equal(watchdog.finish(), false);
});
