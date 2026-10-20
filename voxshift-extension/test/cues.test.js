// Chạy: node voxshift-extension/test/cues.test.js
const assert = require('assert');
const LT = require('../lib/cues.js');
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m || ''} ${a} != ${b}`);

// --- json3: bỏ dòng "\n" và [Music], điền end thiếu
let c = LT.parseCaptions(JSON.stringify({ events: [
  { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Xin ' }, { utf8: 'chào' }] },
  { tStartMs: 2000, dDurationMs: 100, aAppend: 1, segs: [{ utf8: '\n' }] },
  { tStartMs: 2500, segs: [{ utf8: '[Music]' }] },
  { tStartMs: 3000, segs: [{ utf8: 'không có end' }] },
  { tStartMs: 9000 }] }));
assert.deepStrictEqual(c.map(x => x.text), ['Xin chào', 'không có end']);
near(c[0].end, 2); assert.ok(Number.isNaN(c[1].end));

// --- xml (cũ + srv3), entity hai lớp
c = LT.parseCaptions('<transcript><text start="1.5" dur="2">It&amp;#39;s ok</text></transcript>');
assert.strictEqual(c[0].text, "It's ok"); near(c[0].end, 3.5);
c = LT.parseCaptions('<timedtext><body><p t="1500" d="2000">a <s>b</s></p></body></timedtext>');
assert.strictEqual(c[0].text, 'a b'); near(c[0].start, 1.5);
assert.deepStrictEqual(LT.parseCaptions(''), []);
assert.deepStrictEqual(LT.parseCaptions('không phải phụ đề'), []);
assert.deepStrictEqual(LT.parseCaptions('{hỏng'), []);

// --- normalize: phụ đề cuốn (dòng sau bắt đầu khi dòng trước chưa hết) bị cắt end; bỏ trùng; sắp xếp
c = LT.normalizeCues([
  { start: 16.48, end: 20.24, text: 'b' }, { start: 13.48, end: 18.36, text: 'a' }, { start: 13.48, end: 18.36, text: 'a' },
  { start: 30, end: NaN, text: 'c' }]);
assert.deepStrictEqual(c.map(x => x.text), ['a', 'b', 'c']);
near(c[0].end, 16.48, 'a bị cắt tại đầu b'); near(c[1].end, 20.24); near(c[2].end, 33);

// --- merge: nối mảnh chưa hết câu, tách ở dấu chấm, khoảng nghỉ lớn, quá dài
let m = LT.mergeCues([
  { start: 0, end: 1, text: 'This is' }, { start: 1.1, end: 2, text: 'one sentence.' },
  { start: 2.2, end: 3, text: 'Next one' }, { start: 6, end: 7, text: 'after a pause' }]);
assert.deepStrictEqual(m.map(x => x.text), ['This is one sentence.', 'Next one', 'after a pause']);
assert.deepStrictEqual(m.map(x => x.id), [0, 1, 2]);
m = LT.mergeCues([{ start: 0, end: 1, text: 'a'.repeat(100) }, { start: 1, end: 2, text: 'b'.repeat(100) }]);
assert.strictEqual(m.length, 2, 'không ghép quá 150 ký tự');

// --- findIndex
const cs = [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 8 }];
assert.strictEqual(LT.findIndex(cs, -1), 0);
assert.strictEqual(LT.findIndex(cs, 1), 0);       // đang giữa câu 0
assert.strictEqual(LT.findIndex(cs, 2), 1);       // câu 0 vừa hết
assert.strictEqual(LT.findIndex(cs, 2.5), 1);     // khoảng trống giữa hai câu
assert.strictEqual(LT.findIndex(cs, 7), 2);
assert.strictEqual(LT.findIndex(cs, 9), 3);
assert.strictEqual(LT.findIndex([], 5), 0);

// --- pickTrack: ưu tiên tiếng Việt (bản người làm > tự động), không có thì tiếng Anh + dịch
const T = (languageCode, kind, isTranslatable) => ({ languageCode, kind: kind || '', isTranslatable });
let p = LT.pickTrack([T('en', 'asr', true), T('vi', 'asr', true), T('vi', '', true)], 'vi');
assert.deepStrictEqual([p.track.languageCode, p.track.kind, p.translate], ['vi', '', false]);
p = LT.pickTrack([T('en', 'asr', true), T('vi', 'asr', true)], 'vi');
assert.deepStrictEqual([p.track.languageCode, p.track.kind, p.translate], ['vi', 'asr', false]);
p = LT.pickTrack([T('fr', '', true), T('en', 'asr', true), T('en', '', true)], 'vi');
assert.deepStrictEqual([p.track.languageCode, p.track.kind, p.translate], ['en', '', true]);
p = LT.pickTrack([T('ja', '', true), T('en', 'asr', true)], 'vi');
assert.deepStrictEqual([p.track.languageCode, p.translate], ['en', true]);
p = LT.pickTrack([T('ja', '', true), T('fr', 'asr', true)], 'vi');
assert.deepStrictEqual([p.track.languageCode, p.translate], ['ja', true], 'không có tiếng Anh: lấy track không tự động');
p = LT.pickTrack([T('en', '', false), T('de', '', true)], 'vi');
assert.deepStrictEqual([p.track.languageCode, p.translate], ['de', true], 'bỏ track không dịch được');
p = LT.pickTrack([T('vi-VN', '', false)], 'vi');
assert.strictEqual(p.track.languageCode, 'vi-VN'); assert.strictEqual(p.translate, false);
assert.strictEqual(LT.pickTrack([], 'vi'), null);
assert.strictEqual(LT.pickTrack(undefined, 'vi'), null);
assert.strictEqual(LT.pickTrack([T('en', '', false)], 'vi'), null, 'chỉ có track không dịch được');

// --- fitRate
near(LT.fitRate(2, 4, 1.6), 1); near(LT.fitRate(3, 2, 1.6), 1.5); near(LT.fitRate(10, 2, 1.6), 1.6); near(LT.fitRate(1, 0, 1.6), 1.6);

console.log('OK: tất cả test cues.test.js đều qua');
