// Chạy trong trang YouTube (world MAIN, một mình, không phụ thuộc file nào khác). Lấy phụ đề cho content.js.
//
// Tải thẳng `baseUrl` trong danh sách track (cách các extension cũ làm) giờ trả về RỖNG vì thiếu token `pot` do trình phát tạo.
// Cách hiện nay: nhớ URL yêu cầu phụ đề của CHÍNH trình phát (đủ token), rồi tự tải lại với lang / kind / name / tlang mong muốn
// (chữ ký của URL không phủ các tham số này). Muốn tiếng Việt thì lấy track `vi`; không có thì lấy track gốc kèm `tlang=vi`
// để YouTube dịch. Phản hồi (của trình phát lẫn của mình) đều được gửi cho content.js qua window.postMessage.
(() => {
  'use strict';
  if (window.__vsHook) return;
  window.__vsHook = true;
  const post = (type, data) => window.postMessage(Object.assign({ __vs: type }, data), '*');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 150) { const v = fn(); if (v) return v; await sleep(150); } return fn(); };

  // ---- bắt phản hồi phụ đề của trình phát ----
  const isTT = u => /\/api\/timedtext/.test(String(u || ''));
  let lastUrl = null;                        // URL timedtext gần nhất của trình phát (có token)
  const bodies = new Map();                  // "videoId|lang|tlang" -> {url, body}: dùng lại, khỏi tải lại (YouTube hay trả 429 nếu dồn dập)
  const keyOf = url => { const sp = new URL(url).searchParams; return [sp.get('v'), (sp.get('lang') || '').toLowerCase(), sp.get('tlang') || ''].join('|'); };
  const remember = url => { try { lastUrl = new URL(String(url), location.href).toString(); } catch (e) {} };
  const deliver = (url, status, body) => {
    const ok = status === 200 && !!body;
    try { if (ok) { bodies.set(keyOf(url), { url: String(url), body }); if (bodies.size > 30) bodies.delete(bodies.keys().next().value); } } catch (e) {}
    post('timedtext', { url: String(url), body: ok ? body : '', status });
  };

  const origFetch = window.fetch;
  window.fetch = function (input) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (isTT(url)) { remember(url); p.then(r => r.clone().text().then(t => deliver(url, r.status, t))).catch(() => {}); }
    } catch (e) {}
    return p;
  };
  const origOpen = XMLHttpRequest.prototype.open, origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__vsUrl = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (isTT(this.__vsUrl)) {
      remember(this.__vsUrl);
      this.addEventListener('load', () => {
        try {
          const rt = this.responseType;
          let body = '';
          if (rt === '' || rt === 'text') body = this.responseText;
          else if (rt === 'json') body = JSON.stringify(this.response);
          else if (rt === 'arraybuffer') body = new TextDecoder().decode(this.response);
          deliver(this.__vsUrl, this.status, body);
        } catch (e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  // ---- chọn track và lấy phụ đề ----
  const player = () => document.getElementById('movie_player');
  let before = null;                         // trạng thái CC trước khi extension đụng vào, để trả lại khi dừng
  let chosen = null;                         // {lang, kind, name, variant, translated}

  // URL của trình phát chỉ dùng được cho ĐÚNG video đang xem: chữ ký và token gắn với videoId. Đổi video không tải lại trang
  // thì lastUrl còn là của video trước.
  let curVideo = null;
  const fresh = () => { try { return !!lastUrl && new URL(lastUrl).searchParams.get('v') === curVideo; } catch (e) { return false; } };

  const setOrDel = (sp, k, v) => { if (v) sp.set(k, v); else sp.delete(k); };
  function buildUrl() {
    if (!chosen || !fresh()) return null;
    const u = new URL(lastUrl), sp = u.searchParams;
    sp.set('lang', chosen.lang);
    setOrDel(sp, 'kind', chosen.kind); setOrDel(sp, 'name', chosen.name); setOrDel(sp, 'variant', chosen.variant);
    setOrDel(sp, 'tlang', chosen.translated ? 'vi' : '');
    sp.set('fmt', 'json3');
    return u.toString();
  }

  // Tải track đã chọn (tối đa 3 lần). Phản hồi tự được gửi cho content.js qua fetch đã hook.
  // Yêu cầu DỊCH bị 429 (YouTube chặn tạm, kéo dài nhiều phút) thì bỏ ngay để chuyển sang dự phòng, không chờ.
  async function fetchTrack() {
    for (let i = 0; i < 3; i++) {
      const url = buildUrl();
      if (!url) return false;
      let r = null;
      try { r = await window.fetch(url); } catch (e) {}
      if (r && r.status === 200 && (await r.clone().text())) return true;
      if (r && r.status === 429 && chosen.translated) return false;
      await sleep(r && r.status === 429 ? 3000 * (i + 1) : 800);
    }
    return false;
  }

  // Bước 1: gửi danh sách track cho content.js (nơi có thư viện chọn track, đã có test). Trang này không dùng lib/cues.js.
  async function listTracks() {
    const p = await waitFor(() => { const x = player(); return x && x.getPlayerResponse && x.getPlayerResponse() ? x : null; }, 6000);
    if (!p) return post('selected', { ok: false, reason: 'no-player' });
    const pr = p.getPlayerResponse(), tr = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
    curVideo = pr.videoDetails && pr.videoDetails.videoId;
    post('tracks', { videoId: curVideo, tracks: ((tr && tr.captionTracks) || []).map(t => {
      let sp = null;
      try { sp = new URL(t.baseUrl).searchParams; } catch (e) {}
      return { languageCode: t.languageCode, kind: t.kind || '', isTranslatable: t.isTranslatable, name: sp ? sp.get('name') : '', variant: sp ? sp.get('variant') : '' };
    }) });
  }

  // Bước 2: content.js đã chọn track (track + có dịch hay không); lấy phụ đề.
  async function choose(track, translated) {
    const p = player();
    if (!p || !track) return post('selected', { ok: false, reason: 'no-player' });
    chosen = { lang: track.lang, kind: track.kind || '', name: track.name || '', variant: track.variant || '', translated: !!translated };
    post('selected', { ok: true, lang: chosen.lang, translated: chosen.translated });

    // Đã tải rồi (cùng video, cùng track) thì dùng lại.
    const cached = bodies.get([curVideo, chosen.lang.toLowerCase(), chosen.translated ? 'vi' : ''].join('|'));
    if (cached) return post('timedtext', { url: cached.url, body: cached.body, status: 200 });

    // Cần một URL có token của trình phát cho video này: chưa có thì bật CC để trình phát tải thử một lần.
    if (!fresh()) {
      if (!before) before = { on: p.isSubtitlesOn() };
      p.loadModule('captions');
      if (!p.isSubtitlesOn()) p.toggleSubtitlesOn();
      await waitFor(fresh, 4000);
      if (!fresh()) {                        // trình phát chưa tải gì: chọn đúng track để ép nó tải
        p.setOption('captions', 'track', chosen.translated
          ? { languageCode: chosen.lang, translationLanguage: { languageCode: 'vi', languageName: 'Vietnamese' } }
          : { languageCode: chosen.lang });
        await waitFor(fresh, 4000);
      }
    }
    if (await fetchTrack()) return;
    if (chosen.translated) {
      // YouTube không chịu dịch: lấy phụ đề GỐC (không bị chặn), content.js sẽ tự dịch từng câu bằng Google Dịch.
      chosen.translated = false;
      post('selected', { ok: true, lang: chosen.lang, translated: false, needTranslate: true });
      const hit = bodies.get([curVideo, chosen.lang.toLowerCase(), ''].join('|'));
      if (hit) return post('timedtext', { url: hit.url, body: hit.body, status: 200 });
      if (await fetchTrack()) return;
    }
    post('fetched', { ok: false });
  }

  // CC đã bật sẵn / token cũ không dùng được: tắt rồi bật CC để trình phát tải lại và cho một URL mới.
  async function reload() {
    const p = player();
    if (!p || !p.toggleSubtitles) return;
    p.toggleSubtitles(); await sleep(400); p.toggleSubtitles();
    await sleep(1500);
    await fetchTrack();
  }

  function restore() {
    const p = player();
    if (p && before && !before.on && p.isSubtitlesOn()) p.toggleSubtitles();
    before = null;
  }

  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window || !d || !d.__vsCmd) return;
    if (d.__vsCmd === 'select') listTracks();
    else if (d.__vsCmd === 'choose') choose(d.track, d.translated);
    else if (d.__vsCmd === 'reload') reload();
    else if (d.__vsCmd === 'restore') restore();
  });
})();
