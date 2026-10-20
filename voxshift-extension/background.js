// Hai việc, đều gọi Google Dịch và làm ở đây (không phải content script) vì trang YouTube không cho gọi tên miền khác:
//  - 'tts': lấy file âm thanh tiếng Việt khi máy không có giọng tiếng Việt.
//  - 'translate': dịch một câu sang tiếng Việt (dự phòng khi YouTube không chịu dịch phụ đề).
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fetchTts(text) {
  const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=' + encodeURIComponent(String(text).slice(0, 200));
  let r;
  try { r = await fetch(url); } catch (e) { return { ok: false, error: 'Không có mạng' }; }
  if (!r.ok) return { ok: false, error: 'Google TTS lỗi ' + r.status };
  return { ok: true, b64: toBase64(await r.arrayBuffer()) };
}

// Dịch một câu sang tiếng Việt (dự phòng khi YouTube không chịu dịch phụ đề).
async function translate(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=' + encodeURIComponent(String(text).slice(0, 500));
  let r;
  try { r = await fetch(url); } catch (e) { return { ok: false, error: 'Không có mạng' }; }
  if (!r.ok) return { ok: false, error: 'Google Dịch lỗi ' + r.status };
  const d = await r.json();
  const out = ((d && d[0]) || []).map(s => s && s[0]).filter(Boolean).join('').trim();
  return out ? { ok: true, text: out } : { ok: false, error: 'Bản dịch rỗng' };
}

chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (!m || (m.type !== 'tts' && m.type !== 'translate')) return false;
  (m.type === 'tts' ? fetchTts(m.text) : translate(m.text)).then(send, e => send({ ok: false, error: String(e && e.message || e) }));
  return true;
});
