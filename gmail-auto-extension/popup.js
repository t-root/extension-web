const SIGNUP_URL = 'https://accounts.google.com/signup';
const LOGIN_URL = 'https://accounts.google.com/AccountChooser/signinchooser';
const SIGNUP_IDS = ['firstName', 'lastName', 'birthday', 'gender', 'password', 'usernamePrefix', 'usernameNumber'];

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const runKey = (tabId) => 'run_' + tabId;

let accounts = [];
let selectedIndex = -1;
let running = null; // null | 'signup' | 'login' (của tab hiện tại)

const LABELS = {
  signup: '▶ Điền form đăng ký',
  login: '▶ Điền form đăng nhập',
  stop: '■ Dừng tự điền'
};

// Nút Điền <-> Dừng
function updateButtons() {
  const s = $('btnFillSignup');
  const l = $('btnFillLogin');
  s.textContent = running === 'signup' ? LABELS.stop : LABELS.signup;
  l.textContent = running === 'login' ? LABELS.stop : LABELS.login;
  s.classList.toggle('running', running === 'signup');
  l.classList.toggle('running', running === 'login');
  l.disabled = running !== 'login' && !accounts[selectedIndex];
}

const setStatus = (msg) => { statusEl.textContent = msg; };

// ===================== CHUYỂN TAB TRONG POPUP (không lưu) =====================
function showSection(which) {
  $('modeSignup').classList.toggle('active', which === 'signup');
  $('modeLogin').classList.toggle('active', which === 'login');
  $('sectionSignup').classList.toggle('active', which === 'signup');
  $('sectionLogin').classList.toggle('active', which === 'login');
}
$('modeSignup').onclick = () => showSection('signup');
$('modeLogin').onclick = () => showSection('login');

// ===================== TAB TRÌNH DUYỆT =====================
async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function openUrl(url) {
  const tab = await getTab();
  if (tab?.id) {
    await stopTab(tab.id); // mở trang mới -> chưa điền cho tới khi bấm nút Điền
    await chrome.tabs.update(tab.id, { url });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function sendToTab(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // Trang mở trước khi cài/reload extension -> chưa có content script
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, msg);
  }
}

async function startTab(mode) {
  const tab = await getTab();
  if (!tab?.id || !String(tab.url || '').startsWith('https://accounts.google.com/')) {
    setStatus('Tab hiện tại không phải accounts.google.com. Bấm "Mở trang" trước.');
    return false;
  }
  await chrome.storage.session.set({ [runKey(tab.id)]: mode });
  try {
    await sendToTab(tab.id, { type: 'start', mode });
  } catch (e) {
    await chrome.storage.session.remove(runKey(tab.id));
    setStatus('Lỗi: chờ trang load xong rồi bấm lại.');
    return false;
  }
  running = mode;
  updateButtons();
  return true;
}

async function stopTab(tabId) {
  await chrome.storage.session.remove(runKey(tabId));
  try { await chrome.tabs.sendMessage(tabId, { type: 'stop' }); } catch (e) { /* chưa có content script */ }
  running = null;
  updateButtons();
}

async function stopCurrent() {
  const tab = await getTab();
  if (tab?.id) await stopTab(tab.id);
  setStatus('Đã dừng tự điền ở tab này.');
}

// ===================== ĐĂNG KÝ =====================
function getSignupConfig() {
  const c = {};
  SIGNUP_IDS.forEach((id) => { c[id] = $(id).value.trim(); });
  c.usernameNumber = Number(c.usernameNumber || 0);
  return c;
}

$('btnSaveSignup').onclick = async () => {
  await chrome.storage.local.set(getSignupConfig());
  setStatus('Đã lưu cấu hình đăng ký.');
};

$('btnOpenSignup').onclick = async () => {
  await chrome.storage.local.set(getSignupConfig());
  await openUrl(SIGNUP_URL);
  setStatus('Đã mở trang đăng ký. Bấm "▶ Điền form đăng ký" để bắt đầu.');
};

$('btnFillSignup').onclick = async () => {
  if (running === 'signup') { await stopCurrent(); return; }
  await chrome.storage.local.set(getSignupConfig());
  if (await startTab('signup')) {
    setStatus('ĐANG CHẠY (đăng ký): tự dò và điền ở mọi bước.');
  }
};

