(function () {
  // ===================== HELPERS =====================
  const visible = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };

  // Chỉ lấy phần tử ĐANG HIỂN THỊ (tránh điền vào field ẩn của bước khác)
  const pick = (...sels) => {
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        if (visible(el)) return el;
      }
    }
    return null;
  };

  // Mỗi field chỉ điền 1 lần -> không ghi đè khi bạn sửa tay, không lặp vô hạn
  const isDone = (el) => el.dataset.gafDone === '1';
  const markDone = (el) => { el.dataset.gafDone = '1'; };

  const setValue = (el, v) => {
    if (!el || v === undefined || v === null || v === '' || isDone(el)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, String(v));
    else el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    markDone(el);
    return true;
  };

  const setSelect = (el, v) => {
    if (!el || !v || isDone(el)) return false;
    el.value = String(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    markDone(el);
    return true;
  };

  const clickOption = async (box, value, texts) => {
    box.click();
    await new Promise((r) => setTimeout(r, 350));
    const wanted = (Array.isArray(texts) ? texts : [texts]).filter(Boolean).map((x) => String(x).toLowerCase());
    const lists = [...document.querySelectorAll('ul[role="listbox"],div[role="listbox"]')].filter(visible);
    const list = lists.find((x) => (x.getAttribute('aria-label') || '').toLowerCase().includes('giới tính')) || lists[lists.length - 1];
    const os = [...(list || document).querySelectorAll('li[data-value],[role="option"]')].filter(visible);
    let o = os.find((x) => x.getAttribute('data-value') === String(value));
    if (!o) o = os.find((x) => wanted.some((t) => x.textContent.trim().toLowerCase().includes(t)));
    if (o) {
      o.scrollIntoView({ block: 'nearest' });
      o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      o.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      o.click();
      return true;
    }
    return false;
  };

  // Dropdown kiểu Google: thử tối đa 3 lần rồi thôi (tránh mở/đóng liên tục)
  const selectDropdownOnce = async (box, value, texts) => {
    if (!box || isDone(box)) return;
    const tries = Number(box.dataset.gafTry || 0);
    if (tries >= 3) return;
    box.dataset.gafTry = String(tries + 1);
    if (await clickOption(box, value, texts)) markDone(box);
  };

  // ===================== ĐĂNG KÝ =====================
  async function fillSignup() {
    const c = await chrome.storage.local.get([
      'firstName', 'lastName', 'birthday', 'gender',
      'password', 'usernamePrefix', 'usernameNumber'
    ]);

    // Bước: Họ tên
    setValue(pick('input[name="firstName"]'), c.firstName);
    setValue(pick('input[name="lastName"]'), c.lastName);

    // Bước: Ngày sinh + giới tính
    const [d, m, y] = String(c.birthday || '').split('/');
    setValue(pick('input[name="day"]', 'input#day', 'input[autocomplete="bday-day"]'), d);
    setValue(pick('input[name="year"]', 'input#year', 'input[autocomplete="bday-year"]'), y);

    if (m) {
      const monthSelect = pick('select#month', 'select[name="month"]');
      if (monthSelect) setSelect(monthSelect, Number(m));
      else await selectDropdownOnce(pick('#month [jsname="oYxtQd"]', '#month [role="combobox"]', '#month'), Number(m), m);
    }

    const gender = String(c.gender || 1);
    const genderSelect = pick('select#gender', 'select[name="gender"]');
    if (genderSelect) {
      setSelect(genderSelect, gender);
    } else {
      await selectDropdownOnce(
        pick(
          '#gender [jsname="oYxtQd"]',
          '#gender [role="combobox"]',
          '#gender',
          '[aria-label="Giới tính"][role="combobox"]',
          '[aria-label="Gender"][role="combobox"]'
        ),
        gender,
        {
          1: ['male', 'nam'],
          2: ['female', 'nữ', 'nu'],
          3: ['rather not say', 'prefer not to say', 'không muốn trả lời', 'khong muon tra loi'],
          4: ['custom', 'tùy chỉnh', 'tuy chinh']
        }[gender]
      );
    }

    // Bước: Chọn địa chỉ Gmail -> chọn "Tạo địa chỉ Gmail của riêng bạn" nếu có
    if (!pick('input[name="Username"]')) {
      const radios = [...document.querySelectorAll('[role="radio"], input[type="radio"]')];
      const custom = radios.find((r) => {
        const box = r.closest('[role="radio"], label') || r.parentElement?.parentElement;
        const text = ((r.getAttribute('aria-label') || '') + ' ' + (box?.textContent || '')).toLowerCase();
        return /riêng bạn|create your own/.test(text);
      });
      if (custom && !isDone(custom)) {
        markDone(custom);
        custom.click();
      }
    }

    // Bước: Username (tự tăng số)
    const userEl = pick('input[name="Username"]');
    if (userEl && !userEl.value && !isDone(userEl) && c.usernamePrefix) {
      const n = Number(c.usernameNumber || 0);
      if (setValue(userEl, c.usernamePrefix + n)) {
        await chrome.storage.local.set({ usernameNumber: n + 1 });
      }
    }

    // Bước: Mật khẩu (mật khẩu ĐĂNG KÝ)
    setValue(pick('input[name="Passwd"]'), c.password);
    setValue(pick('input[name="PasswdAgain"]', 'input[name="ConfirmPasswd"]'), c.password);
  }

  // ===================== ĐĂNG NHẬP =====================
  async function fillLogin() {
    const c = await chrome.storage.local.get(['loginEmail', 'loginPassword']);

    // Bước 1: email / username
    setValue(
      pick(
        'input#identifierId',
        'input[name="identifier"]',
        'input[type="email"]',
        'input[autocomplete="username webauthn"]',
        'input[autocomplete="username"]'
      ),
      c.loginEmail
    );

    // Bước 2: mật khẩu (mật khẩu của TÀI KHOẢN ĐÃ CHỌN)
    setValue(
      pick(
        'input[name="Passwd"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
        'input[type="password"]'
      ),
      c.loginPassword
    );
  }

  // ===================== ĐIỀU KHIỂN =====================
  // mode = null      -> KHÔNG làm gì (chưa bấm nút Điền)
  // mode = 'signup'  -> chỉ điền dữ liệu đăng ký
  // mode = 'login'   -> chỉ điền dữ liệu đăng nhập
  let mode = null;
  let timer = null;
  let busy = false;
  let again = false;

  async function run() {
    if (!mode) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      if (mode === 'signup') await fillSignup();
      else if (mode === 'login') await fillLogin();
    } catch (e) {
      // extension bị reload -> script cũ mất kết nối, bỏ qua
    } finally {
      busy = false;
      if (again) { again = false; schedule(); }
    }
  }

  function schedule() {
    if (!mode) return;
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  }

  function clearMarks() {
    document.querySelectorAll('[data-gaf-done],[data-gaf-try]').forEach((el) => {
      delete el.dataset.gafDone;
      delete el.dataset.gafTry;
    });
  }

  // Theo dõi DOM: mỗi khi Google chuyển bước -> tự dò và điền (chỉ khi đang chạy)
  new MutationObserver(() => { if (mode) schedule(); })
    .observe(document.documentElement, { subtree: true, childList: true });

  // Lệnh từ popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'start') {
      mode = msg.mode;
      clearMarks();
      schedule();
      sendResponse({ ok: true });
    } else if (msg.type === 'stop') {
      mode = null;
      clearTimeout(timer);
      sendResponse({ ok: true });
    }
  });

  // Trang vừa load (Google chuyển bước bằng reload trang) -> hỏi xem tab này có đang chạy không
  try {
    chrome.runtime.sendMessage({ type: 'getMode' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.mode) {
        mode = res.mode;
        schedule();
      }
    });
  } catch (e) { /* ignore */ }
})();
