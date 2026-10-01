// Content script: dựng Menu3D trên trang theo cài đặt trong popup.
// Chạy sau lib/modern-screenshot.js, menu3d.js và settings.js (xem manifest.json).
(() => {
    let settings = null;

    const loadSettings = async () => (settings = await chrome.storage.sync.get(MENU3D_SETTINGS));

    async function apply() {
        await loadSettings();
        if (settings.enabled) await Menu3D.init(menu3dOptions(settings));
        else Menu3D.destroy();
    }

    apply();

    // Đổi cài đặt trong popup → áp dụng ngay, không cần tải lại trang
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') apply();
    });

    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
        (async () => {
            if (msg.type === 'status') {
                const inst = Menu3D.instance;
                reply({ version: Menu3D.version, running: !!inst, pages: inst ? inst.items.length : 0 });
            }
        })();
        return true; // trả lời bất đồng bộ
    });
})();
