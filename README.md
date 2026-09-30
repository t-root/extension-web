# Menu3D - Hướng dẫn sử dụng

## Hình ảnh demo

<div align="center">
  <img src="img-demo/img1.png" alt="Menu3D Demo 1" width="45%" style="margin: 5px;">
  <img src="img-demo/img2.png" alt="Menu3D Demo 2" width="45%" style="margin: 5px;">
  <br>
  <img src="img-demo/img3.png" alt="Menu3D Demo 3" width="45%" style="margin: 5px;">
  <img src="img-demo/img4.png" alt="Menu3D Demo 4" width="45%" style="margin: 5px;">
</div>

## Giới thiệu

Menu3D tạo menu 3D carousel: mỗi trang của website hiển thị trong một iframe trên vòng xoay 3D. Không cần file config — script tự tìm các trang của website và tự dựng menu.

Link chính: **`https://t-root.github.io/menu-3D/menu3d.js`**

### Cách 1 — Chạy bằng Console (F12)

Mở website bất kỳ → **F12 → Console** → dán rồi Enter:

```js
document.body.appendChild(Object.assign(document.createElement('script'), { src: 'https://t-root.github.io/menu-3D/menu3d.js' }))
```

Kèm tùy chỉnh (tương đương data-attribute bên dưới):

```js
var s = document.createElement('script');
s.src = 'https://t-root.github.io/menu-3D/menu3d.js';
s.dataset.max = '8';
s.dataset.exclude = '/admin,/login';
document.body.appendChild(s);
```

- Chrome chặn dán lần đầu → gõ `allow pasting`, Enter, rồi dán lại.
- Trang chặn script ngoài (CSP, báo `Refused to load the script`) → mở link `menu3d.js`, copy toàn bộ code và dán thẳng vào Console.
- Chạy lại snippet khi menu đã bị gỡ sẽ dựng lại menu; hoặc gọi `Menu3D.init({...})` để dựng lại với config mới.

### Cách 2 — Nhúng vào HTML

```html
<script src="https://t-root.github.io/menu-3D/menu3d.js"></script>
```

Nhúng được ở **mọi trang** — trang được mở bên trong iframe của menu sẽ tự bỏ qua, không bị lặp vô hạn.

## Chuyển trang không mất menu

Bấm nhãn một card **không tải lại cả trang** (nếu tải lại, menu chạy từ Console sẽ mất). Trang được chọn mở trong khung toàn màn hình ngay dưới menu:

- Thanh địa chỉ và tiêu đề tab đổi theo trang đang xem; bấm link bên trong trang đó cũng được đồng bộ.
- Nút **Back / Forward** của trình duyệt hoạt động bình thường; card của trang đang xem được đánh dấu.
- Bấm card của trang gốc → quay về trang gốc. Ctrl/Cmd + click nhãn → mở tab mới như link thường.
- Nhấn **F5** sẽ tải trang thật → menu chạy từ Console mất, cần chạy lại snippet.
- Trang bên trong dùng link `target="_top"` sẽ thoát khỏi khung, menu cũng mất.

## Tự tìm trang

Mặc định script thử lần lượt các nguồn dưới đây, nguồn nào tìm ra trang thì dùng nguồn đó:

| Nguồn | Cách lấy |
|---|---|
| `links` | Link trong `<nav>`, `<header>`; không có thì lấy mọi `<a href>` của trang |
| `sitemap` | Đọc `/sitemap.xml` (hỗ trợ cả sitemap index) |
| `github` | Site trên `*.github.io` → liệt kê file `.html` trong repo qua GitHub API (cache 1 giờ) |
| `json` | Đọc `/menu3d.json` |

- **Trang đang mở luôn là card đầu tiên**; card của trang đang xem có nền nhãn sáng hơn.
- Chỉ lấy trang **cùng domain**, bỏ file không phải trang web (`.pdf`, `.zip`...), bỏ link trùng.
- Tiêu đề: chữ của link → `<title>` thật của trang (đọc sau khi iframe load) → tên file.

## Tùy chỉnh bằng data-attribute

