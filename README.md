# Auto LMS HUTECH

Bộ Chrome extension (Manifest V3) hỗ trợ học trên LMS HUTECH: quét danh sách bài học, kiểm tra trạng thái hoàn thành, tự xem video, làm bài tập/ôn tập và xem tài liệu.

## Cấu trúc

```
auto-lms-extension/
├── auto-lms-admin-extension/    # Bản admin: quét, làm bài bằng AI và xuất file đáp án
├── auto-lms-client-extension/   # Bản client: dùng đáp án có sẵn từ data-lms-hutech
└── data-lms-hutech/             # Kho đáp án JSON, được publish lên GitHub Pages (t-root/data-lms-hutech)
```

## Tính năng chung

Panel popup được nhúng vào trang LMS, gồm:

- **Check**: quét toàn bộ bài học của khóa và kiểm tra bài nào đã hoàn thành.
- **Xem video**: mở lần lượt các bài video chưa hoàn thành.
- **Làm bài tập / Làm ôn tập**: tự trả lời các câu hỏi chưa hoàn thành.
- **Xem tài liệu**: mở các bài tài liệu.
- **Dừng mọi hoạt động**: hủy toàn bộ tác vụ đang chạy.

## Khác biệt admin / client

| | admin | client |
|---|---|---|
| Nguồn đáp án | Gọi AI qua endpoint OpenAI-compatible (cấu hình Model / Endpoint / API key trong popup, mặc định `http://127.0.0.1:5000/v1/chat/completions`) | Tải đáp án từ `https://t-root.github.io/data-lms-hutech/<MÃ_MÔN>-<baitap\|ontap>-answers.json` |
| Số tab check đồng thời | Cấu hình được trên UI (tối đa 20) | Cố định 5 |
| Làm bài tập/ôn tập | Ở tab hiện hành | Chạy nền, 5 tab song song |
| Xuất file đáp án | Có (`<MÃ_MÔN>-baitap-answers.json`, `<MÃ_MÔN>-ontap-answers.json`) | Không |

Quy trình: dùng bản **admin** làm bài và **Xuất file đáp án** → đưa file vào `data-lms-hutech` và push lên GitHub Pages → bản **client** tự lấy đáp án theo mã môn.

## Cài đặt

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Chọn **Load unpacked** → trỏ tới `auto-lms-admin-extension` hoặc `auto-lms-client-extension`
4. Mở một khóa học trên `lms.hutech.edu.vn`, panel sẽ xuất hiện trên trang.
