# VoxShift — đọc phụ đề YouTube bằng tiếng Việt

Extension Chrome/Edge cho **YouTube**. Lấy phụ đề **tiếng Việt** của video; nếu không có thì lấy phụ đề gốc (ưu tiên tiếng Anh) và nhờ
**YouTube dịch sang tiếng Việt**, rồi đọc thành tiếng đúng thời điểm. Không có server, không tạo giọng, không cài gì thêm.

## Dùng

1. `chrome://extensions` (hoặc `edge://extensions`) → bật **Developer mode** → **Load unpacked** → chọn thư mục này.
2. Mở một video YouTube (F5 nếu trang đã mở từ trước), bấm biểu tượng VoxShift → **Bắt đầu**. Bấm **Dừng** để tắt.
3. Popup chỉnh được: **Giọng** và **Âm gốc** (mức tiếng gốc khi đang đọc, mặc định 20%). Tốc độ đọc tự khớp theo độ dài câu, không chỉnh tay.

## Cách hoạt động

```
chọn track phụ đề ──► lấy phụ đề ──► ghép thành câu ──► đến giờ thì đọc
(vi, hoặc gốc + dịch vi)                                  (tự tăng tốc nếu câu dài hơn chỗ trống)
```

- **Hai nửa nói chuyện qua `window.postMessage`:** `page_hook.js` chạy trong trang (đọc được trình phát YouTube) và độc lập, không nạp
  file nào khác; `content.js` + `lib/cues.js` chạy trong vùng cô lập của extension. Trang gửi danh sách track, content script chọn
  track (có test), trang đi lấy phụ đề rồi gửi lại.
- **Lấy phụ đề** (`page_hook.js`). Tải thẳng `baseUrl` của track (cách các extension cũ làm) giờ trả về **rỗng**
  vì thiếu token `pot` do trình phát tạo. Nên extension nhớ URL yêu cầu phụ đề của chính trình phát (có đủ token) rồi tự tải lại
  với `lang` / `kind` / `name` / `tlang` mong muốn (chữ ký không phủ các tham số này). Có track `vi` thì lấy `lang=vi`; không có thì
  lấy track gốc (ưu tiên tiếng Anh) kèm `tlang=vi` để YouTube dịch. Chưa có URL của trình phát thì bật CC để nó tải thử một lần.
- **Khi YouTube chặn dịch** (HTTP 429, hay gặp nếu thử dồn dập, kéo dài vài phút): lấy phụ đề **gốc** (không bị chặn) rồi dịch từng
  câu bằng Google Dịch ngay trước khi đọc. Bản đã tải được lưu lại nên bắt đầu/dừng nhiều lần không gửi thêm yêu cầu.
- Chỉ dùng URL của **đúng video đang xem** (chuyển video trong YouTube không tải lại trang vẫn đúng).
- `content.js` hẹn giờ theo `video.currentTime`: pause/tua thì ngừng đọc; quảng cáo thì im; đổi video không tải lại trang vẫn chạy.
- **Giọng đọc**: nếu máy/trình duyệt có giọng tiếng Việt (Edge có sẵn giọng rất tự nhiên) thì dùng nó qua `speechSynthesis`;
  không có thì dùng **giọng Google** (cần mạng): `background.js` tải trước âm thanh các câu sắp tới nên không bị trễ.
  Chọn tay trong popup nếu muốn.

## Lưu ý

- Giọng Google và bản dịch dự phòng dùng endpoint công khai không chính thức của Google Dịch (`translate_tts`, `translate_a/single`),
  có thể bị đổi hoặc chặn; các câu phụ đề được gửi tới Google. Bản dịch chính do YouTube thực hiện.
- Nếu popup báo "YouTube không trả phụ đề" hoặc "tạm chặn": đợi vài phút rồi bấm lại; thử tải lại trang (F5) nếu vừa cài/cập nhật.
- Chrome có thể chặn phát tiếng cho tới khi bạn bấm vào trang một lần (popup sẽ báo "Bấm vào trang để bật tiếng").
- Chỉ chạy trên `www.youtube.com`. Video không có phụ đề nào (kể cả tự động) thì không đọc được.
- Dịch tự động có thể sai; phụ đề tự động của YouTube gồm các dòng ngắn nên đọc có thể hơi ngắt quãng.

## Kiểm thử

```bash
node voxshift-extension/test/cues.test.js
```

Test logic thuần (đọc phụ đề, ghép câu, chọn track, tốc độ). Quy trình đầy đủ đã chạy thử trên YouTube thật (nạp đúng code của
extension vào trang, `chrome.*` giả): video có phụ đề tiếng Việt do người làm (240 câu, 0,3s, lần bắt đầu thứ hai không gửi yêu cầu nào),
video chỉ có tiếng Anh (YouTube dịch, 78 câu), chuyển video trong YouTube, đường dự phòng khi dịch bị chặn 429 (mô phỏng), đọc đúng giờ
lệch dưới 0,1s, tăng tốc khi câu dài, ngừng khi pause. Chưa thử khi nạp thật làm extension trong Chrome (manifest, popup).
