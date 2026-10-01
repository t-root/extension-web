# Gmail Auto Fill (v1.3.0)

Extension Chrome điền form đăng ký / đăng nhập Google.

## Cài đặt
1. Mở `chrome://extensions`, bật **Developer mode**.
2. **Load unpacked** → chọn thư mục `gmail-auto-fill` (thư mục có `manifest.json`).
3. Mỗi lần cập nhật code: bấm nút **Reload** của extension, rồi F5 trang Google.

## Đăng ký
1. Popup → mục **Đăng ký** → điền thông tin → **Lưu cấu hình**.
   Mặc định: First name `T-Root`, ngày sinh `01/01/2000`, giới tính `Nam`, mật khẩu `Tr@n`.
2. **Mở trang ĐK** (chỉ mở trang, không điền).
3. Bấm **▶ Điền form đăng ký** → từ lúc này extension tự dò và điền ở mọi bước
   (họ tên → ngày sinh/giới tính → chọn "tạo địa chỉ Gmail của riêng bạn" → username → mật khẩu).
   Bạn chỉ cần bấm **Tiếp theo** trên trang Google.
4. Username tự tăng số sau mỗi lần điền.

## Đăng nhập
1. Popup → mục **Đăng nhập** → dán danh sách, mỗi dòng một tài khoản:
   ```
   nhanvien1 daylamk
   nhanvien2 daylemk2
   ```
2. **Tải danh sách** → chọn tài khoản.
3. **Mở trang ĐN** → bấm **▶ Điền form đăng nhập** → tự điền email, qua bước sau tự điền mật khẩu của tài khoản đó.

## Khi nào extension điền?
- Chỉ sau khi bấm nút **▶ Điền form**, và chỉ trong tab đó.
- Nút **▶ Điền form** là nút bật/tắt: đang chạy thì nó thành **■ Dừng tự điền** (màu đỏ), bấm lần nữa để dừng.
- Tự dừng khi: bấm **■ Dừng tự điền**, bấm **Mở trang** lần nữa, rời khỏi accounts.google.com, đóng tab hoặc đóng trình duyệt.
- Mỗi ô chỉ được điền 1 lần mỗi lượt, nên sửa tay sẽ không bị ghi đè.

## File
- `popup.html / popup.js`: giao diện, lưu cấu hình và danh sách tài khoản.
- `background.js`: nhớ tab nào đang chạy chế độ nào (đăng ký hoặc đăng nhập).
- `content.js`: theo dõi trang, tự dò và điền từng bước.