// ===================== ĐĂNG NHẬP =====================
function parseAccounts(text) {
  const list = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) throw new Error(`Dòng sai định dạng: "${line}" (cần: tài_khoản mật_khẩu)`);
    list.push({ email: parts[0], password: parts.slice(1).join(' ') });
  }
  return list;
}

function renderAccountList() {
  const wrap = $('accountListWrap');
  const list = $('accountList');
  list.innerHTML = '';
  if (!accounts.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  accounts.forEach((acc, i) => {
    const div = document.createElement('div');
    div.className = 'account-item' + (i === selectedIndex ? ' selected' : '');
    const email = document.createElement('span');
    email.className = 'acc-email';
    email.textContent = `${i + 1}. ${acc.email}`;
    const pass = document.createElement('span');
    pass.className = 'acc-pass';
    pass.textContent = acc.password;
    div.append(email, pass);
    div.onclick = () => selectAccount(i);
    list.appendChild(div);
  });
}

async function selectAccount(i) {
  selectedIndex = i;
  const acc = accounts[i];
  renderAccountList();
  updateButtons();
  if (acc) {
    await chrome.storage.local.set({
      selectedAccountIndex: i,
      loginEmail: acc.email,
      loginPassword: acc.password
    });
    setStatus(`Đã chọn: ${acc.email}`);
  }
}

$('btnLoadAccounts').onclick = async () => {
  const text = $('accountsText').value.trim();
  if (!text) { setStatus('Hãy dán danh sách tài khoản.'); return; }
  let parsed;
  try {
    parsed = parseAccounts(text);
  } catch (e) {
    setStatus(e.message);
    return;
  }
  if (!parsed.length) { setStatus('Không có tài khoản hợp lệ.'); return; }
  accounts = parsed;
  await chrome.storage.local.set({ accounts, accountsText: text });
  await selectAccount(0);
  setStatus(`Đã tải ${accounts.length} tài khoản, đang chọn: ${accounts[0].email}`);
};

$('btnClearAccounts').onclick = async () => {
  accounts = [];
  selectedIndex = -1;
  await chrome.storage.local.remove(['accounts', 'accountsText', 'selectedAccountIndex', 'loginEmail', 'loginPassword']);
  $('accountsText').value = '';
  renderAccountList();
  updateButtons();
  setStatus('Đã xóa danh sách tài khoản.');
};

$('btnOpenLogin').onclick = async () => {
  await openUrl(LOGIN_URL);
  setStatus('Đã mở trang đăng nhập. Bấm "▶ Điền form đăng nhập" để bắt đầu.');
};

$('btnFillLogin').onclick = async () => {
  if (running === 'login') { await stopCurrent(); return; }
  const acc = accounts[selectedIndex];
  if (!acc) { setStatus('Hãy chọn 1 tài khoản trước.'); return; }
  await chrome.storage.local.set({
    selectedAccountIndex: selectedIndex,
    loginEmail: acc.email,
    loginPassword: acc.password
  });
  if (await startTab('login')) {
    setStatus(`ĐANG CHẠY (đăng nhập): ${acc.email}`);
  }
};

// ===================== LOAD DỮ LIỆU ĐÃ LƯU =====================
(async () => {
  const v = await chrome.storage.local.get([
    ...SIGNUP_IDS, 'accounts', 'accountsText', 'selectedAccountIndex'
  ]);
  // Chưa lưu (hoặc lưu rỗng) -> giữ mặc định: T-Root, 01/01/2000, Nam, Tr@n
  SIGNUP_IDS.forEach((id) => {
    if (v[id] !== undefined && v[id] !== '') $(id).value = v[id];
  });
  if (v.accountsText) $('accountsText').value = v.accountsText;
  if (Array.isArray(v.accounts) && v.accounts.length) {
    accounts = v.accounts;
    const i = typeof v.selectedAccountIndex === 'number' ? v.selectedAccountIndex : -1;
    if (accounts[i]) await selectAccount(i);
    else renderAccountList();
  }

  // Hiện trạng thái của tab hiện tại + mở đúng mục trong popup
  const tab = await getTab();
  running = tab?.id ? (await chrome.storage.session.get(runKey(tab.id)))[runKey(tab.id)] || null : null;
  updateButtons();
  if (running) {
    showSection(running);
    setStatus(`ĐANG CHẠY (${running === 'signup' ? 'đăng ký' : 'đăng nhập'}) ở tab này.`);
  } else {
    setStatus('');
  }
})();
