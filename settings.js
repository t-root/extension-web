// Cài đặt mặc định của extension — dùng chung cho content script và popup.
// Lưu trong chrome.storage.sync (đồng bộ theo tài khoản Chrome).
const MENU3D_SETTINGS = {
    enabled: true,          // bật/tắt toàn bộ
    trigger: 'button',      // mở/đóng menu: 'button' = nút nổi | 'rightclick' = chuột phải
    preview: 'image',       // 'image' = ảnh chụp cả trang | 'iframe' = trang chạy trực tiếp
    max: 100
};

// Cài đặt của popup → options cho Menu3D.init()
function menu3dOptions(settings) {
    return {
        preview: settings.preview,
        max: settings.max,
        trigger: settings.trigger,
        iconClosed: chrome.runtime.getURL('icon/close.png'),
        iconOpen: chrome.runtime.getURL('icon/open.png')
    };
}
