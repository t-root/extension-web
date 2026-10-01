# extension-web

Monorepo các Chrome extension (Manifest V3). Mỗi extension nằm trong một thư mục riêng, có `README.md` hướng dẫn riêng.

## Cài extension vào Chrome

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Chọn **Load unpacked** → trỏ tới thư mục của extension

## Quy ước

- Mỗi extension tự chứa `manifest.json` và `README.md` trong thư mục của nó.
- Không commit secret (`key.txt`, `*.key`, `.env`) — đã có trong `.gitignore`.
