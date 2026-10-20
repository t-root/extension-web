# Web Message & Element Inspector Extension

Chrome extension để inject một message box overlay lên các website với khả năng:
- Nhập và gửi tin nhắn
- Select element từ trang web
- Gửi dữ liệu qua background script

## Cấu trúc Files

```
chrome-extension/
├── manifest.json      # Cấu hình extension
├── content.js         # Script chạy trên trang web
├── background.js      # Service worker xử lý messaging
├── styles.css         # CSS cho overlay UI
└── README.md
```

## Cài đặt

### 1. Tại Local Machine:
1. Mở Chrome, vào `chrome://extensions/`
2. Bật "Developer mode" (góc phải trên)
3. Click "Load unpacked"
4. Chọn folder `chrome-extension`

### 2. Thay đổi Backend Endpoint:

Mở file `background.js`, tìm dòng:
```javascript
const backendURL = 'http://localhost:3000/api/messages';
```

Thay đổi URL thành backend của bạn.

## Cách Sử Dụng

### Gửi tin nhắn:
1. Extension sẽ tự động inject overlay lên trang web
2. Nhập tin nhắn vào textarea
3. Click nút "📤 Send" (hoặc Ctrl+Enter)

### Chọn element:
1. Click nút "🎯 Select Element"
2. Nút sẽ chuyển sang màu xanh
3. Click vào element nào đó trên trang
4. HTML của element sẽ hiển thị trong info box
5. Khi gửi, HTML sẽ được gửi kèm theo

## API Payload

Khi gửi tin nhắn, server sẽ nhận:

```json
{
  "message": "Nội dung tin nhắn",
  "elementHTML": "<div>...</div>",
  "timestamp": "2024-01-01T12:00:00Z",
  "url": "https://example.com"
}
```

## Development Notes

- **Z-index**: Overlay được set z-index rất cao (2147483647) để luôn hiển thị ở trên cùng
- **Pointer events**: Khi bật element picker, `pointer-events: none` được set để cho phép click qua overlay
- **Error handling**: Nếu backend không có, extension sẽ simulate một response

## Backend Example (Node.js/Express)

```javascript
app.post('/api/messages', (req, res) => {
  const { message, elementHTML, timestamp, url } = req.body;
  
  console.log({
    message,
    elementHTML,
    timestamp,
    url
  });
  
  res.json({
    success: true,
    message: 'Message received',
    receivedAt: new Date().toISOString()
  });
});
```

## Context Menu

Bạn có thể mở overlay từ context menu (right-click):
- Right-click trên trang → "Open Message Box"

## Troubleshooting

- **Overlay không xuất hiện**: Kiểm tra console lỗi (F12)
- **Element picker không work**: Chắc chắn rằng bạn đã click "🎯 Pick Element" trước khi click element
- **Tin nhắn không gửi**: Kiểm tra backend URL trong `background.js` đúng chưa
