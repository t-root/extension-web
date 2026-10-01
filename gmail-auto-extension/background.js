// Lưu trạng thái "đang chạy" theo TỪNG TAB trong chrome.storage.session
// (tự mất khi đóng trình duyệt). Content script không biết tabId của mình,
// nên hỏi background qua message 'getMode'.

const key = (tabId) => 'run_' + tabId;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getMode') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) {
      sendResponse({ mode: null });
      return;
    }
    chrome.storage.session.get(key(tabId)).then((v) => {
      sendResponse({ mode: v[key(tabId)] || null });
    });
    return true;
  }
});

// Đóng tab -> dừng
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(key(tabId));
});

// Rời khỏi accounts.google.com (vd: đăng nhập xong vào myaccount/gmail) -> dừng
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && !info.url.startsWith('https://accounts.google.com/')) {
    chrome.storage.session.remove(key(tabId));
  }
});
