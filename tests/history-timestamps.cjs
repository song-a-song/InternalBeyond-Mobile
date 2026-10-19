const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const context = vm.createContext({
  window: {},
  _noVisionM: cfg => cfg && cfg.vision === false,
  _winBeatM: () => 20,
  _toolGapStubM: () => '',
  _giftLineM: () => '礼物',
  _voiceApiLine: v => v.transcript,
  _capFileTextM: t => t,
  userLabel: '我', selfName: 'TA', cfg: {},
  _vmToneNatural: () => '',
});
vm.runInContext(section('function _cacheStableSliceM(', 'function _wsStubHistoryM(')
  + section('function _wsStubHistoryM(', 'function sseFeed(')
  + section('function collapseSameRoleM(', 'function pickGroupUtilCfg('), context);
const stamp = Date.parse('2026-10-19T10:20:30+08:00');
const message = (role, content, timestamp = stamp) => ({ role, content, timestamp });
const build = (msgs, cfg = {}) => context.buildHist(msgs, 40, cfg, { lad: true });
const marker = '【消息发送时间：2026-10-19 02:20:30 UTC】';

test('each original message retains its timestamp when consecutive roles merge', () => {
  const msgs = [message('user', '昨天的事'), message('user', '今天继续', stamp + 86400000), message('assistant', '好')];
  const before = JSON.stringify(msgs);
  const hist = build(msgs);
  assert.equal(hist.length, 2);
  assert.ok(hist[0].content.includes(marker));
  assert.match(hist[0].content, /2026-10-20 02:20:30 UTC/);
  assert.ok(hist[1].content.startsWith(marker));
  assert.equal(JSON.stringify(msgs), before);
  assert.equal(JSON.stringify(build(msgs)), JSON.stringify(hist));
});

test('missing or invalid dates are unknown, never replaced by the current time', () => {
  for (const ts of [undefined, null, 0, -1, NaN, Infinity, 9e20, 'invalid']) {
    const m = message('user', '旧消息');
    m.timestamp = ts;
    assert.equal(build([m])[0].content, '【消息发送时间：未知】\n旧消息');
  }
});

test('empty messages stay empty; sealed, folded and app marker rows stay excluded', () => {
  assert.equal(build([message('user', '')]).length, 0);
  const msgs = [message('user', '已封档', stamp - 1), message('user', '有效'),
    { ...message('user', '折叠'), callFold: true }, { ...message('user', '标记'), mark: {} }];
  assert.equal(build(msgs, { sealTimestamp: stamp - 1 })[0].content, marker + '\n有效');
});

test('images, voice, quotes and files preserve text and timestamps across API formats', () => {
  const m = { ...message('user', ''), images: [{ dataUrl: 'data:image/png;base64,AAAA' }] };
  const hist = build([m]);
  for (const format of ['openai', 'anthropic', 'gemini']) {
    const payload = context._histFor(format, hist)[0];
    assert.ok(JSON.stringify(payload).includes(marker));
    assert.ok(JSON.stringify(payload).includes('AAAA'));
  }
  assert.equal(build([m], { vision: false }).length, 0);
  const mixed = { ...message('user', '正文'), voice: { transcript: '语音文字' },
    quote: { name: 'TA', text: '引用内容' }, files: [{ name: 'a.txt', text: '文件内容' }] };
  const content = build([mixed])[0].content;
  for (const text of [marker, '语音文字', '引用内容', '文件内容', '正文']) assert.ok(content.includes(text));
});

test('group history stamps users, self and other members before collapsing roles', () => {
  const combined = [message('user', '开始'), { ...message('assistant', '自己'), senderName: 'TA' },
    { ...message('assistant', '别人', stamp + 1000), senderName: '伙伴' }, message('user', '收到', stamp + 2000)];
  context.combined = combined;
  const before = JSON.stringify(combined);
  const mapping = section('        const mapped=combined.map(m=>{', '        let _gSumTail9=');
  const result = vm.runInContext('(function(){' + mapping + 'return messages;})()', context);
  assert.equal(result.length, 3);
  assert.equal(result[0].content, marker + '\n[我] 开始');
  assert.equal(result[1].content, marker + '\n自己');
  assert.match(result[2].content, /02:20:31 UTC.*\n\[伙伴\] 别人/);
  assert.match(result[2].content, /02:20:32 UTC.*\n\[我\] 收到/);
  assert.equal(JSON.stringify(combined), before);
});

test('all inline JavaScript still parses', () => {
  let count = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/.test(match[1]) || /type\s*=\s*["'](?:application\/ld\+json|application\/json|importmap|text\/plain)/i.test(match[1])) continue;
    new vm.Script(match[2], { filename: `index-inline-${++count}.js` });
  }
  assert.ok(count > 0);
});
