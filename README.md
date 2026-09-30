# Menu3D — Chrome Extension

Biến mọi website thành một **menu 3D xoay vòng**: extension tự tìm các trang của website, chụp ảnh cả trang và xếp chúng thành các card trên vòng xoay 3D. Bấm một card để chuyển sang trang đó. Mọi thiết lập nằm trong **popup** của extension, không cần sửa code trang web.

<div align="center">
  <img src="img-demo/img1.png" alt="Menu3D Demo 1" width="45%" style="margin: 5px;">
  <img src="img-demo/img2.png" alt="Menu3D Demo 2" width="45%" style="margin: 5px;">
  <br>
  <img src="img-demo/img3.png" alt="Menu3D Demo 3" width="45%" style="margin: 5px;">
  <img src="img-demo/img4.png" alt="Menu3D Demo 4" width="45%" style="margin: 5px;">
</div>

## Tính năng

- **Tự tìm trang**: lấy link trong menu/`<nav>` của trang, `sitemap.xml`, repo GitHub (site `*.github.io`) hoặc file `/menu3d.json`.
- **Ảnh chụp cả trang**: mỗi card là ảnh chụp hết chiều dài và chiều ngang của trang; card tự theo tỉ lệ trang (trang dài → card cao, trang ngắn → card ngang), ảnh phủ kín 100%.
- **Hoặc trang chạy trực tiếp**: chế độ iframe tải trang ở đúng kích thước màn hình rồi thu nhỏ vừa card → giữ nguyên layout PC.
- **Popup cài đặt**: bật/tắt toàn bộ hoặc từng website, chọn kiểu card, cách chuyển trang, nguồn tìm trang, kích thước card… đổi là áp dụng ngay.
- **Nhẹ**: card chỉ được tạo và chụp khi mở menu lần đầu; ảnh được lưu lại để lần sau hiện ngay.
- **Không đụng tới trang**: menu nằm trong Shadow DOM, CSS của menu và của trang không ảnh hưởng nhau; chạy được cả trên trang có CSP chặn script ngoài.

## Cài đặt

Extension chưa lên Chrome Web Store, cài dạng "unpacked":

1. Tải mã nguồn: **Code → Download ZIP** trên GitHub rồi giải nén, hoặc
   ```bash
   git clone https://github.com/t-root/menu-3D.git
   ```
2. Mở `chrome://extensions` → bật **Developer mode** (góc phải trên).
3. Bấm **Load unpacked** → chọn thư mục **`menu-3D`** (thư mục có file `manifest.json`).
4. Ghim icon Menu3D lên thanh công cụ, rồi **tải lại (F5)** các tab đang mở.

Cập nhật: `git pull` (hoặc tải ZIP mới) → bấm nút ↻ của Menu3D trong `chrome://extensions` → F5 các tab.

Chạy được trên Chrome, Edge, Brave, Opera… (trình duyệt nhân Chromium).

## Sử dụng

- Nút tròn nổi ở mép phải trang: **bấm** để mở/đóng menu, **kéo** để đổi chỗ (tự hít vào mép gần nhất).
- Trong menu: **kéo** hoặc **cuộn chuột** để xoay, **rê chuột** vào card để dừng xoay, **bấm card** để mở trang, **ESC** để đóng.
- Card của trang đang mở luôn đứng đầu và có nhãn sáng hơn.

## Popup cài đặt

Bấm icon Menu3D trên thanh công cụ:

| Mục | Ý nghĩa | Mặc định |
|---|---|---|
| **Bật Menu3D** | Bật/tắt trên mọi website | Bật |
| **Bật trên _website_** | Tắt riêng website đang xem | Bật |
| **Mở menu trên tab này** | Mở menu ngay (kể cả khi website đang tắt) | |
| **Kiểu card** | *Ảnh chụp cả trang* hoặc *Trang chạy trực tiếp (iframe)* | Ảnh chụp |
| **Khi bấm card** | *Chuyển trang thật* hoặc *Mở trong khung, giữ menu* (URL, tiêu đề tab, Back/Forward vẫn đồng bộ) | Chuyển trang thật |
| **Tốc độ tự xoay** | Độ/khung hình, `0` = đứng yên | `0.2` |
| **Khoảng cách card** | Khoảng hở tối thiểu giữa 2 card (vw); nhiều card thì vòng tự nới rộng | `2` |
| **Card rộng / cao tối đa** | Khung tối đa của card (vw); card co theo tỉ lệ trang bên trong khung này | `24` / `32` |
| **Nguồn** | *Tự động* thử lần lượt: link trên trang → sitemap.xml → repo GitHub → `/menu3d.json` | Tự động |
| **Số trang tối đa** | Tính cả trang đang mở | `12` |
| **Bỏ qua đường dẫn** | Bỏ các trang có đường dẫn bắt đầu bằng những prefix này, cách nhau dấu phẩy, vd `/admin,/login` | |
| **Chờ trước khi chụp** | ms chờ sau khi trang tải xong rồi mới chụp (tăng lên cho trang nhiều animation) | `1200` |
| **Giữ ảnh** | Số giờ dùng lại ảnh đã chụp | `24` |
| **Xóa ảnh đã chụp** | Xóa ảnh của website đang xem để chụp lại | |
| **Khôi phục mặc định** | Đưa mọi cài đặt về mặc định | |

Cài đặt được lưu bằng `chrome.storage.sync` nên đồng bộ theo tài khoản Chrome.

## Cách hoạt động

**Tìm trang** — chỉ lấy trang **cùng domain**, bỏ file không phải trang web (`.pdf`, `.zip`…) và link trùng:

