// Logic thuần (không đụng DOM/chrome.*): phụ đề YouTube -> các câu để đọc. Gắn vào window.LT hoặc module.exports (node test).
(function (root) {
  'use strict';

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENT[e.toLowerCase()] || m;
    });
  }

  // Bỏ thẻ, ký hiệu hiệu ứng như [Music], ♪; rỗng nếu không còn gì để đọc.
  function cleanText(s) {
    s = String(s || '').replace(/<[^>]*>/g, '');
    s = decodeEntities(s).replace(/\[[^\]]*\]/g, '').replace(/[♪♫]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  // ---------- Phụ đề YouTube (json3 hoặc xml) -> [{start, end, text}] (giây) ----------

  function parseJson3(obj) {
    const cues = [];
    for (const e of (obj && obj.events) || []) {
      if (!e.segs) continue;
      const t = cleanText(e.segs.map(s => s.utf8 || '').join(''));
      if (!t) continue;                                          // bỏ cả dòng "\n" của phụ đề cuốn
      const start = (e.tStartMs || 0) / 1000;
      cues.push({ start, end: e.dDurationMs ? start + e.dDurationMs / 1000 : NaN, text: t });
    }
    return cues;
  }

  function parseXml(xml) {
    const cues = [];
    let m;
    const reText = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;   // định dạng cũ (giây)
    while ((m = reText.exec(xml))) {
      const t = cleanText(decodeEntities(m[3]));
      if (t) cues.push({ start: +m[1], end: m[2] ? +m[1] + +m[2] : NaN, text: t });
    }
    const reP = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;                       // srv3 (mili giây)
    while ((m = reP.exec(xml))) {
      const t = cleanText(decodeEntities(m[3]));
      if (t) cues.push({ start: +m[1] / 1000, end: m[2] ? (+m[1] + +m[2]) / 1000 : NaN, text: t });
    }
    return cues;
  }

  function parseCaptions(body) {
    const s = String(body || '').trim();
    if (!s) return [];
    if (s[0] === '{') { try { return parseJson3(JSON.parse(s)); } catch (e) { return []; } }
    if (s[0] === '<') return parseXml(s);
    return [];
  }

  // Sắp xếp, điền end thiếu, cắt phần chồng lấn (phụ đề cuốn của YouTube), bỏ trùng.
  function normalizeCues(cues) {
    const sorted = cues.filter(x => x && Number.isFinite(x.start) && x.text)
      .map(x => ({ start: x.start, end: x.end, text: x.text }))
      .sort((a, b) => a.start - b.start);
    const c = sorted.filter((x, i) => !(i && sorted[i - 1].start === x.start && sorted[i - 1].text === x.text));
    const out = [];
    for (let i = 0; i < c.length; i++) {
      const x = c[i], nxt = c[i + 1];
      let end = x.end;
      if (!Number.isFinite(end) || end <= x.start) end = nxt ? Math.min(nxt.start, x.start + 5) : x.start + 3;
      if (nxt && nxt.start > x.start && end > nxt.start) end = nxt.start;
      out.push({ start: x.start, end: Math.max(end, x.start + 0.2), text: x.text });
    }
    return out;
  }

  // Ghép các mảnh ngắn thành câu để đọc liền mạch hơn (mỗi câu <= 150 ký tự vì giọng Google chỉ nhận ~200).
  function mergeCues(cues, o) {
    o = o || {};
    const maxGap = o.maxGap == null ? 0.7 : o.maxGap, maxChars = o.maxChars || 150, maxDur = o.maxDur || 10;
    const out = [];
    let cur = null;
    for (const c of cues) {
      const ends = cur && /[.!?…。！？]["')\]]?$/.test(cur.text);
      if (cur && !ends && c.start - cur.end <= maxGap &&
          cur.text.length + 1 + c.text.length <= maxChars && c.end - cur.start <= maxDur) {
        cur.text += ' ' + c.text;
        cur.end = Math.max(cur.end, c.end);
      } else {
        if (cur) out.push(cur);
        cur = { start: c.start, end: c.end, text: c.text };
      }
    }
    if (cur) out.push(cur);
    return out.map((x, i) => Object.assign(x, { id: i }));
  }

  // Chỉ số câu đầu tiên chưa kết thúc tại thời điểm t (tìm nhị phân). Bằng độ dài mảng nếu đã qua hết.
  function findIndex(cues, t) {
    let lo = 0, hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].end > t) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  // ---------- Chọn track phụ đề ----------
  // tracks: captionTracks của YouTube [{languageCode, kind ('asr' = tự động), isTranslatable}].
  // Có tiếng Việt thì dùng luôn (bản do người làm được ưu tiên hơn bản tự động). Không thì lấy tiếng Anh
  // (hoặc track khác dịch được) và nhờ YouTube dịch sang tiếng Việt: translate = true.
  function pickTrack(tracks, lang) {
    const list = (tracks || []).filter(t => t && t.languageCode);
    const best = (arr, code) => {
      const m = arr.filter(t => t.languageCode === code || t.languageCode.startsWith(code + '-'));
      return m.find(t => t.kind !== 'asr') || m[0] || null;
    };
    const direct = best(list, lang);
    if (direct) return { track: direct, translate: false };
    const tr = list.filter(t => t.isTranslatable !== false);
    const src = best(tr, 'en') || tr.find(t => t.kind !== 'asr') || tr[0] || null;
    return src ? { track: src, translate: true } : null;
  }

  // Tốc độ đọc để một câu vừa khoảng trống `slot` giây: nhanh lên khi dài hơn chỗ trống, tối đa `max`, không chậm hơn 1.
  function fitRate(dur, slot, max) {
    slot = Math.max(slot, 0.4);
    return dur > slot ? Math.min(max || 1.6, dur / slot) : 1;
  }

  const api = { cleanText, parseJson3, parseXml, parseCaptions, normalizeCues, mergeCues, findIndex, pickTrack, fitRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LT = api;
})(typeof window !== 'undefined' ? window : globalThis);
