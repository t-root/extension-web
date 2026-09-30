// Cài đặt mặc định của extension — dùng chung cho content script và popup.
// Lưu trong chrome.storage.sync (đồng bộ theo tài khoản Chrome).
const MENU3D_SETTINGS = {
    enabled: true,          // bật/tắt toàn bộ
    disabledSites: [],      // các hostname đã tắt riêng
    preview: 'image',       // 'image' = ảnh chụp cả trang | 'iframe' = trang chạy trực tiếp
    navigation: 'page',     // 'page' = chuyển trang thật | 'frame' = mở trong khung, giữ menu
    source: 'auto',         // auto | links | sitemap | github | json
    max: 12,
    exclude: '',            // "/admin,/login"
    autoRotateSpeed: 0.2,
    gap: 2,
    itemWidth: 24,          // khung tối đa của card (vw)
    itemHeight: 32,
    captureDelay: 1200,
    cacheHours: 24
};

// Cài đặt của popup → options cho Menu3D.init()
function menu3dOptions(settings) {
    return {
        preview: settings.preview,
        navigation: settings.navigation,
        source: settings.source,
        max: settings.max,
        exclude: settings.exclude,
        autoRotateSpeed: settings.autoRotateSpeed,
        gap: settings.gap,
        captureDelay: settings.captureDelay,
        cacheHours: settings.cacheHours,
        desktop: { itemWidth: settings.itemWidth, itemHeight: settings.itemHeight },
        iconClosed: chrome.runtime.getURL('icon/close.png'),
        iconOpen: chrome.runtime.getURL('icon/open.png')
    };
}

const menu3dEnabledOn = (settings, hostname) =>
    settings.enabled && !settings.disabledSites.includes(hostname);