| Nguồn | Cách lấy |
|---|---|
| Link trên trang | Link trong `<nav>`, `<header>`; không có thì lấy mọi `<a href>` |
| sitemap.xml | Đọc `/sitemap.xml` (hỗ trợ cả sitemap index) |
| Repo GitHub | Site `*.github.io` → liệt kê file `.html` trong repo qua GitHub API (cache 1 giờ, giới hạn ~60 lượt/giờ) |
| `/menu3d.json` | Danh sách do chủ site tự khai báo (xem bên dưới) |

Tiêu đề card lấy theo: chữ của link → `<title>` thật của trang → tên file.

**Chụp ảnh** — khi mở menu lần đầu, extension lần lượt tải từng trang vào một iframe ẩn có kích thước bằng cửa sổ, cuộn hết trang để ảnh lazy-load kịp hiện, rồi chụp cả trang bằng [modern-screenshot](https://github.com/qq15725/modern-screenshot) (đóng gói sẵn trong `lib/`, không tải từ mạng). Ảnh lưu trong IndexedDB của website.

**File `/menu3d.json`** (tùy chọn, đặt ở gốc website) — mảng trang, hoặc object có `items` và các thông số khác:

```json
{
  "items": [
    { "path": "/", "title": "Trang chủ" },
    { "path": "/pricing", "title": "Bảng giá" }
  ]
}
```

## Giới hạn

- Chỉ tìm được những trang có link tới, có trong sitemap, repo GitHub hoặc `menu3d.json` — web không có "liệt kê thư mục".
- Ảnh là bản **vẽ lại** từ HTML/CSS: có thể lệch chút font/hiệu ứng; ảnh khác domain không cho CORS và canvas WebGL có thể bị trống.
- Trang đặt `body` cố định một màn hình và cuộn trong khung riêng (nhiều SPA) → ảnh chỉ có màn hình đầu.
- Chế độ iframe không kéo cao bằng cả trang vì các khối dùng đơn vị `vh` sẽ phình ra và vỡ layout.
- Trang khác domain, hoặc trang chặn nhúng (`X-Frame-Options` / CSP `frame-ancestors`) → không chụp được, card dùng iframe (có thể trống).
- Không chạy trên trang nội bộ của trình duyệt (`chrome://`, Chrome Web Store…).

## Dùng không cần extension

`menu3d.js` vẫn chạy độc lập qua GitHub Pages (thư viện chụp ảnh khi đó tải từ jsDelivr; bấm card mặc định mở trong khung để giữ menu):

- **Console** (F12) trên trang bất kỳ:
  ```js
  document.body.appendChild(Object.assign(document.createElement('script'), { src: 'https://t-root.github.io/menu-3D/menu3d.js?v=' + Date.now() }))
  ```
- **Nhúng vào HTML**, tùy chỉnh bằng `data-*` (cùng tên với cài đặt, dạng kebab-case: `data-preview`, `data-navigation`, `data-source`, `data-max`, `data-exclude`, `data-gap`, `data-capture-delay`, `data-cache-hours`, `data-auto-rotate-speed`, `data-desktop='{"itemWidth":24,"itemHeight":32}'`…):
  ```html
  <script src="https://t-root.github.io/menu-3D/menu3d.js" data-max="8" data-exclude="/admin,/login"></script>
  ```
- **JavaScript**: `data-manual` rồi gọi `Menu3D.init({...})` → trả về `{ open, close, toggle, isOpen, navigate, destroy, items, config }`; `Menu3D.clearCache()` xóa ảnh đã lưu.

## Cấu trúc

```
manifest.json            # Khai báo extension (Manifest V3)
menu3d.js                # Lõi Menu3D (dùng chung cho extension và GitHub Pages)
settings.js              # Cài đặt mặc định + chuyển thành options của Menu3D
content.js               # Content script: dựng menu theo cài đặt, nhận lệnh từ popup
popup.html/.css/.js      # Popup cài đặt
lib/modern-screenshot.js # Thư viện chụp ảnh (MIT, xem lib/LICENSE-modern-screenshot)
icon/                    # Icon extension và nút mở menu
img-demo/                # Ảnh minh họa cho README (không thuộc extension)
```

---

# Menu3D — Chrome Extension (English)

Menu3D turns any website into a **rotating 3D menu**: it discovers the site's pages (nav links, `sitemap.xml`, the GitHub repo of a `*.github.io` site, or `/menu3d.json`), takes a **full-page screenshot** of each one and lays them out as cards on a 3D carousel. Each card takes its page's aspect ratio and the image always fills it. Click a card to go to that page.

**Install:** download/clone this repo → `chrome://extensions` → enable *Developer mode* → *Load unpacked* → pick the repo folder (the one containing `manifest.json`) → reload open tabs.

**Popup settings:** global on/off, per-site on/off, open the menu on the current tab, card type (full-page screenshot or live iframe rendered at real window size and scaled down), click behaviour (real navigation or in-page frame that keeps the menu), rotation speed, card gap and max card size, page source, max pages, excluded paths, capture delay, screenshot cache lifetime, clear cached screenshots, reset to defaults. Settings live in `chrome.storage.sync` and apply instantly.

**Notes:** only same-origin pages can be screenshotted; screenshots are DOM re-renders (not pixel-perfect); pages that scroll inside an inner container are captured as the first screen only; browser-internal pages are not supported. `menu3d.js` still works without the extension via GitHub Pages (`https://t-root.github.io/menu-3D/menu3d.js`) (console snippet, `<script>` tag with `data-*` options, or `Menu3D.init()`).
