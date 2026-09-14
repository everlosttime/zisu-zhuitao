import test from 'node:test';
import assert from 'node:assert/strict';
import { subtitleWindow } from '../fallback/src/subtitles.ts';
test('字幕保留中文标点并在正确输入完一句后切换', () => {
  assert.deepEqual(subtitleWindow('你好，世界。继续向前！', 0), {text:'你好，世界。', start:0});
  assert.deepEqual(subtitleWindow('你好，世界。继续向前！', 6), {text:'继续向前！', start:6});
});
test('长句分为短字幕，全文完成时保留最后一段', () => {
  const article='春'.repeat(50);
  assert.equal(subtitleWindow(article,24).start,24);
  assert.equal(subtitleWindow(article,50).text,'春春');
});
