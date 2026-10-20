# extension-web

## Clone chỉ 1 extension (sparse checkout)

Ví dụ chỉ lấy thư mục `DOM2AI_extension`:

```bash
git clone --filter=blob:none --no-checkout https://github.com/t-root/extension-web.git
cd extension-web
git sparse-checkout set DOM2AI_extension
git checkout main
```

Muốn lấy thêm extension khác thì chạy:

```bash
git sparse-checkout add anti-tracking-extension
```