```html
<script src="https://t-root.github.io/menu-3D/menu3d.js"
        data-source="sitemap"
        data-max="8"
        data-exclude="/admin,/login"></script>
```

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `data-source` | `links,sitemap,github,json` | Nguồn tìm trang, thử theo thứ tự; `auto` = mặc định |
| `data-max` | `12` | Số trang tối đa (tính cả trang đang mở) |
| `data-exclude` | — | Bỏ các đường dẫn **bắt đầu bằng** các prefix này (cách nhau dấu phẩy) |
| `data-selector` | `nav a[href], header a[href]` | Vùng link ưu tiên cho nguồn `links` |
| `data-sitemap` | `/sitemap.xml` | Đường dẫn sitemap |
| `data-json` | `/menu3d.json` | Đường dẫn file JSON |
| `data-items` | — | Danh sách cố định (JSON), bỏ qua tự tìm |
| `data-breakpoint` | `700` | Độ rộng (px) chuyển sang mobile |
| `data-camera-offset` | `0` | Offset camera (vw); âm = gần hơn |
| `data-gap` | `2` | Khoảng hở tối thiểu giữa 2 card (vw). Nhiều card thì vòng tự nới rộng, không bị dính nhau |
| `data-auto-rotate-speed` | `0.2` | Tốc độ tự xoay (độ/frame) |
| `data-scroll-rotate-speed` | `4` | Độ xoay mỗi lần cuộn chuột |
| `data-time-auto` | `3000` | ms chờ trước khi tự xoay lại sau khi cuộn |
| `data-index-up` | `2147483000` | z-index của menu (cao để nằm trên mọi thứ của trang) |
| `data-icon-closed` / `data-icon-open` | icon của thư viện | URL icon nút toggle |
| `data-desktop` / `data-mobile` | xem dưới | JSON, chỉ ghi đè key cần đổi, vd `data-desktop='{"radius":30}'` |
| `data-manual` | — | Không tự chạy, chờ gọi `Menu3D.init()` |

Mặc định `desktop` / `mobile`:

```json
"desktop": { "perspective": 55, "radius": 26, "itemWidth": 15, "itemHeight": 22, "toggleSize": 4, "labelFontSizeRatio": 0.5 },
"mobile":  { "perspective": 70, "radius": 50, "itemWidth": 30, "itemHeight": 50, "toggleSize": 15, "labelFontSizeRatio": 0.5 }
```

## Gọi bằng JavaScript

```html
<script src="https://t-root.github.io/menu-3D/menu3d.js" data-manual></script>
<script>
  Menu3D.init({
    items: [
      { path: '/page1.html', title: 'Trang 1' },
      '/page2.html'
    ],
    autoRotateSpeed: 0.3,
    desktop: { radius: 30 }
  }).then(menu => {
    // menu.open(), menu.close(), menu.toggle(), menu.isOpen(), menu.navigate(url), menu.destroy()
  });
</script>
```

- Các key của `init()` giống data-attribute (dạng camelCase).
- Thứ tự ưu tiên: mặc định < `menu3d.json` < data-attribute < options của `init()`.
- Có `items` thì dùng đúng danh sách đó (không tự thêm trang đang mở).
- Gọi `init()` lần nữa sẽ thay menu cũ; `Menu3D.destroy()` để gỡ menu.

### File `menu3d.json` (nguồn `json`)

Mảng item, hoặc object chứa `items` và các thông số khác:

```json
{
  "autoRotateSpeed": 0.3,
  "items": [
    { "path": "/page1.html", "title": "Trang 1" },
    { "path": "https://other-site.com/", "title": "Site khác" }
  ]
}
```

## Tương tác

- **Click nút toggle**: mở/đóng menu · **ESC**: đóng menu
- **Kéo** (chuột hoặc cảm ứng): xoay menu · **Cuộn chuột**: xoay nhanh (chỉ khi menu mở)
- **Hover** vào card: tạm dừng tự xoay
- **Kéo nút toggle**: di chuyển, tự hít vào mép gần nhất

## Lưu ý

