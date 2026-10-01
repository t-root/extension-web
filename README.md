# extension-web

Monorepo các Chrome extension (Manifest V3). Mỗi extension nằm trong một thư mục riêng, có `README.md` hướng dẫn riêng.

## Danh sách extension

| Thư mục | Mô tả |
|---|---|
| [DOM2AI_extension](DOM2AI_extension/) | Web Message & Element Inspector |
| [anti-tracking-extension](anti-tracking-extension/) | Ultimate Anti-Tracking Shield |
| [auto-lms-extension](auto-lms-extension/) | Auto LMS HUTECH |
| [div-screenshot-extension](div-screenshot-extension/) | Div Screenshot Tool |
| [gmail-auto-extension](gmail-auto-extension/) | Gmail Auto Fill |
| [menu-3D-extension](menu-3D-extension/) | Menu 3D có popup cài đặt |
| [wayground-extension](wayground-extension/) | Web Message & Element Inspector (Wayground) |

## Cài extension vào Chrome

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Chọn **Load unpacked** → trỏ tới thư mục của extension

## Quy ước

- Mỗi extension tự chứa `manifest.json` và `README.md` trong thư mục của nó.
- Không commit secret (`key.txt`, `*.key`, `.env`) — đã có trong `.gitignore`.
