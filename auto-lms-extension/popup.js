document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const statusText = document.getElementById('status');
  const speedSelect = document.getElementById('speedSelect');
  const aiModel = document.getElementById('aiModel');
  const aiEndpoint = document.getElementById('aiEndpoint');
  const aiApiKey = document.getElementById('aiApiKey');
  const aiStatus = document.getElementById('aiStatus');

  // Lấy trạng thái lưu trữ (Mặc định là BẬT)
  chrome.storage.sync.get(['autoLmsEnabled'], (result) => {
    const isEnabled = result.autoLmsEnabled !== false; // Default true
    toggleBtn.checked = isEnabled;
    updateStatus(isEnabled);
  });

  // Khi bấm công tắc
  toggleBtn.addEventListener('change', () => {
    const isEnabled = toggleBtn.checked;
    chrome.storage.sync.set({ autoLmsEnabled: isEnabled }, () => {
      updateStatus(isEnabled);

      if (isEnabled) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (!activeTab || !activeTab.id) return;

          chrome.tabs.reload(activeTab.id, {}, () => {
            if (chrome.runtime.lastError) {
              console.warn('[Auto LMS Engine] Không thể reload tab hiện tại:', chrome.runtime.lastError.message);
            }
          });
        });
      }
    });
  });

  // Lấy tốc độ video đã lưu (Mặc định là "giữ nguyên tốc độ hiện tại")
  chrome.storage.sync.get(['playbackSpeed'], (result) => {
    speedSelect.value = result.playbackSpeed || 'default';
  });

  // Khi đổi tốc độ
  speedSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ playbackSpeed: speedSelect.value });
  });

  chrome.storage.sync.get(['aiModel', 'aiEndpoint', 'aiApiKey'], (result) => {
    const savedModel = result.aiModel === 'gemini' ? 'auto' : result.aiModel;
    aiModel.value = savedModel || 'auto';
    aiEndpoint.value = result.aiEndpoint || 'http://127.0.0.1:5000/v1/chat/completions';
    aiApiKey.value = result.aiApiKey || 'trungdeptrai';
    updateAiStatus();

    if (result.aiModel === 'gemini' || !result.aiModel || !result.aiEndpoint || !result.aiApiKey) {
      saveAiSettings();
    }
  });

  [aiModel, aiEndpoint, aiApiKey].forEach((field) => {
    field.addEventListener('change', saveAiSettings);
  });

  function saveAiSettings() {
    chrome.storage.sync.set({
      aiModel: aiModel.value.trim(),
      aiEndpoint: aiEndpoint.value.trim(),
      aiApiKey: aiApiKey.value.trim()
    }, updateAiStatus);
  }

  function updateAiStatus() {
    aiStatus.textContent = aiApiKey.value.trim()
      ? 'Đã cấu hình API tuỳ chỉnh'
      : 'Chưa cấu hình AI';
  }

  function updateStatus(enabled) {
    if (enabled) {
      statusText.textContent = 'Trạng thái: ĐANG BẬT';
      statusText.className = 'on';
    } else {
      statusText.textContent = 'Trạng thái: ĐÃ TẮT';
      statusText.className = 'off';
    }
  }
});