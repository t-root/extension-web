# menu-3D-extension

Biến mọi website thành một **menu 3D xoay vòng**: extension tự tìm các trang của website, chụp ảnh cả trang và xếp chúng thành các card trên vòng xoay 3D. Bấm một card để chuyển sang trang đó. Mọi thiết lập nằm trong **popup** của extension, không cần sửa code trang web.

<div align="center">
  <img src="img-demo/img1.png" alt="Menu3D Demo 1" width="45%" style="margin: 5px;">
  <img src="img-demo/img2.png" alt="Menu3D Demo 2" width="45%" style="margin: 5px;">
  <br>
  <img src="img-demo/img3.png" alt="Menu3D Demo 3" width="45%" style="margin: 5px;">
  <img src="img-demo/img4.png" alt="Menu3D Demo 4" width="45%" style="margin: 5px;">
</div>

## Tính năng

- **Tự tìm trang**: lấy các link có trên trang đang xem (ưu tiên menu `<nav>`, `<header>`).
- **Ảnh chụp cả trang**: mỗi card là ảnh chụp hết chiều dài và chiều ngang của trang; card tự theo tỉ lệ trang (trang dài → card cao, trang ngắn → card ngang), ảnh phủ kín 100%.
- **Hoặc trang chạy trực tiếp**: chế độ iframe tải trang ở đúng kích thước màn hình rồi thu nhỏ vừa card → giữ nguyên layout PC.
- **Popup cài đặt**: bật/tắt toàn bộ hoặc từng website, chọn kiểu card, cách chuyển trang, nguồn tìm trang, kích thước card… đổi là áp dụng ngay.
- **Chuẩn bị sẵn ở nền**: trang tải xong là extension dựng sẵn menu — chụp các trang chưa có ảnh (chế độ ảnh) hoặc tải lần lượt từng trang (chế độ iframe) → lúc mở menu mọi thứ đã xong; ảnh dùng chung cho mọi trang cùng website.
- **Không đụng tới trang**: menu nằm trong Shadow DOM, CSS của menu và của trang không ảnh hưởng nhau; chạy được cả trên trang có CSP chặn script ngoài.

## Cài đặt

Extension chưa lên Chrome Web Store, cài dạng "unpacked":

1. Tải mã nguồn: **Code → Download ZIP** trên GitHub rồi giải nén, hoặc
   ```bash
   git clone https://github.com/t-root/menu-3D.git
   ```
2. Mở `chrome://extensions` → bật **Developer mode** (góc phải trên).
3. Bấm **Load unpacked** → chọn thư mục **`menu-3D`** (thư mục có file `manifest.json`).
4. Ghim icon menu-3D-extension lên thanh công cụ, rồi **tải lại (F5)** các tab đang mở.

Cập nhật: `git pull` (hoặc tải ZIP mới) → bấm nút ↻ của menu-3D-extension trong `chrome://extensions` → F5 các tab.

Chạy được trên Chrome, Edge, Brave, Opera… (trình duyệt nhân Chromium).

## Sử dụng

- Mở/đóng menu bằng **một trong hai cách** (chọn trong popup):
  - **Nút tròn nổi** ở mép phải trang (mặc định): bấm để mở/đóng, kéo để đổi chỗ (tự hít vào mép gần nhất).
  - **Chuột phải** bất kỳ đâu trên trang (nút nổi được ẩn). Cần menu chuột phải của trình duyệt thì giữ **Shift + chuột phải**.
- Trong menu: **kéo** hoặc **cuộn chuột** để xoay, **rê chuột** vào card để dừng xoay, **bấm card** để mở trang, **ESC** để đóng.
- Card của trang đang mở luôn đứng đầu và có nhãn sáng hơn.

## Popup cài đặt

Bấm icon menu-3D-extension trên thanh công cụ:

