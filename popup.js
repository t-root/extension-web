// Popup cài đặt: đổi là lưu ngay vào chrome.storage.sync, content script tự áp dụng.
const $ = sel => document.querySelector(sel);
const fields = Array.from(document.querySelectorAll('[data-key]'));
const siteToggle = $('#site-toggle');

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
    siteToggle.checked = !!host && !settings.disabledSites.includes(host);
    siteToggle.disabled = !host || !settings.enabled;
}

let savedTimer = null;
async function save(patch) {
    Object.assign(settings, patch);
    await chrome.storage.sync.set(patch);
    fill();
    $('#saved').textContent = 'Đã lưu';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('#saved').textContent = ''), 1500);
    setTimeout(refreshStatus, 400);
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
    setStatus(st.running ? `Đang chạy · ${st.pages} trang trong menu` : 'Đang tắt trên trang này.');
}

fields.forEach(el => {
    el.addEventListener('change', () => save({ [el.dataset.key]: readField(el) }));
});

siteToggle.addEventListener('change', () => {
    const list = settings.disabledSites.filter(h => h !== host);
    if (!siteToggle.checked) list.push(host);
    save({ disabledSites: list });
});

$('#open-btn').addEventListener('click', async () => {
    const res = await send({ type: 'open' });
    if (res && res.ok) window.close();
    else if (res) setStatus('Không tìm thấy trang nào để hiển thị.');
    else refreshStatus();
});

$('#clear-btn').addEventListener('click', async () => {
    const res = await send({ type: 'clearCache' });
    setStatus(res ? 'Đã xóa ảnh, mở menu để chụp lại.' : 'Không xóa được — tải lại trang rồi thử lại.');
});

$('#reset-btn').addEventListener('click', async () => {
    await chrome.storage.sync.clear();
    settings = await chrome.storage.sync.get(MENU3D_SETTINGS);
    fill();
    setTimeout(refreshStatus, 400);
});

(async () => {
    $('#version').textContent = 'v' + chrome.runtime.getManifest().version;
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        const u = new URL(tab.url);
        if (/^https?:$/.test(u.protocol)) host = u.hostname;
    } catch (_) {}
    $('#host').textContent = host || 'trang này';
    settings = await chrome.storage.sync.get(MENU3D_SETTINGS);
    fill();
    refreshStatus();
})();
