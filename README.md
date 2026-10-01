# Div Screenshot Tool

Chrome extension (Manifest V3) dò và chụp ảnh một thẻ `<div>` bất kỳ trên trang web, lưu thành file PNG.

## Cách dùng

1. Trên trang web, bấm nút nổi **🎯 Bật Dò Div** ở góc trên bên phải.
2. Rê chuột: `div` đang trỏ tới được viền đỏ nét đứt.
3. Click vào `div` cần chụp → ảnh được tải về dưới tên `div-capture-<timestamp>.png` (scale 2x).
4. Bấm **🛑 Tắt Dò Div** để thoát chế độ dò.

> Một số `div` chứa ảnh từ domain khác (không bật CORS) có thể không chụp được.

## Cấu trúc

```
div-screenshot-extension/
├── manifest.json
├── content.js            # Nút bật/tắt, highlight và chụp div
└── html2canvas.min.js    # Thư viện html2canvas để render div thành canvas
```

## Cài đặt

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Chọn **Load unpacked** → trỏ tới thư mục `div-screenshot-extension`
