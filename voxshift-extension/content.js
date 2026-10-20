// VoxShift — content script (YouTube).
// Phụ đề tiếng Việt (hoặc phụ đề gốc do YouTube dịch sang tiếng Việt) -> đọc thành tiếng đúng thời điểm của video.
// Giọng đọc: giọng tiếng Việt của trình duyệt nếu có, không thì giọng Google (lấy qua background.js).
(() => {
  'use strict';
  if (window.__vsLoaded) return;
  window.__vsLoaded = true;
  const LT = window.LT;
  if (!LT) console.error('[VoxShift] Không thấy window.LT: lib/cues.js chưa được nạp trước content.js');

  // voice: '' = tự động, 'google' = giọng Google, hoặc tên một giọng của máy. Tốc độ đọc tự khớp theo độ dài câu, không chỉnh tay.
  const DEFAULTS = { voice: '', origVolume: 0.2 };
  let cfg = Object.assign({}, DEFAULTS);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const S = {
    active: false, video: null, timer: null,
    cues: [], idx: 0,                   // các câu để đọc và con trỏ tới câu kế tiếp
    expect: null, got: new Map(),       // track đang chờ; phụ đề đã bắt được theo "videoId|lang|tlang"
    status: '', langLabel: '', err: '', blocked: false,
    selectAt: 0, reloaded: false, empty: 0, lastStatus: 0, needTranslate: false, selected: false, origVol: null, listeners: [],
    engine: 'google', voice: null, engineReady: false, token: 0, audio: null, loading: 0,
  };

  const vid = () => { const u = new URL(location.href); return u.searchParams.get('v') || (/\/(?:shorts|live)\/([\w-]+)/.exec(u.pathname) || [])[1] || ''; };
  const findVideo = () => document.querySelector('#movie_player video.html5-main-video') || document.querySelector('video');
  const isAd = () => { const p = document.getElementById('movie_player'); return !!(p && p.classList.contains('ad-showing')); };
  const cmd = name => window.postMessage({ __vsCmd: name }, '*');

  // ---------- cấu hình ----------
  chrome.storage.local.get(DEFAULTS, v => { cfg = Object.assign({}, DEFAULTS, v); if (!S.active) chooseEngine(); });
  chrome.storage.onChanged.addListener(ch => {
    for (const k in ch) cfg[k] = ch[k].newValue;
    if (ch.voice) { stopSpeech(); chooseEngine(); }            // người dùng chủ động đổi giọng trong popup
    if (S.active && S.video && ch.origVolume) S.video.volume = clamp(cfg.origVolume, 0, 1);
  });

  // ---------- chọn giọng ----------
  function chooseEngine() {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    let v = null;
    if (cfg.voice && cfg.voice !== 'google') v = voices.find(x => x.name === cfg.voice) || null;
    if (!v && cfg.voice !== 'google') v = voices.find(x => /^vi/i.test(x.lang)) || null;
    S.voice = v;
    S.engine = v ? 'voice' : 'google';
  }
  // Chrome nạp danh sách giọng của máy chậm vài giây. Giọng chỉ được chốt MỘT lần lúc bắt đầu (start() chờ danh sách giọng) và giữ nguyên
  // suốt phiên: nếu để đổi giữa chừng khi danh sách giọng vừa nạp xong thì sẽ nghe hai giọng đọc xen nhau.
  if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => { if (!S.active) chooseEngine(); });
  async function waitVoices() {
    if (!window.speechSynthesis || speechSynthesis.getVoices().length) return;
    await new Promise(res => {
      const t = setTimeout(res, 1500);
      speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true });
    });
  }

  // ---------- phụ đề ----------
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || !d || !d.__vs) return;
    if (d.__vs === 'timedtext') onTimedText(d);
    else if (d.__vs === 'tracks') onTracks(d);
    else if (d.__vs === 'selected') onSelected(d);
  });

  // Trang gửi danh sách track của video; chọn track (tiếng Việt, hoặc gốc + dịch) rồi báo lại để trang đi lấy phụ đề.
  function onTracks(d) {
    if (!S.active) return;
    const pick = LT.pickTrack(d.tracks, 'vi');
    if (!pick) { S.selected = true; S.status = 'Video không có phụ đề'; return; }
    const t = pick.track;
    window.postMessage({ __vsCmd: 'choose', translated: pick.translate,
      track: { lang: t.languageCode, kind: t.kind || '', name: t.name || '', variant: t.variant || '' } }, '*');
  }

  function onTimedText(d) {
    let u;
    try { u = new URL(d.url); } catch (e) { return; }
    const key = [u.searchParams.get('v'), (u.searchParams.get('lang') || '').toLowerCase(), u.searchParams.get('tlang') || ''].join('|');
    if (!d.body) { S.empty++; if (d.status) S.lastStatus = d.status; return; }   // rỗng / lỗi (429, 403...): không ghi đè bản đã có
    S.got.set(key, d.body);
    if (S.got.size > 20) S.got.delete(S.got.keys().next().value);
    if (S.active) tryApply();
  }

  function onSelected(d) {
    if (!S.active) return;
    S.selected = true;
    if (!d.ok) { S.status = d.reason === 'no-captions' ? 'Video không có phụ đề' : 'Không thấy trình phát'; return; }
    S.needTranslate = !!d.needTranslate;             // YouTube không chịu dịch: phụ đề gốc về đây, tự dịch từng câu
    S.expect = { v: vid(), lang: d.lang, translated: d.translated, done: false };
    S.langLabel = d.translated || d.needTranslate ? 'Dịch từ phụ đề ' + d.lang.toUpperCase() : 'Phụ đề tiếng Việt';
    S.status = 'Đang tải phụ đề…';
    tryApply();
  }

  // Tìm trong các phụ đề đã bắt được bản khớp track đã chọn (đúng video, đúng ngôn ngữ, đúng có/không dịch).
  function tryApply() {
    const e = S.expect;
    if (!e || e.done) return;
    const base = e.lang.toLowerCase().split('-')[0];
    for (const [key, body] of S.got) {
      const [v, lang, tlang] = key.split('|');
      if (v !== e.v || lang.split('-')[0] !== base || tlang !== (e.translated ? 'vi' : '')) continue;
      const cues = LT.mergeCues(LT.normalizeCues(LT.parseCaptions(body)));
      if (!cues.length) continue;
      S.cues = cues;
      S.idx = LT.findIndex(cues, S.video ? S.video.currentTime : 0);
      e.done = true;
      S.status = S.langLabel;
      return;
    }
  }

  function requestSelect() {
    S.cues = []; S.idx = 0; S.expect = null; S.selected = false; S.reloaded = false; S.empty = 0; S.lastStatus = 0; S.needTranslate = false; S.err = '';
    S.status = 'Đang tải phụ đề…'; S.selectAt = Date.now();
    cmd('select');
  }

  // Chờ phụ đề (trang tự tải, có thử lại khi bị 429). Quá 9s chưa có thì nhờ trang tắt/bật CC để lấy token mới; quá 20s thì báo lỗi.
  function waiting() {
    const dt = Date.now() - S.selectAt;
    if (S.selected && S.expect && !S.expect.done) {
      if (dt > 9000 && !S.reloaded) { S.reloaded = true; cmd('reload'); }
      if (dt > 20000) {
        const e = S.expect;
        S.status = (S.lastStatus === 429 ? 'YouTube tạm chặn, thử lại sau' : S.empty ? 'YouTube không trả phụ đề' : 'Không nhận được phụ đề') +
          ' (' + e.lang.toUpperCase() + (e.translated ? '→VI' : '') + ')';
      }
    } else if (!S.selected && dt > 8000) S.status = 'Không thấy phụ đề';
  }

  // ---------- đọc ----------
  function stopSpeech() {
    S.token++;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (S.audio) { try { S.audio.pause(); } catch (e) {} S.audio = null; }
  }

  const b64ToBytes = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const ask = msg => new Promise(res => chrome.runtime.sendMessage(msg, x => res(chrome.runtime.lastError ? null : x)));

  // Dự phòng khi YouTube không chịu dịch: phụ đề gốc được dịch từng câu bằng Google Dịch ngay trước khi đọc (và tải trước cho các câu sắp tới).
  function ensureVi(c) {
    if (!S.needTranslate || c._vi) return Promise.resolve(c);
    if (c._tp) return c._tp;
    c._tp = (async () => {
      const r = await ask({ type: 'translate', text: c.text });
      if (!r || !r.ok) throw new Error(r && r.error || 'Không dịch được');
      c.text = r.text; c._vi = true;
      return c;
    })();
    c._tp.catch(e => { c._tp = null; S.err = String(e.message || e); });
    return c._tp;
  }

  // Giọng Google: tải trước file âm thanh của các câu sắp tới (tối đa 3 yêu cầu cùng lúc).
  function ensureAudio(c) {
    if (c._p) return c._p;
    c._p = (async () => {
      await ensureVi(c);
      while (S.loading >= 3) await sleep(80);
      S.loading++;
      try {
        const r = await ask({ type: 'tts', text: c.text });
        if (!r || !r.ok) throw new Error(r && r.error || 'Không tải được giọng Google');
        c._url = URL.createObjectURL(new Blob([b64ToBytes(r.b64)], { type: 'audio/mpeg' }));
        const a = new Audio(c._url);
        await new Promise((ok, no) => { a.addEventListener('loadedmetadata', ok, { once: true }); a.addEventListener('error', () => no(new Error('Âm thanh lỗi')), { once: true }); });
        S.err = '';
        return a;
      } finally { S.loading--; }
    })();
    c._p.catch(e => { c._p = null; S.err = String(e.message || e); });
    return c._p;
  }

  function prefetch(t) {
    for (let i = S.idx, n = 0; i < S.cues.length && n < 8 && S.cues[i].start < t + 25; i++, n++) {
      const c = S.cues[i];
      (S.engine === 'google' ? ensureAudio(c) : ensureVi(c)).catch(() => {});
    }
    for (let i = Math.max(0, S.idx - 30); i < S.idx - 5; i++) {          // giải phóng các câu đã qua xa
      const c = S.cues[i];
      if (c._url) { URL.revokeObjectURL(c._url); c._url = null; c._p = null; }
    }
  }

  // Đọc một câu. `slot` = số giây có thể dùng (tới câu kế); câu dài hơn thì đọc nhanh lên cho vừa.
  function speak(c, slot) {
    stopSpeech();                                    // câu cũ còn đang đọc thì cắt để bám sát hình
    const token = S.token, pr = (S.video && S.video.playbackRate) || 1;
    const late = () => token !== S.token || !S.active || S.video.currentTime > c.end + 0.3;   // chờ dịch/tải xong thì đã quá trễ
    if (S.engine === 'voice') {
      ensureVi(c).then(() => {
        if (late()) return;
        const rate = clamp(LT.fitRate(c.text.length / 14, slot, 2) * pr, 0.5, 3);   // ~14 ký tự/giây ở tốc độ 1
        const u = new SpeechSynthesisUtterance(c.text);
        u.voice = S.voice; u.lang = S.voice.lang; u.rate = rate;
        u.onerror = e => { if (e.error === 'not-allowed') S.blocked = true; };
        speechSynthesis.speak(u);
      }).catch(() => {});
      return;
    }
    ensureAudio(c).then(a => {
      if (late()) return;
      a.playbackRate = clamp(LT.fitRate(isFinite(a.duration) ? a.duration : slot, slot, 1.7) * pr, 0.5, 4);
      a.currentTime = 0;
      S.audio = a;
      a.play().then(() => { S.blocked = false; }).catch(e => { if (e.name === 'NotAllowedError') S.blocked = true; });
    }).catch(() => {});
  }

  function tick() {
    if (!S.active) return;
    const v = S.video;
    if (!v || !v.isConnected) { S.video = findVideo(); bindVideo(S.video); return; }
    if (!S.cues.length) { waiting(); return; }
    if (!S.engineReady) return;                                             // chưa chốt giọng đọc
    if (v.paused || v.seeking || isAd()) { stopSpeech(); return; }
    const t = v.currentTime;
    while (S.idx < S.cues.length && S.cues[S.idx].end <= t - 0.25) S.idx++;
    if (S.engine === 'google' || S.needTranslate) prefetch(t);
    const c = S.cues[S.idx];
    if (!c || c.start > t + 0.05) return;
    S.idx++;
    if (t - c.start > 2) return;                                            // tua/tiếp tục giữa câu: bỏ câu đã qua quá nửa
    const nxt = S.cues[S.idx];
    speak(c, Math.max(c.end - c.start, (nxt ? nxt.start : c.end + 2) - c.start));
  }

  // ---------- video ----------
  function bindVideo(v) {
    unbindVideo();
    if (!v) return;
    const on = (e, f) => { v.addEventListener(e, f); S.listeners.push([v, e, f]); };
    const resync = () => { S.idx = LT.findIndex(S.cues, v.currentTime); };
    on('pause', stopSpeech); on('seeking', stopSpeech); on('seeked', resync); on('playing', resync);
    if (S.origVol == null) S.origVol = v.volume;
    v.volume = clamp(cfg.origVolume, 0, 1);                                  // hạ tiếng gốc để nghe giọng đọc
  }
  function unbindVideo() { S.listeners.forEach(([v, e, f]) => v.removeEventListener(e, f)); S.listeners = []; }

  // YouTube đổi video mà không tải lại trang.
  document.addEventListener('yt-navigate-finish', () => {
    if (!S.active) return;
    stopSpeech();
    S.video = findVideo(); bindVideo(S.video);
    requestSelect();
  });

  // ---------- bật / tắt ----------
  function start() {
    if (S.active || !LT) return;
    const v = findVideo();
    if (!v) { S.status = 'Không thấy video'; return; }
    S.active = true; S.video = v; S.origVol = null; S.engineReady = false;
    chooseEngine();                                  // tạm thời, để popup hiện giọng; chốt thật sau khi danh sách giọng đã nạp
    waitVoices().then(() => { if (S.active) { chooseEngine(); S.engineReady = true; } });
    bindVideo(v);
    requestSelect();
    S.timer = setInterval(tick, 150);
  }

  function stop() {
    if (!S.active) return;
    S.active = false;
    clearInterval(S.timer); S.timer = null;
    stopSpeech(); unbindVideo();
    if (S.video && S.origVol != null) S.video.volume = S.origVol;
    S.origVol = null;
    S.cues.forEach(c => { if (c._url) URL.revokeObjectURL(c._url); });
    S.cues = []; S.expect = null; S.status = ''; S.err = '';
    cmd('restore');
  }
  window.addEventListener('pagehide', stop);

  function info() {
    return { active: S.active, engine: S.engine, voice: S.engine === 'voice' ? S.voice.name : 'Google',
      error: LT ? '' : 'Thiếu lib/cues.js: tải lại extension rồi F5',
      status: !S.active ? '' : S.err || (S.blocked ? 'Bấm vào trang để bật tiếng' : S.status) };
  }

  chrome.runtime.onMessage.addListener((m, sender, send) => {
    if (!m || typeof m.type !== 'string') return false;
    if (m.type === 'vs-toggle') { S.active ? stop() : start(); send(info()); }
    else if (m.type === 'vs-status') send(info());
    return false;
  });
})();
