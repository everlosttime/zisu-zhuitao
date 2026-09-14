import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionErrorMessage,
  createConnectionWatchdog,
  restrictedNetworkPeerOptions,
} from "../fallback/src/connection.ts";

test("校园网配置包含 443 端口的 TCP/TLS TURN 中继", () => {
  const options = restrictedNetworkPeerOptions();
  const urls = options.config.iceServers.flatMap(server =>
    typeof server.urls === "string" ? [server.urls] : server.urls,
  );

  assert.ok(urls.some(url => url.startsWith("turn:") && url.includes(":443") && url.includes("transport=tcp")));
  assert.ok(urls.some(url => url.startsWith("turns:") && url.includes(":443")));
  assert.ok(urls.some(url => url.startsWith("stun:")));
});

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

test("连接错误向玩家说明可执行的处理办法", () => {
  assert.match(connectionErrorMessage("peer-unavailable"), /房主页面/);
  assert.match(connectionErrorMessage("network"), /校园网/);
  assert.match(connectionErrorMessage("timeout"), /重新加入/);
  assert.match(connectionErrorMessage("timeout", "create"), /重新创建/);
});
