/*!
 * Menu3D — lõi của menu-3D-extension (menu 3D carousel).
 * Được content.js gọi: Menu3D.init(options) với cài đặt từ popup của extension.
 */
(function () {
    'use strict';

    const VERSION = '3.1.0';

    const PAGE_EXT = /\.(html?|php|aspx?|jsp)$/i;

    const DEFAULTS = {
        // --- Tự tìm trang ---
        max: 100,                      // tối đa số trang (kể cả trang đang mở)
        // --- Giao diện ---
        preview: 'image',              // 'image' = ảnh chụp cả trang, 'iframe' = trang chạy trực tiếp
        breakpoint: 700,
        cameraOffset: 0,
        gap: 2,                        // khoảng hở tối thiểu giữa 2 card cạnh nhau (vw)
        autoRotateSpeed: 0.2,
        scrollRotateSpeed: 4,
        indexUp: 2147483000,           // z-index cao để nằm trên mọi thứ của trang
        timeAuto: 3000,
        iconClosed: null,
        iconOpen: null,
        trigger: 'button',             // mở/đóng menu: 'button' = nút nổi | 'rightclick' = chuột phải (Shift + chuột phải = menu trình duyệt)
        // itemWidth × itemHeight = khung tối đa; card co theo tỉ lệ ảnh chụp cả trang (dài → cao, ngắn → ngang)
        desktop: { perspective: 55, radius: 26, itemWidth: 24, itemHeight: 32, toggleSize: 4, labelFontSizeRatio: 0.5 },
        mobile: { perspective: 70, radius: 50, itemWidth: 30, itemHeight: 50, toggleSize: 15, labelFontSizeRatio: 0.5 }
    };

    const svgIcon = body => 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
        '<circle cx="24" cy="24" r="22" fill="rgba(0,0,0,.6)" stroke="#fff" stroke-width="2"/>' +
        '<g stroke="#fff" stroke-width="3" stroke-linecap="round">' + body + '</g></svg>');
    const SVG_CLOSED = svgIcon('<path d="M15 17h18M15 24h18M15 31h18"/>');
    const SVG_OPEN = svgIcon('<path d="M17 17l14 14M31 17L17 31"/>');

    // ================= CONFIG =================

    function mergeConfig(...layers) {
        const out = { ...DEFAULTS, desktop: { ...DEFAULTS.desktop }, mobile: { ...DEFAULTS.mobile } };
        for (const layer of layers) {
            if (!layer) continue;
            for (const [k, v] of Object.entries(layer)) {
                if (v === undefined || v === null) continue;
                if ((k === 'desktop' || k === 'mobile') && typeof v === 'object') out[k] = { ...out[k], ...v };
                else out[k] = v;
            }
        }
        return out;
    }

    // ================= TỰ TÌM TRANG =================

    const toUrl = (href, base) => {
        try { return new URL(href, base || location.href); } catch (_) { return null; }
    };
    const pageKey = u => u.origin + u.pathname.replace(/\/index\.html?$/i, '/') + u.search;
    const currentUrl = toUrl(location.href);
    const currentKey = pageKey(currentUrl);

    function isPage(u) {
        if (!u || u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return false;
        const last = u.pathname.split('/').pop();
        return !last.includes('.') || PAGE_EXT.test(last);
    }

    function titleFromUrl(u) {
        const segs = u.pathname.split('/').filter(Boolean);
        let name = segs.pop() || '';
        if (/^index\.html?$/i.test(name)) name = segs.pop() || '';
        try { name = decodeURIComponent(name); } catch (_) {}
        name = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
        return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Home';
    }

    // Chuẩn hóa danh sách thô → [{ url, title, titleLocked, current }]
    function makeCleaner(cfg) {
        return list => {
            const seen = new Set([currentKey]);
            const out = [];
            for (const it of list) {
                const u = toUrl(it.path);
                if (!isPage(u)) continue;
                const key = pageKey(u);
                if (seen.has(key)) continue;
                seen.add(key);
                const title = it.title || '';
                out.push({ url: u.href, key, title: title || titleFromUrl(u), titleLocked: !!title });
            }
            return out;
        };
    }

    const linkText = a => (a.textContent || a.getAttribute('aria-label') || a.title || '').trim().replace(/\s+/g, ' ');

    // Tìm trang: link trong <nav>/<header>, không có thì lấy mọi <a href> của trang
    function discoverLinks(cfg) {
        const clean = makeCleaner(cfg);
        const pick = sel => clean(Array.from(document.querySelectorAll(sel))
            .filter(a => !a.hasAttribute('download'))
            .map(a => ({ path: a.href, title: linkText(a) })));
        const items = pick('nav a[href], header a[href]');
        return items.length ? items : pick('a[href]');
    }

    function currentItem(cfg) {
        const title = document.title.trim();
        return { url: location.href, key: currentKey, title: title || titleFromUrl(currentUrl), titleLocked: !!title };
    }

    // ================= ẢNH CHỤP TRANG =================

    const SHOT_WIDTH = 800;      // px, bề ngang tối đa của ảnh (đủ nét cho card ở màn hình PC)
    const SHOT_HEIGHT = 2400;    // px, bề dọc tối đa của ảnh (trang dài thì thu nhỏ lại)
    const MAX_PAGE_HEIGHT = 20000; // px, trang dài hơn thì chỉ chụp tới đây
    const SHOT_CACHE_PREFIX = 'full:'; // đổi khi đổi kiểu chụp → ảnh cũ tự bỏ
    const SHOT_TTL = 24 * 3600e3;      // ảnh chụp giữ tối đa 24 giờ rồi xóa
    // Thư viện chụp ảnh được extension nạp sẵn (lib/modern-screenshot.js, xem manifest.json)
    const loadShotLib = async () => {
        if (!window.modernScreenshot) throw new Error('chưa nạp lib/modern-screenshot.js');
        return window.modernScreenshot;
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Ảnh chụp lưu trong IndexedDB của site để lần sau mở menu là có ngay
    const shotCache = (() => {
        let dbp = null;
        const db = () => dbp || (dbp = new Promise((resolve, reject) => {
            const req = indexedDB.open('menu3d', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('shots');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }));
        const run = (mode, fn) => db().then(d => new Promise((resolve, reject) => {
            const req = fn(d.transaction('shots', mode).objectStore('shots'));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }));
        return {
            get: key => run('readonly', st => st.get(key)).catch(() => null),
            set: (key, val) => run('readwrite', st => st.put(val, key)).catch(() => {}),
            // Xóa hẳn ảnh quá 24 giờ (và ảnh kiểu cũ không còn dùng)
            prune: () => db().then(d => new Promise(resolve => {
                const tx = d.transaction('shots', 'readwrite');
                const req = tx.objectStore('shots').openCursor();
                req.onsuccess = () => {
                    const cursor = req.result;
                    if (!cursor) return;
                    const v = cursor.value;
                    const stale = !String(cursor.key).startsWith(SHOT_CACHE_PREFIX) || !v || Date.now() - v.t >= SHOT_TTL;
                    if (stale) cursor.delete();
                    cursor.continue();
                };
                tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
            })).catch(() => {})
        };
    })();

    // Chờ trang "đứng yên" rồi mới chụp: DOM không đổi trong 0,5s, ảnh đã tải xong và không còn
    // hiệu ứng CSS chạy dở (hiệu ứng lặp vô hạn không tính). Tối thiểu `min` ms, tối đa `max` ms.
    const SETTLE_QUIET = 500;
    function waitForSettle(doc, min, max) {
        return new Promise(resolve => {
            const start = Date.now();
            let lastChange = start;
            const observer = new MutationObserver(() => (lastChange = Date.now()));
            observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
            const imagesLoaded = () => Array.from(doc.images).every(img => img.complete);
            const animating = () => {
                try {
                    return doc.getAnimations().some(a => a.playState === 'running' &&
                        a.effect && a.effect.getTiming().iterations !== Infinity);
                } catch (_) {
                    return false;
                }
            };
            const timer = setInterval(() => {
                const now = Date.now();
                const settled = now - start >= min && now - lastChange >= SETTLE_QUIET &&
                    imagesLoaded() && !animating();
                if (settled || now - start >= max) {
                    clearInterval(timer);
                    observer.disconnect();
                    resolve();
                }
            }, 100);
        });
    }

    // Tải trang vào iframe ẩn (kích thước = cửa sổ hiện tại), chụp CẢ TRANG (hết chiều dài/ngang) rồi bỏ iframe
    async function capturePage(container, url) {
        const lib = await loadShotLib();
        const w = window.innerWidth, h = window.innerHeight;
        if (!w || !h) throw new Error('cửa sổ đang thu nhỏ');
        const frame = document.createElement('iframe');
        frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;` +
            'border:0;opacity:0;pointer-events:none;z-index:-2147483647;';
        container.appendChild(frame);
        try {
            // Trang nặng (quảng cáo, video...) có thể lâu mới xong `load` → quá 8s thì chụp luôn phần đã hiện
            await new Promise(resolve => {
                const timer = setTimeout(resolve, 8000);
                frame.onload = () => { clearTimeout(timer); resolve(); };
                frame.src = url;
            });
            let doc = null;
            try { doc = frame.contentDocument; } catch (_) {}
            if (!doc || !doc.documentElement || doc.URL === 'about:blank') {
                throw new Error('không đọc được trang (khác domain hoặc bị chặn nhúng)');
            }
            await waitForSettle(doc, 1200, 3000); // JS hay đổi nội dung trong ~1s đầu → chờ tối thiểu 1,2s
            // Cuộn hết trang để ảnh lazy-load / hiệu ứng hiện khi cuộn kịp chạy, rồi về đầu trang
            const win = frame.contentWindow;
            const pageHeight = () => Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
            for (let y = h, i = 0; y < pageHeight() && i < 20; y += h, i++) {
                win.scrollTo(0, y);
                await sleep(150);
            }
            win.scrollTo(0, 0);
            await waitForSettle(doc, 300, 2000); // ảnh lazy-load / hiệu ứng khi cuộn vừa được kích hoạt

            const width = Math.max(w, doc.documentElement.scrollWidth);
            const height = Math.min(Math.max(h, pageHeight()), MAX_PAGE_HEIGHT);
            const data = await Promise.race([
                lib.domToJpeg(doc.documentElement, {
                    width,
                    height,
                    scale: Math.min(1, SHOT_WIDTH / width, SHOT_HEIGHT / height),
                    quality: 0.75,
                    backgroundColor: '#fff'
                }),
                sleep(30000).then(() => { throw new Error('chụp quá 30s'); })
            ]);
            if (!data || data.length < 100) throw new Error('ảnh chụp rỗng'); // không lưu ảnh hỏng vào cache
            return { data, width, height, title: (doc.title || '').trim() };
        } finally {
            frame.remove();
        }
    }

    // ================= GIAO DIỆN =================

    const CSS = `
:host { all: initial; }

.m3d-menu {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
  visibility: hidden;
  touch-action: none;
  user-select: none;
}

.m3d-menu.m3d-open { visibility: visible; }

.m3d-scene {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-style: preserve-3d;
  transform: translate(-50%, -50%);
}

.m3d-item {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--m3d-item-w);
  height: var(--m3d-item-h);
  box-sizing: border-box;
  transform-origin: center center;
  background: rgba(255, 255, 255, 0.1);
  border: 0.1vw solid #fff;
  overflow: hidden;
}

.m3d-item { cursor: pointer; }

.m3d-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill; /* card cùng tỉ lệ với ảnh → phủ kín 100%, không cắt */
  pointer-events: none;
}

.m3d-item.m3d-loading::before {
  content: '';
  position: absolute;
  top: calc(42% - 1.2vw);
  left: calc(50% - 1.2vw);
  width: 2.4vw;
  height: 2.4vw;
  box-sizing: border-box;
  border: 0.25vw solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: m3d-spin 1s linear infinite;
}

@keyframes m3d-spin {
  to { transform: rotate(360deg); }
}

/* Iframe render đúng kích thước màn hình thật rồi thu nhỏ (scale) cho vừa card
   → trang thấy mình đang ở màn hình PC, layout giống hệt trang gốc */
.m3d-item iframe {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  border: none;
  background: #fff;
  transform-origin: 0 0;
}

/* Lớp chắn trên iframe: chỉ cho cuộn trang bên trong, bấm vào là bấm card */
.m3d-shield {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.m3d-label {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: max(calc(var(--m3d-item-w) * 0.09), 20px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  text-decoration: none;
}

.m3d-current .m3d-label { background: rgba(255, 255, 255, 0.25); }

.m3d-label-text {
  display: inline-block;
  padding: 0 10px;
  white-space: nowrap;
}

.m3d-label.m3d-scrolling { justify-content: flex-start; }

.m3d-label.m3d-scrolling .m3d-label-text {
  animation: m3d-marquee var(--m3d-dur) linear infinite;
}

.m3d-label.m3d-scrolling:hover .m3d-label-text { animation-play-state: paused; }

@keyframes m3d-marquee {
  from { transform: translateX(var(--m3d-from)); }
  to { transform: translateX(var(--m3d-to)); }
}

.m3d-toggle {
  position: fixed;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  touch-action: none;
  transition: top 0.25s ease, left 0.25s ease;
}

.m3d-toggle.m3d-dragging {
  cursor: grabbing;
  transition: none !important;
}

.m3d-toggle img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
`;

    const el = (tag, className) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    };
    const num = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const toVw = px => (px / Math.max(1, window.innerWidth)) * 100;

    function createMenu(cfg, items) {
        const offs = [];
        const on = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            offs.push(() => target.removeEventListener(type, fn, opts));
        };

        // Shadow DOM để CSS của menu và của trang không ảnh hưởng nhau
        const host = el('div');
        host.setAttribute('data-menu3d', '');
        const root = host.attachShadow({ mode: 'open' });
        const style = el('style');
        style.textContent = CSS;
        const menu = el('div', 'm3d-menu');
        const scene = el('div', 'm3d-scene');
        menu.appendChild(scene);
        const toggleBtn = el('button', 'm3d-toggle');
        toggleBtn.type = 'button';
        const toggleImg = el('img');
        toggleImg.alt = '';
        toggleImg.draggable = false;
        toggleBtn.appendChild(toggleImg);
        root.append(style, menu, toggleBtn);
        if (cfg.trigger === 'rightclick') toggleBtn.style.display = 'none';
        document.body.appendChild(host);

        let icons = {
            closed: cfg.iconClosed || SVG_CLOSED,
            open: cfg.iconOpen || SVG_OPEN
        };
        on(toggleImg, 'error', () => {
            if (icons.closed === SVG_CLOSED) return;
            icons = { closed: SVG_CLOSED, open: SVG_OPEN };
            toggleImg.src = isOpen ? icons.open : icons.closed;
        });

        let mode = cfg.desktop;
        let radius = 0;
        let isOpen = false;
        let rotX = 0, rotY = 0, paused = false, pauseTO = null, raf = 0;
        const cards = [];

        // ---------- Responsive ----------
        function applyMode() {
            mode = window.innerWidth <= cfg.breakpoint ? cfg.mobile : cfg.desktop;
            menu.style.setProperty('--m3d-item-w', num(mode.itemWidth) + 'vw');
            menu.style.setProperty('--m3d-item-h', num(mode.itemHeight) + 'vw');
            menu.style.perspective = num(mode.perspective) + 'vw';
            // Nhiều card → nới bán kính để 2 card cạnh nhau cách nhau ít nhất `gap`
            // (khoảng cách tâm 2 card kề nhau trên vòng = 2R·sin(π/n))
            const n = items.length;
            const needed = n > 1 ? (num(mode.itemWidth) + num(cfg.gap)) / (2 * Math.sin(Math.PI / n)) : 0;
            radius = Math.max(num(mode.radius), needed);
            menu.style.zIndex = cfg.indexUp;
            toggleBtn.style.zIndex = cfg.indexUp + 1;
            const size = num(mode.toggleSize) || 4;
            toggleBtn.style.width = size + 'vw';
            toggleBtn.style.height = size + 'vw';
        }

        // ---------- Carousel ----------
        // Card lớn nhất có thể trong khung itemWidth × itemHeight mà vẫn giữ đúng tỉ lệ trang (cao/rộng)
        function sizeCard(card) {
            const ratio = parseFloat(card.dataset.ratio) || window.innerHeight / Math.max(1, window.innerWidth);
            const maxW = num(mode.itemWidth), maxH = num(mode.itemHeight);
            let w = maxW, h = maxW * ratio;
            if (h > maxH) {
                h = maxH;
                w = maxH / ratio;
            }
            card.style.width = w + 'vw';
            card.style.height = h + 'vw';
            const iframe = card.querySelector('iframe');
            if (iframe) {
                // Card rộng w vw = w% bề ngang cửa sổ → thu nhỏ iframe (kích thước thật) theo đúng tỉ lệ đó
                iframe.style.width = window.innerWidth + 'px';
                iframe.style.height = window.innerHeight + 'px';
                iframe.style.transform = `scale(${w / 100})`;
            }
        }

        function layoutCards() {
            cards.forEach(card => {
                sizeCard(card);
                card.style.transform = `translate(-50%,-50%) rotateY(${card.dataset.angle}deg) translateZ(${radius}vw)`;
            });
        }

        function render() {
            const cameraZ = -radius - num(cfg.cameraOffset);
            scene.style.transform =
                `translate(-50%,-50%) translateZ(${cameraZ}vw) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        }

        function loop() {
            if (!paused) {
                rotY += num(cfg.autoRotateSpeed);
                render();
            }
            raf = requestAnimationFrame(loop);
        }

        function pauseThenResume() {
            paused = true;
            clearTimeout(pauseTO);
            pauseTO = setTimeout(() => (paused = false), num(cfg.timeAuto));
        }

        function fitLabels() {
            const ratio = typeof mode.labelFontSizeRatio === 'number' ? mode.labelFontSizeRatio : 0.5;
            root.querySelectorAll('.m3d-label').forEach(label => {
                label.style.fontSize = label.offsetHeight * ratio + 'px';
                const text = label.firstChild;
                const labelWidth = label.offsetWidth;
                const textWidth = text.scrollWidth;
                if (textWidth > labelWidth) {
                    // Chạy chữ từ mép phải sang hết mép trái, ~50px/s
                    label.style.setProperty('--m3d-from', labelWidth + 'px');
                    label.style.setProperty('--m3d-to', -textWidth + 'px');
                    label.style.setProperty('--m3d-dur', Math.max(5, (labelWidth + textWidth) / 50) + 's');
                    label.classList.add('m3d-scrolling');
                } else {
                    label.classList.remove('m3d-scrolling');
                }
            });
        }

        // ---------- Nội dung card: ảnh chụp (mặc định) hoặc iframe ----------
        let destroyed = false;
        let shotQueue = Promise.resolve();
        let frameQueue = Promise.resolve();

        // Card iframe tải lần lượt từng trang ở nền (trang trước xong mới tới trang sau) cho nhẹ
        const loadFrame = (iframe, url) => (frameQueue = frameQueue.then(() => new Promise(resolve => {
            if (destroyed) return resolve();
            const done = () => {
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(done, 8000);
            iframe.addEventListener('load', done, { once: true });
            iframe.src = url;
        })));
        const enqueue = task => (shotQueue = shotQueue.then(task, task));

        function setCardTitle(card, item, title) {
            if (item.titleLocked || !title) return;
            card.querySelector('.m3d-label-text').textContent = title;
            fitLabels();
        }

        // Card iframe chỉ để xem: con lăn chuột cuộn trang như thật (kể cả khung cuộn bên trong),
        // còn bấm/kéo/gõ trong trang bị chặn → bấm vào đâu cũng là mở trang đó
        const BLOCKED_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'dblclick', 'auxclick', 'dragstart', 'keydown', 'submit'];

        function mountIframe(card, item) {
            card.classList.remove('m3d-loading');
            const iframe = el('iframe');
            iframe.title = item.title;
            iframe.tabIndex = -1;
            loadFrame(iframe, item.url);
            // Lớp chắn cho trang khác domain (không chặn được từ bên trong): bấm được, không cuộn được
            const shield = el('div', 'm3d-shield');
            iframe.addEventListener('load', () => {
                try {
                    const win = iframe.contentWindow;
                    setCardTitle(card, item, iframe.contentDocument.title.trim());
                    const block = e => {
                        e.preventDefault();
                        e.stopPropagation();
                    };
                    BLOCKED_EVENTS.forEach(type => win.addEventListener(type, block, true));
                    win.addEventListener('click', e => {
                        block(e);
                        if (e.button === 0) navigate(item.url);
                    }, true);
                    win.addEventListener('contextmenu', onContextMenu, true);
                    shield.hidden = true; // cùng domain → để con lăn chuột cuộn thẳng trong trang
                } catch (_) {
                    shield.hidden = false;
                }
            });
            card.insertBefore(shield, card.firstChild);
            card.insertBefore(iframe, shield);
            delete card.dataset.ratio; // card theo tỉ lệ cửa sổ
            sizeCard(card);
        }

        function mountImage(card, shot) {
            card.classList.remove('m3d-loading');
            if (shot.width && shot.height) {
                card.dataset.ratio = shot.height / shot.width;
                sizeCard(card);
                fitLabels();
            }
            let img = card.querySelector('img');
            if (!img) {
                img = el('img');
                img.alt = '';
                img.draggable = false;
                card.insertBefore(img, card.firstChild);
            }
            img.src = shot.data;
        }

        // Chờ lúc trình duyệt rảnh → chụp ở nền không làm giật trang
        const whenIdle = () => new Promise(resolve => {
            if (window.requestIdleCallback) requestIdleCallback(() => resolve(), { timeout: 3000 });
            else setTimeout(resolve, 300);
        });

        // Tab bị ẩn thì trình duyệt dừng vẽ/animation → ảnh chụp sẽ hỏng; chờ tab hiện lại rồi mới chụp
        const whenVisible = () => new Promise(resolve => {
            if (!document.hidden) return resolve();
            const onChange = () => {
                if (document.hidden) return;
                document.removeEventListener('visibilitychange', onChange);
                resolve();
            };
            document.addEventListener('visibilitychange', onChange);
        });

        // Ảnh của 1 trang: lấy từ cache, chưa có thì chụp (xếp hàng lần lượt).
        // Mỗi trang chỉ chụp 1 lần dù chụp nền và mở menu cùng cần.
        const shotJobs = new Map();
        function shotFor(item) {
            if (!shotJobs.has(item.key)) {
                shotJobs.set(item.key, enqueue(async () => {
                    if (destroyed) throw new Error('menu đã gỡ');
                    const hit = await shotCache.get(SHOT_CACHE_PREFIX + item.key);
                    if (hit && hit.data && Date.now() - hit.t < SHOT_TTL) return hit;
                    await whenVisible();
                    await whenIdle();
                    if (destroyed) throw new Error('menu đã gỡ');
                    const shot = { t: Date.now(), ...(await capturePage(root, item.url)) };
                    shotCache.set(SHOT_CACHE_PREFIX + item.key, shot);
                    return shot;
                }));
            }
            return shotJobs.get(item.key);
        }

        const canShoot = item => cfg.preview === 'image' && toUrl(item.url).origin === location.origin;

        async function fillCard(card, item) {
            if (!canShoot(item)) {
                mountIframe(card, item);
                return;
            }
            card.classList.add('m3d-loading');
            try {
                const shot = await shotFor(item);
                if (destroyed) return;
                mountImage(card, shot);
                setCardTitle(card, item, shot.title);
            } catch (e) {
                if (destroyed) return;
                // Không chụp được (khác domain, trang chặn nhúng...) → dùng iframe
                console.warn('[Menu3D] Không chụp được, dùng iframe:', item.url, e);
                mountIframe(card, item);
            }
        }

        // Dựng card (ảnh chụp / iframe) — gọi sẵn ở nền ngay sau khi trang tải xong
        function buildCards() {
            items.forEach((item, i) => {
                const card = el('div', 'm3d-item');
                card.dataset.angle = (360 / items.length) * i;
                card.dataset.key = item.key;

                const label = el('a', 'm3d-label');
                label.href = item.url;
                const text = el('span', 'm3d-label-text');
                text.textContent = item.title;
                label.appendChild(text);
                card.appendChild(label);

                // Bấm card/nhãn → xem trang; Ctrl/Cmd + click nhãn → tab mới như link thường
                card.addEventListener('click', e => {
                    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (!spinMoved) navigate(item.url);
                });
                card.addEventListener('mouseenter', () => (paused = true));
                card.addEventListener('mouseleave', () => (paused = false));

                scene.appendChild(card);
                cards.push(card);
                fillCard(card, item);
            });
            layoutCards();
            markCurrent();
            requestAnimationFrame(fitLabels);
        }

        // ---------- Điều hướng ----------
        function markCurrent() {
            cards.forEach(card => card.classList.toggle('m3d-current', card.dataset.key === currentKey));
        }

        // Bấm card → chuyển trang thật (extension tự dựng lại menu ở trang mới)
        function navigate(url) {
            setOpen(false);
            const u = toUrl(url);
            if (!u || pageKey(u) === currentKey) return;
            location.assign(u.href);
        }

        function setOpen(state) {
            isOpen = state;
            if (isOpen && !cards.length) buildCards();
            menu.classList.toggle('m3d-open', isOpen);
            const text = isOpen ? 'Hide 3D menu' : 'Show 3D menu';
            toggleBtn.setAttribute('aria-pressed', String(isOpen));
            toggleBtn.setAttribute('aria-label', text);
            toggleBtn.title = text;
            toggleImg.src = isOpen ? icons.open : icons.closed;
            cancelAnimationFrame(raf);
            if (isOpen) {
                render();
                raf = requestAnimationFrame(loop);
            }
        }

        // ---------- Nút toggle: kéo thả + hít vào mép gần nhất ----------
        const setTogglePosition = (x, y) => {
            toggleBtn.style.left = `${x}vw`;
            toggleBtn.style.top = `${y}vw`;
        };

        function snapToNearestEdge() {
            const rect = toggleBtn.getBoundingClientRect();
            const w = toVw(rect.width), h = toVw(rect.height);
            const viewportH = toVw(window.innerHeight);
            const distances = {
                left: toVw(rect.left),
                right: 100 - toVw(rect.right),
                top: toVw(rect.top),
                bottom: viewportH - toVw(rect.bottom)
            };
            const closest = Object.keys(distances).reduce((a, b) => (distances[b] < distances[a] ? b : a));
            let x = toVw(rect.left), y = toVw(rect.top);
            if (closest === 'left' || closest === 'right') {
                x = closest === 'left' ? 0 : 100 - w;
                y = clamp(y, 0, viewportH - h);
            } else {
                y = closest === 'top' ? 0 : viewportH - h;
                x = clamp(x, 0, 100 - w);
            }
            setTogglePosition(x, y);
        }

        function setInitialTogglePosition() {
            // Giữa chiều cao, sát lề phải; tắt transition để không bị trượt lúc đầu
            toggleBtn.style.transition = 'none';
            const h = toVw(toggleBtn.offsetHeight), w = toVw(toggleBtn.offsetWidth);
            setTogglePosition(100 - w, (toVw(window.innerHeight) - h) / 2);
            requestAnimationFrame(() => (toggleBtn.style.transition = ''));
        }

        const toggleDrag = { active: false, pointerId: null, offsetX: 0, offsetY: 0, moved: false, blockClick: false };
        let spin = null; // kéo để xoay carousel
        let spinMoved = false; // vừa kéo xoay → bỏ qua click nhãn
        let toggleMoved = false; // người dùng đã kéo nút sang chỗ khác chưa

        on(toggleBtn, 'click', () => {
            if (toggleDrag.blockClick) {
                toggleDrag.blockClick = false;
                return;
            }
            setOpen(!isOpen);
        });

        on(toggleBtn, 'pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            const rect = toggleBtn.getBoundingClientRect();
            setTogglePosition(toVw(rect.left), toVw(rect.top));
            Object.assign(toggleDrag, {
                active: true,
                pointerId: e.pointerId,
                offsetX: toVw(e.clientX - rect.left),
                offsetY: toVw(e.clientY - rect.top),
                moved: false
            });
            toggleBtn.classList.add('m3d-dragging');
            toggleBtn.setPointerCapture(e.pointerId);
        });

        on(menu, 'pointerdown', e => {
            if (e.button !== 0) return;
            spin = { id: e.pointerId, x: e.clientX, y: e.clientY, dist: 0 };
            spinMoved = false;
        });

        on(window, 'pointermove', e => {
            if (toggleDrag.active && e.pointerId === toggleDrag.pointerId) {
                toggleDrag.moved = true;
                const maxX = 100 - toVw(toggleBtn.offsetWidth);
                const maxY = toVw(window.innerHeight) - toVw(toggleBtn.offsetHeight);
                setTogglePosition(
                    clamp(toVw(e.clientX) - toggleDrag.offsetX, 0, Math.max(0, maxX)),
                    clamp(toVw(e.clientY) - toggleDrag.offsetY, 0, Math.max(0, maxY))
                );
            } else if (spin && e.pointerId === spin.id) {
                spin.dist += Math.abs(e.clientX - spin.x) + Math.abs(e.clientY - spin.y);
                if (spin.dist > 5) spinMoved = true;
                rotY += (e.clientX - spin.x) * 0.3;
                rotX = clamp(rotX - (e.clientY - spin.y) * 0.3, -90, 90);
                spin.x = e.clientX;
                spin.y = e.clientY;
                render();
            }
        });

        const endPointer = e => {
            if (spin && e.pointerId === spin.id) spin = null;
            if (!toggleDrag.active || e.pointerId !== toggleDrag.pointerId) return;
            toggleDrag.active = false;
            toggleDrag.blockClick = toggleDrag.moved;
            toggleMoved = toggleMoved || toggleDrag.moved;
            toggleDrag.pointerId = null;
            toggleBtn.classList.remove('m3d-dragging');
            try { toggleBtn.releasePointerCapture(e.pointerId); } catch (_) {}
            snapToNearestEdge();
        };
        on(window, 'pointerup', endPointer);
        on(window, 'pointercancel', endPointer);

        // Chỉ chiếm con lăn chuột khi menu đang mở → trang vẫn cuộn bình thường
        on(window, 'wheel', e => {
            if (!isOpen) return;
            e.preventDefault();
            const speed = num(cfg.scrollRotateSpeed);
            rotY += e.deltaY > 0 ? speed : -speed;
            render();
            pauseThenResume();
        }, { passive: false });

        on(window, 'keydown', e => {
            if (e.key === 'Escape' && isOpen) setOpen(false);
        });

        // Chế độ chuột phải: bấm chuột phải để mở/đóng menu; Shift + chuột phải = menu của trình duyệt
        function onContextMenu(e) {
            if (cfg.trigger !== 'rightclick' || e.shiftKey) return;
            e.preventDefault();
            setOpen(!isOpen);
        }
        on(window, 'contextmenu', onContextMenu, true);

        on(window, 'resize', () => {
            applyMode();
            layoutCards();
            if (toggleMoved) snapToNearestEdge();
            else setInitialTogglePosition();
            render();
            fitLabels();
        });

        applyMode();
        setInitialTogglePosition();
        setOpen(false);
        // Dựng sẵn menu ở nền sau khi trang tải xong → lúc mở menu mọi thứ đã sẵn sàng
        const prebuildTimer = setTimeout(() => {
            if (!cards.length) buildCards();
        }, 1500);

        return {
            items,
            config: cfg,
            open: () => setOpen(true),
            close: () => setOpen(false),
            toggle: () => setOpen(!isOpen),
            isOpen: () => isOpen,
            navigate,
            destroy() {
                destroyed = true;
                clearTimeout(prebuildTimer);
                cancelAnimationFrame(raf);
                clearTimeout(pauseTO);
                offs.forEach(off => off());
                host.remove();
            }
        };
    }

    // ================= API =================

    const domReady = () => new Promise(resolve => {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve, { once: true });
        else resolve();
    });

    let instance = null;
    let generation = 0;

    const Menu3D = {
        version: VERSION,

        async init(options = {}) {
            Menu3D.destroy();
            shotCache.prune();
            const gen = generation;
            await domReady();

            const cfg = mergeConfig(options);
            const items = [currentItem(cfg), ...discoverLinks(cfg)]
                .filter(Boolean)
                .slice(0, Math.max(1, num(cfg.max)));

            if (gen !== generation) return null; // đã có init()/destroy() khác gọi sau
            if (!items.length) {
                console.warn('[Menu3D] Không tìm thấy trang nào để hiển thị.');
                return null;
            }
            instance = createMenu(cfg, items);
            return instance;
        },

        destroy() {
            generation++;
            if (instance) instance.destroy();
            instance = null;
        },

        get instance() {
            return instance;
        }
    };

    window.Menu3D = Menu3D;
})();
