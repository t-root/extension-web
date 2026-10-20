const $ = s => document.querySelector(s);
const DEFAULTS = { voice: '', origVolume: 0.2 };
let cfg = Object.assign({}, DEFAULTS);
const save = patch => { Object.assign(cfg, patch); chrome.storage.local.set(patch); };

// Gửi lệnh tới trang YouTube đang mở; null nếu không phải YouTube hoặc trang chưa nạp extension.
async function ask(msg) {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!t) return null;
  return new Promise(res => chrome.tabs.sendMessage(t.id, msg, r => res(chrome.runtime.lastError ? null : r || null)));
}

async function refresh() {
  const r = await ask({ type: 'vs-status' });
  const btn = $('#toggle');
  if (!r) { btn.textContent = 'Bắt đầu'; btn.className = ''; $('#st').textContent = 'Mở video YouTube (F5 nếu vừa cài)'; return; }
  btn.textContent = r.active ? 'Dừng' : 'Bắt đầu';
  btn.className = r.active ? 'on' : '';
  $('#st').textContent = [r.error, r.active ? r.status : '', 'Giọng: ' + r.voice].filter(Boolean).join('\n');
}

// Giọng: tự động (giọng tiếng Việt của máy nếu có, không thì Google), Google, hoặc một giọng tiếng Việt cụ thể.
function fillVoices() {
  const sel = $('#voice');
  const vi = speechSynthesis.getVoices().filter(v => /^vi/i.test(v.lang));
  sel.innerHTML = '<option value="">Tự động</option><option value="google">Google (qua mạng)</option>' +
    vi.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === cfg.voice) ? cfg.voice : '';
}

(async function init() {
  cfg = Object.assign({}, DEFAULTS, await chrome.storage.local.get(DEFAULTS));
  fillVoices();
  speechSynthesis.addEventListener('voiceschanged', fillVoices);
  $('#voice').onchange = () => { save({ voice: $('#voice').value }); refresh(); };

  const bind = (id, valId, toCfg, show) => {
    const el = $('#' + id);
    el.value = id === 'origVolume' ? cfg[id] * 100 : cfg[id];
    $('#' + valId).textContent = show(+el.value);
    el.oninput = () => { $('#' + valId).textContent = show(+el.value); save({ [id]: toCfg(+el.value) }); };
  };
  bind('origVolume', 'ovv', v => v / 100, v => v + '%');

  $('#toggle').onclick = async () => { await ask({ type: 'vs-toggle' }); refresh(); };
  refresh(); setInterval(refresh, 1000);
})();
