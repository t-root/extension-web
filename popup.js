// Popup cài đặt: đổi là lưu ngay vào chrome.storage.sync, content script tự áp dụng.
const $ = sel => document.querySelector(sel);
const fields = Array.from(document.querySelectorAll('[data-key]'));

let settings = { ...MENU3D_SETTINGS };
let tab = null;
let host = '';

function readField(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
        const n = parseFloat(el.value);
        return Number.isFinite(n) ? n : MENU3D_SETTINGS[el.dataset.key];
    }
    return el.value.trim();
}

function fill() {
    fields.forEach(el => {
        const value = settings[el.dataset.key];
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value;
    });
}

let statusTimer = null;
async function save(patch) {
    Object.assign(settings, patch);
    await chrome.storage.sync.set(patch);
    fill();
    setStatus('Đã lưu');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(refreshStatus, 1000);
}

// Nhắn content script của tab hiện tại; null = trang không có content script
async function send(msg) {
    if (!tab || !host) return null;
    try {
        return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (_) {
        return null;
    }
}

function setStatus(text) {
    $('#status').textContent = text;
}

async function refreshStatus() {
    if (!host) return setStatus('Menu3D chỉ chạy trên trang web http/https.');
    const st = await send({ type: 'status' });
    if (!st) return setStatus('Chưa chạy trên tab này — tải lại trang (F5) sau khi cài/cập nhật extension.');
    setStatus(st.running ? `Đang chạy · ${st.pages} trang trong menu` : 'Đang tắt.');
}

fields.forEach(el => {
    el.addEventListener('change', () => save({ [el.dataset.key]: readField(el) }));
});

(async () => {
    $('#version').textContent = 'v' + chrome.runtime.getManifest().version;
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        const u = new URL(tab.url);
        if (/^https?:$/.test(u.protocol)) host = u.hostname;
    } catch (_) {}
    settings = await chrome.storage.sync.get(MENU3D_SETTINGS);
    fill();
    refreshStatus();
})();
