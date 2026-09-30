/*!
 * Menu3D — menu 3D carousel. Chạy trên trang bất kỳ bằng F12 → Console:
 *
 *   document.body.appendChild(Object.assign(document.createElement('script'), { src: 'https://t-root.github.io/menu-3D/menu3d.js' }))
 *
 * Hoặc nhúng vào HTML:
 *
 *   <script src="https://t-root.github.io/menu-3D/menu3d.js"></script>
 *
 * Tùy chỉnh (không bắt buộc) bằng data-attribute:
 *
 *   <script src=".../menu3d.js"
 *           data-source="sitemap"
 *           data-max="8"
 *           data-exclude="/admin,/login"></script>
 *
 * Hoặc gọi bằng JS: <script src=".../menu3d.js" data-manual></script>
 *                   Menu3D.init({ items: [{ path: '/a.html', title: 'A' }] });
 */
(function () {
    'use strict';

    // Script bị nhúng/dán lần 2 (vd chạy lại snippet console) → chỉ dựng lại menu nếu đã bị gỡ
    if (window.Menu3D && window.Menu3D.version) {
        if (!window.Menu3D.instance) window.Menu3D.init();
        return;
    }

    // Iframe do Menu3D tạo ra mang tên này → trang con không dựng menu nữa (chống lặp vô hạn)
    const FRAME_NAME = 'menu3d-frame';
    const inMenuFrame = window.name === FRAME_NAME;

    const PAGE_EXT = /\.(html?|php|aspx?|jsp)$/i;
    const GITHUB_CACHE_MS = 60 * 60 * 1000;
    const AUTO_SOURCES = ['links', 'sitemap', 'github', 'json'];

    const DEFAULTS = {
        // --- Tự tìm trang ---
        source: AUTO_SOURCES,          // thứ tự nguồn thử lần lượt
        max: 12,                       // tối đa số trang (kể cả trang đang mở)
        exclude: [],                   // bỏ các đường dẫn bắt đầu bằng những prefix này
        selector: 'nav a[href], header a[href]', // vùng link ưu tiên khi source = links
        sitemap: '/sitemap.xml',
        json: '/menu3d.json',
        items: null,                   // truyền sẵn danh sách → bỏ qua tự tìm
        // --- Giao diện ---
        preview: 'image',              // 'image' = ảnh chụp màn hình đầu của trang, 'iframe' = trang chạy trực tiếp
        captureDelay: 1200,            // ms chờ sau khi trang load rồi mới chụp (để animation/ảnh kịp hiện)
        cacheHours: 24,                // ảnh chụp được dùng lại trong bao lâu
        breakpoint: 700,
        cameraOffset: 0,
        gap: 2,                        // khoảng hở tối thiểu giữa 2 card cạnh nhau (vw)
        autoRotateSpeed: 0.2,
        scrollRotateSpeed: 4,
        indexUp: 2147483000,           // z-index cao để nằm trên mọi thứ của trang
        timeAuto: 3000,
        iconClosed: null,
        iconOpen: null,
        desktop: { perspective: 55, radius: 26, itemWidth: 24, itemHeight: 13.5, toggleSize: 4, labelFontSizeRatio: 0.5 }, // card ngang 16:9
        mobile: { perspective: 70, radius: 50, itemWidth: 30, itemHeight: 50, toggleSize: 15, labelFontSizeRatio: 0.5 }
    };

    const scriptEl = document.currentScript ||
        Array.from(document.scripts).find(s => /menu3d(\.min)?\.js([?#]|$)/i.test(s.src)) || null;
    const scriptBase = scriptEl && scriptEl.src
        ? scriptEl.src.replace(/[?#].*$/, '').replace(/[^/]*$/, '')
        : null;

    const svgIcon = body => 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
        '<circle cx="24" cy="24" r="22" fill="rgba(0,0,0,.6)" stroke="#fff" stroke-width="2"/>' +
        '<g stroke="#fff" stroke-width="3" stroke-linecap="round">' + body + '</g></svg>');
    const SVG_CLOSED = svgIcon('<path d="M15 17h18M15 24h18M15 31h18"/>');
    const SVG_OPEN = svgIcon('<path d="M17 17l14 14M31 17L17 31"/>');

    // ================= CONFIG =================

    const toList = v => (Array.isArray(v) ? v : String(v).split(','))
        .map(s => String(s).trim()).filter(Boolean);

    function readDataConfig(el) {
        const out = {};
        if (!el) return out;
        for (const [key, raw] of Object.entries(el.dataset)) {
            if (!(key in DEFAULTS)) continue;
            try {
                if (key === 'source' || key === 'exclude') out[key] = toList(raw);
                else if (key === 'desktop' || key === 'mobile' || key === 'items') out[key] = JSON.parse(raw);
                else if (typeof DEFAULTS[key] === 'number') {
                    const n = parseFloat(raw);
                    if (Number.isFinite(n)) out[key] = n;
                } else out[key] = raw;
            } catch (_) {
                console.warn(`[Menu3D] data-${key} không hợp lệ:`, raw);
            }
        }
        return out;
    }

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
        out.source = toList(out.source).flatMap(s => (s === 'auto' ? AUTO_SOURCES : [s]));
        out.exclude = toList(out.exclude);
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

    const isExcluded = (u, cfg) => cfg.exclude.some(p => u.pathname.startsWith(p));

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
        return (list, { base, strict = true, skipCurrent = true } = {}) => {
            const seen = new Set(skipCurrent ? [currentKey] : []);
            const out = [];
            for (const it of list || []) {
                const u = toUrl(typeof it === 'string' ? it : it && it.path, base);
                if (!u || (strict && !isPage(u)) || isExcluded(u, cfg)) continue;
                const key = pageKey(u);
                if (seen.has(key)) continue;
                seen.add(key);
                const title = (it && typeof it.title === 'string' && it.title.trim()) || '';
                out.push({ url: u.href, key, title: title || titleFromUrl(u), titleLocked: !!title });
            }
            return out;
        };
    }

    const linkText = a => (a.textContent || a.getAttribute('aria-label') || a.title || '').trim().replace(/\s+/g, ' ');

    async function readSitemap(url, depth) {
        const res = await fetch(url);
        if (!res.ok) return [];
        const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
        const locs = Array.from(doc.getElementsByTagName('loc'), n => toUrl(n.textContent.trim(), url)).filter(Boolean);
        if (doc.documentElement.localName !== 'sitemapindex') return locs;
        if (depth > 0) return [];
        const nested = await Promise.all(locs.slice(0, 3).map(l => readSitemap(l, depth + 1).catch(() => [])));
        return nested.flat();
    }

    // Liệt kê file .html trong repo đang host GitHub Pages (có cache localStorage)
    async function githubPaths(user, repo, base) {
        const cacheKey = `menu3d:gh:${user}/${repo}`;
        try {
            const hit = JSON.parse(localStorage.getItem(cacheKey));
            if (hit && Date.now() - hit.t < GITHUB_CACHE_MS) return hit.paths;
        } catch (_) {}

        const api = path => fetch(`https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}${path}`)
            .then(r => (r.ok ? r.json() : null)).catch(() => null);
        const info = await api('');
        if (!info) return null;

        let rel = location.pathname.slice(base.length);
        try { rel = decodeURIComponent(rel); } catch (_) {}
        if (!rel || rel.endsWith('/')) rel += 'index.html';
        const wanted = [rel, rel + '.html', rel + '/index.html'];

        let paths = null;
        for (const branch of new Set([info.default_branch, 'gh-pages'])) {
            const tree = await api(`/git/trees/${encodeURIComponent(branch)}?recursive=1`);
            if (!tree || !Array.isArray(tree.tree)) continue;
            const html = tree.tree
                .filter(t => t.type === 'blob' && /\.html?$/i.test(t.path))
                .map(t => t.path)
                .filter(p => !/(^|\/)(_|\.|node_modules\/)/.test(p) && !/(^|\/)404\.html$/i.test(p));
            // Pages có thể publish từ gốc hoặc /docs → chọn prefix chứa trang đang mở
            const prefix = ['', 'docs/'].find(pre => wanted.some(w => html.includes(pre + w)));
            if (prefix === undefined) continue;
            paths = html.filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length))
                .sort((a, b) => a.split('/').length - b.split('/').length);
            break;
        }
        if (!paths) return null;
        try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), paths })); } catch (_) {}
        return paths;
    }

    const SOURCES = {
        links(cfg, clean) {
            const pick = sel => clean(Array.from(document.querySelectorAll(sel))
                .filter(a => !a.hasAttribute('download'))
                .map(a => ({ path: a.href, title: linkText(a) })));
            const items = pick(cfg.selector);
            return { items: items.length ? items : pick('a[href]') };
        },

        async sitemap(cfg, clean) {
            return { items: clean((await readSitemap(toUrl(cfg.sitemap), 0)).map(u => u.href)) };
        },

        async github(cfg, clean) {
            const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
            if (!m) return null;
            const user = m[1];
            const seg = location.pathname.split('/').filter(Boolean)[0];
            const candidates = [];
            if (seg && !seg.includes('.')) candidates.push({ repo: seg, base: `/${seg}/` });
            candidates.push({ repo: `${user}.github.io`, base: '/' });
            for (const { repo, base } of candidates) {
                const paths = await githubPaths(user, repo, base);
                if (paths && paths.length) return { items: clean(paths.map(p => encodeURI(base + p))) };
            }
            return null;
        },

        async json(cfg, clean) {
            const url = toUrl(cfg.json);
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) return null;
            const data = await res.json();
            const { items, ...config } = Array.isArray(data) ? { items: data } : data;
            return { items: clean(items, { base: url, strict: false }), config };
        }
    };

    async function discover(cfg) {
        const clean = makeCleaner(cfg);
        for (const name of cfg.source) {
            const fn = SOURCES[name];
            if (!fn) {
                console.warn(`[Menu3D] data-source "${name}" không hợp lệ (links | sitemap | github | json | auto)`);
                continue;
            }
            try {
                const res = await fn(cfg, clean);
                if (res && res.items.length) return res;
            } catch (e) {
                console.warn(`[Menu3D] Nguồn "${name}" lỗi:`, e);
            }
        }
        return { items: [] };
    }

    function currentItem(cfg) {
        if (isExcluded(currentUrl, cfg)) return null;
        const title = document.title.trim();
        return { url: location.href, key: currentKey, title: title || titleFromUrl(currentUrl), titleLocked: !!title };
    }

    // ================= ẢNH CHỤP TRANG =================

    const SHOT_LIB = 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/+esm';
    const SHOT_WIDTH = 800; // px, đủ nét cho card ở màn hình PC
    let shotLib = null;
    const loadShotLib = () => shotLib || (shotLib = import(SHOT_LIB));
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
            clear: () => run('readwrite', st => st.clear()).catch(() => {})
        };
    })();

    // Tải trang vào iframe ẩn (kích thước = cửa sổ hiện tại), chụp màn hình đầu rồi bỏ iframe
    async function capturePage(container, url, cfg) {
        const lib = await loadShotLib();
        const w = window.innerWidth, h = window.innerHeight;
        const frame = document.createElement('iframe');
        frame.name = FRAME_NAME;
        frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;` +
            'border:0;opacity:0;pointer-events:none;z-index:-2147483647;';
        container.appendChild(frame);
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('timeout')), 15000);
                frame.onload = () => { clearTimeout(timer); resolve(); };
                frame.src = url;
            });
            await sleep(num(cfg.captureDelay));
            const doc = frame.contentDocument;
            if (!doc || !doc.documentElement) throw new Error('không đọc được trang');
            const data = await lib.domToJpeg(doc.documentElement, {
                width: w,
                height: h,
                scale: Math.min(1, SHOT_WIDTH / w),
                quality: 0.75,
                backgroundColor: '#fff'
            });
            return { data, title: (doc.title || '').trim() };
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
  object-fit: cover;
  object-position: top center;
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

.m3d-item iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}

.m3d-label {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 15%;
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

.m3d-view {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
  display: none;
}

.m3d-view.m3d-show { display: block; }

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
        document.body.appendChild(host);

        let icons = {
            closed: cfg.iconClosed || (scriptBase ? scriptBase + 'icon/close.png' : SVG_CLOSED),
            open: cfg.iconOpen || (scriptBase ? scriptBase + 'icon/open.png' : SVG_OPEN)
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
        function layoutCards() {
            cards.forEach(card => {
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
        const enqueue = task => (shotQueue = shotQueue.then(task, task));

        function setCardTitle(card, item, title) {
            if (item.titleLocked || !title) return;
            card.querySelector('.m3d-label-text').textContent = title;
            fitLabels();
        }

        function mountIframe(card, item) {
            card.classList.remove('m3d-loading');
            const iframe = el('iframe');
            iframe.name = FRAME_NAME;
            iframe.src = item.url;
            iframe.title = item.title;
            iframe.tabIndex = 0;
            iframe.addEventListener('load', () => {
                // Cùng domain → đọc được <title> thật của trang
                try { setCardTitle(card, item, iframe.contentDocument.title.trim()); } catch (_) {}
            });
            iframe.addEventListener('focus', () => (paused = true));
            iframe.addEventListener('blur', () => (paused = false));
            card.insertBefore(iframe, card.firstChild);
        }

        function mountImage(card, data) {
            card.classList.remove('m3d-loading');
            let img = card.querySelector('img');
            if (!img) {
                img = el('img');
                img.alt = '';
                img.draggable = false;
                card.insertBefore(img, card.firstChild);
            }
            img.src = data;
        }

        async function captureCard(card, item) {
            if (destroyed) return;
            try {
                const shot = await capturePage(root, item.url, cfg);
                if (destroyed) return;
                mountImage(card, shot.data);
                setCardTitle(card, item, shot.title);
                shotCache.set(item.key, { t: Date.now(), ...shot });
            } catch (e) {
                // Không chụp được (khác domain, CSP chặn thư viện...) → dùng iframe như cũ
                console.debug('[Menu3D] Không chụp được, dùng iframe:', item.url, e);
                if (!destroyed && !card.querySelector('img')) mountIframe(card, item);
            }
        }

        async function fillCard(card, item) {
            if (cfg.preview !== 'image' || toUrl(item.url).origin !== location.origin) {
                mountIframe(card, item);
                return;
            }
            card.classList.add('m3d-loading');
            const hit = await shotCache.get(item.key);
            if (hit && hit.data) {
                mountImage(card, hit.data);
                setCardTitle(card, item, hit.title);
                if (Date.now() - hit.t < num(cfg.cacheHours) * 3600e3) return;
            }
            enqueue(() => captureCard(card, item)); // chụp lần lượt từng trang cho nhẹ
        }

        // Card chỉ tạo khi mở menu lần đầu để trang load nhẹ
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
        // Không cho trang gốc chuyển đi (menu sẽ mất, nhất là khi chạy từ console):
        // trang được chọn mở trong iframe toàn màn hình, URL + title đồng bộ qua history API.
        const originUrl = location.href;
        const originTitle = document.title;
        const originOverflow = document.documentElement.style.overflow;
        let shownKey = currentKey;
        let view = null;

        const isViewShown = () => !!view && view.classList.contains('m3d-show');

        function markCurrent() {
            cards.forEach(card => card.classList.toggle('m3d-current', card.dataset.key === shownKey));
        }

        function showPage(url) {
            const u = toUrl(url);
            shownKey = pageKey(u);
            markCurrent();
            if (shownKey === currentKey) {
                if (view) view.classList.remove('m3d-show');
                document.documentElement.style.overflow = originOverflow;
                document.title = originTitle;
                return;
            }
            if (!view) {
                view = el('iframe', 'm3d-view');
                view.name = FRAME_NAME;
                view.style.zIndex = cfg.indexUp - 1;
                view.addEventListener('load', syncFromView);
                view.src = u.href;
                root.insertBefore(view, menu);
            } else {
                // replace → iframe không tạo thêm bước history (Back chỉ cần bấm 1 lần)
                try { view.contentWindow.location.replace(u.href); } catch (_) { view.src = u.href; }
            }
            view.classList.add('m3d-show');
            document.documentElement.style.overflow = 'hidden';
        }

        // Người dùng bấm link bên trong trang đang xem → cập nhật URL/title của tab
        function syncFromView() {
            if (!isViewShown()) return;
            try {
                const href = view.contentWindow.location.href;
                const title = view.contentDocument.title;
                if (title) document.title = title;
                if (toUrl(href).origin === location.origin && href !== location.href) {
                    history.replaceState({ menu3d: href }, '', href);
                }
                shownKey = pageKey(toUrl(href));
                markCurrent();
            } catch (_) {} // trang khác domain → không đọc được
        }

        function navigate(url) {
            setOpen(false);
            const u = toUrl(url);
            if (!u || pageKey(u) === shownKey) return;
            if (!isViewShown()) {
                // Đánh dấu bước history của trang gốc để Back quay lại được
                const st = history.state;
                if (st === null || typeof st === 'object') history.replaceState({ ...st, menu3d: originUrl }, '');
            }
            showPage(u.href);
            if (u.origin === location.origin) history.pushState({ menu3d: u.href }, '', u.href);
        }

        on(window, 'popstate', e => {
            const target = e.state && e.state.menu3d;
            if (target) showPage(target);
            else if (isViewShown()) showPage(originUrl);
        });

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
                cancelAnimationFrame(raf);
                clearTimeout(pauseTO);
                offs.forEach(off => off());
                if (isViewShown()) {
                    document.documentElement.style.overflow = originOverflow;
                    document.title = originTitle;
                }
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
        version: '2.2.0',

        // Cấu hình: mặc định < menu3d.json < data-attribute < options truyền vào đây
        async init(options = {}) {
            if (inMenuFrame) return null;
            Menu3D.destroy();
            const gen = generation;
            await domReady();

            const dataCfg = readDataConfig(scriptEl);
            let cfg = mergeConfig(dataCfg, options);
            let items;
            if (Array.isArray(cfg.items)) {
                items = makeCleaner(cfg)(cfg.items, { strict: false, skipCurrent: false });
            } else {
                const found = await discover(cfg);
                if (found.config) cfg = mergeConfig(found.config, dataCfg, options);
                items = [currentItem(cfg), ...found.items].filter(Boolean);
            }
            items = items.slice(0, Math.max(1, num(cfg.max)));

            if (gen !== generation) return null; // đã có init()/destroy() khác gọi sau
            if (!items.length) {
                console.warn('[Menu3D] Không tìm thấy trang nào để hiển thị.');
                return null;
            }
            instance = createMenu(cfg, items);
            return instance;
        },

        // Xóa ảnh chụp đã lưu (trang đổi giao diện mà ảnh chưa hết hạn)
        clearCache() {
            return shotCache.clear();
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

    if (!inMenuFrame && !(scriptEl && scriptEl.hasAttribute('data-manual'))) {
        Menu3D.init();
    }
})();
