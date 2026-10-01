# Ultimate Anti-Tracking Shield

Chrome extension (Manifest V3) gỡ chặn copy/paste và vô hiệu hóa việc trang web theo dõi trạng thái tab, cửa sổ, focus.

## Tính năng

- **Giả lập tab luôn hiển thị**: ép `document.hidden = false`, `visibilityState = 'visible'` và giữ nguyên tiêu đề trang.
- **Chặn sự kiện theo dõi**: `visibilitychange`, `blur`, `focus`, `focusin/out`, `mouseleave`, `pagehide`, `beforeunload`, `resize`… không tới được script của trang.
- **Mở khóa copy/paste**: gỡ các handler `oncopy`, `oncut`, `onpaste`, `onselectstart`, `oncontextmenu`, `ondragstart`, inject CSS cho phép bôi đen văn bản.
- **Mở lại phím tắt**: Ctrl/Cmd + C/V/X/A/U/S/P, F12, Ctrl+Shift+I/J.
- Dùng `MutationObserver` để áp dụng lại cho phần tử được thêm động; chạy ở mọi frame (`all_frames`) từ `document_start` trong `world: MAIN`.

## Cấu trúc

```
anti-tracking-extension/
├── manifest.json
├── content.js             # Toàn bộ logic shield
└── auto-lms-extension/    # Bản cũ (v2.2) của Auto Next LMS HUTECH, giữ lại để tham khảo
```

## Cài đặt

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Chọn **Load unpacked** → trỏ tới thư mục `anti-tracking-extension`

Extension tự hoạt động trên mọi trang, không có popup cấu hình.

## Bản Auto Next LMS cũ (`auto-lms-extension/`)

Extension riêng, tự động tua video và chuyển bài trên LMS HUTECH (công tắc Bật/Tắt, chỉnh tốc độ video, cấu hình endpoint AI). Bản mới hơn nằm ở thư mục `auto-lms-extension` của repo cha.
