# extension-web

Tập hợp các Chrome extension (Manifest V3). Mỗi extension nằm trên **một nhánh riêng**, có README hướng dẫn riêng; nhánh `main` chỉ chứa README này.

## Xem danh sách extension

Chọn nhánh trong menu branch trên GitHub, hoặc:

```bash
git ls-remote --heads https://github.com/t-root/extension-web
```

## Clone riêng một extension

```bash
git clone --single-branch -b <nhánh> https://github.com/t-root/extension-web <nhánh>
```

## Làm việc với nhiều extension trên một máy

Clone `main` rồi gắn từng nhánh vào một thư mục cùng tên bằng `git worktree`:

```bash
git clone https://github.com/t-root/extension-web
cd extension-web
git worktree add <nhánh> <nhánh>
```

Mỗi thư mục là nhánh của nó: sửa, `git commit`, `git push` ngay trong thư mục đó.

## Cài extension vào Chrome

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Chọn **Load unpacked** → trỏ tới thư mục của extension