| Mục | Ý nghĩa | Mặc định |
|---|---|---|
| **Bật extension** | Bật/tắt menu trên mọi website | Bật |
| **Mở / đóng menu bằng** | *Nút nổi trên trang* hoặc *Chuột phải* (Shift + chuột phải = menu trình duyệt) | Nút nổi |
| **Kiểu card** | *Ảnh chụp cả trang* (card tự theo tỉ lệ ảnh) hoặc *Trang chạy trực tiếp (iframe)* — iframe chỉ cho cuộn để xem, bấm vào là mở trang | Ảnh chụp |
| **Số trang tối đa** | Tính cả trang đang mở | `100` |

Cài đặt được lưu bằng `chrome.storage.sync` nên đồng bộ theo tài khoản Chrome.

## Cách hoạt động

**Tìm trang** — lấy link trong `<nav>`, `<header>` của trang đang xem; không có thì lấy mọi `<a href>`. Chỉ lấy trang **cùng domain**, bỏ file không phải trang web (`.pdf`, `.zip`…) và link trùng. Trang đang xem luôn là card đầu tiên.

Tiêu đề card lấy theo: chữ của link → `<title>` thật của trang → tên file.

**Chụp ảnh** — sau khi trang tải xong (khi trình duyệt rảnh), extension lần lượt tải từng trang chưa có ảnh vào một iframe ẩn có kích thước bằng cửa sổ, chờ trang **đứng yên** (nội dung thôi thay đổi, ảnh tải xong, hiệu ứng chạy xong — từ 1,2 đến 3 giây), cuộn hết trang để ảnh lazy-load kịp hiện, rồi chụp cả trang bằng [modern-screenshot](https://github.com/qq15725/modern-screenshot) (đóng gói sẵn trong `lib/`, không tải từ mạng). Ảnh lưu trong IndexedDB của website, giữ tối đa **24 giờ** rồi tự xóa.

## Giới hạn

- Chỉ có những trang được link tới từ trang đang xem.
- Ảnh là bản **vẽ lại** từ HTML/CSS: có thể lệch chút font/hiệu ứng; ảnh khác domain không cho CORS và canvas WebGL có thể bị trống.
- Trang đặt `body` cố định một màn hình và cuộn trong khung riêng (nhiều SPA) → ảnh chỉ có màn hình đầu.
- Chế độ iframe không kéo cao bằng cả trang vì các khối dùng đơn vị `vh` sẽ phình ra và vỡ layout.
- Trang khác domain, hoặc trang chặn nhúng (`X-Frame-Options` / CSP `frame-ancestors`) → không chụp được, card dùng iframe (có thể trống).
- Không chạy trên trang nội bộ của trình duyệt (`chrome://`, Chrome Web Store…).

## Cấu trúc

```
manifest.json            # Khai báo extension (Manifest V3)
menu3d.js                # Lõi Menu3D: tìm trang, chụp ảnh, dựng vòng xoay 3D
settings.js              # Cài đặt mặc định + chuyển thành options của Menu3D
content.js               # Content script: dựng menu theo cài đặt, nhận lệnh từ popup
popup.html/.css/.js      # Popup cài đặt
lib/modern-screenshot.js # Thư viện chụp ảnh (MIT, xem lib/LICENSE-modern-screenshot)
icon/                    # Icon extension và nút mở menu
img-demo/                # Ảnh minh họa cho README (không thuộc extension)
```

---

# menu-3D-extension (English)

Menu3D turns any website into a **rotating 3D menu**: it collects the links on the current page (nav/header first), takes a **full-page screenshot** of each one and lays them out as cards on a 3D carousel. Each card takes its page's aspect ratio and the image always fills it. Click a card to go to that page.

**Install:** download/clone this repo → `chrome://extensions` → enable *Developer mode* → *Load unpacked* → pick the repo folder (the one containing `manifest.json`) → reload open tabs.

**Popup settings:** global on/off, how to toggle the menu (floating button, or right-click anywhere — Shift + right-click keeps the browser menu), card type (full-page screenshot, or live iframe rendered at real window size and scaled down — scroll only, clicking opens the page), max pages. Screenshots are captured in the background after page load, kept for 24 hours, then deleted. Settings live in `chrome.storage.sync` and apply instantly.

**Notes:** only same-origin pages can be screenshotted; screenshots are DOM re-renders (not pixel-perfect); pages that scroll inside an inner container are captured as the first screen only; browser-internal pages are not supported.