- **Không có cách "liệt kê thư mục" trên web**: script chỉ biết những trang có link tới, có trong sitemap, hoặc có trong repo GitHub.
- **GitHub API** giới hạn ~60 lượt/giờ/IP khi không đăng nhập; kết quả được cache trong `localStorage` 1 giờ.
- **Iframe khác domain**: site có `X-Frame-Options` / CSP `frame-ancestors` sẽ hiện card trống.
- Iframe chỉ được tạo khi **mở menu lần đầu**, nên trang load nhẹ. Menu nằm trong Shadow DOM nên CSS của menu và của trang không ảnh hưởng nhau.
- Hosting: dùng GitHub Pages hoặc jsDelivr (`https://cdn.jsdelivr.net/gh/t-root/menu-3D@<tag>/menu3d.js` để ghim version). **Không** dùng `raw.githubusercontent.com` (trình duyệt không chạy script từ đó).

## Chạy demo

```bash
node example/server.js
```

- `http://localhost:8080` — zero-config, lấy trang từ link trong `<nav>`
- `http://localhost:8080/example/console-demo.html` — trang không nhúng script, dùng để thử cách chạy bằng Console
- `http://localhost:8080/example/sitemap-demo.html` — `data-source="sitemap"`, `data-max`, `data-exclude`

## Cấu trúc

```
menu3d.js        # Thư viện (1 file, CSS nhúng sẵn)
icon/            # Icon mặc định của nút toggle (load cạnh menu3d.js)
example/         # Demo + server tĩnh
```

---

# Menu3D - User Guide

## Introduction

Menu3D builds an interactive 3D carousel where each page of your site is shown in an iframe. It takes **one script tag** and no config file — the script discovers your pages and builds the menu on its own.

```html
<script src="https://t-root.github.io/menu-3D/menu3d.js"></script>
```

Main URL: **`https://t-root.github.io/menu-3D/menu3d.js`**. The primary way to launch it is from the browser console (F12) on any site:

```js
document.body.appendChild(Object.assign(document.createElement('script'), { src: 'https://t-root.github.io/menu-3D/menu3d.js' }))
```

It is also safe to include on **every page**: pages loaded inside the menu's iframes skip initialization, so there is no infinite nesting.

Clicking a card label does not reload the page (which would drop a console-launched menu). The target page opens in a full-screen frame under the menu; the address bar, tab title and Back/Forward stay in sync. A hard reload (F5) loads the real page, so run the snippet again.

## Page discovery

Sources are tried in order until one returns pages:

| Source | How |
|---|---|
| `links` | Links in `<nav>`/`<header>`, falling back to every `<a href>` |
| `sitemap` | Reads `/sitemap.xml` (sitemap indexes supported) |
| `github` | On `*.github.io`, lists `.html` files in the repo via the GitHub API (cached 1h) |
| `json` | Reads `/menu3d.json` |

The current page is always the first card. Only same-origin pages are kept, non-page files and duplicates are dropped. Titles come from link text, then the page's real `<title>`, then the file name.

## Options

Set them as `data-*` attributes on the script tag (see the table above), e.g. `data-source="sitemap" data-max="8" data-exclude="/admin,/login"`, or pass them to `Menu3D.init({...})` together with `data-manual`. Precedence: defaults < `menu3d.json` < data attributes < `init()` options. `desktop`/`mobile` are merged key by key. `gap` (vw, default 2) is the minimum space between neighbouring cards — the ring radius grows with the number of cards so they never overlap.

`Menu3D.init()` resolves to `{ open, close, toggle, isOpen, destroy, items, config }`; calling it again replaces the previous menu.

## Notes

- The web has no directory listing: only pages that are linked, in the sitemap, or in the GitHub repo can be found.
- Unauthenticated GitHub API calls are limited to ~60/hour/IP (results are cached).
- Cross-origin pages that send `X-Frame-Options`/`frame-ancestors` render as empty cards.
- Iframes are created on first open; the menu lives in a Shadow DOM so styles never leak either way.
- Host via GitHub Pages or jsDelivr; `raw.githubusercontent.com` will not execute scripts.
