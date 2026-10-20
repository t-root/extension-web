// State management
let autoModeInProgress = false;
let autoAdvancePending = false;
let autoAdvanceObserver = null;
let lastAutoQuestionText = '';

// Create the overlay container
function createOverlay() {
  // Create main container
  const container = document.createElement('div');
  container.id = 'message-overlay-container';
  container.innerHTML = `
    <div id="message-box">
      <div id="message-header">
        <span>🤖 Tự động trả lời</span>
        <div class="header-actions">
          <button id="settings-btn" title="Cài đặt AI" aria-label="Cài đặt AI">⚙</button>
          <button id="close-btn" title="Đóng" aria-label="Đóng">×</button>
        </div>
      </div>
      <div id="automation-status" role="status" aria-live="polite">
        <span id="status-dot" aria-hidden="true"></span>
        <span id="status-text">Đang sẵn sàng tự động xử lý</span>
      </div>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2147483648; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 12px; padding: 20px; width: 90%; max-width: 400px; box-shadow: 0 5px 40px rgba(0,0,0,0.3); pointer-events: auto; position: relative;">
        <button id="settings-close-btn" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; color: #666; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">×</button>
        <h2 style="margin: 0 0 20px 0; color: #333; font-size: 16px;">⚙️ AI Configuration</h2>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #666; font-size: 12px;">AI Server URL</label>
          <input id="ai-url-input" type="text" placeholder="http://127.0.0.1:5000/v1/chat/completions" 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; box-sizing: border-box; pointer-events: auto; color: black;">
          <small style="color: #999; display: block; margin-top: 4px;">Example: http://127.0.0.1:5000/v1/chat/completions</small>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #666; font-size: 12px;">Model Name</label>
          <input id="ai-model-input" type="text" placeholder="claude" 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; box-sizing: border-box; pointer-events: auto; color: black;">
          <small style="color: #999; display: block; margin-top: 4px;">Example: claude, gpt-4, gpt-3.5-turbo</small>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #666; font-size: 12px;">API Key (Optional)</label>
          <input id="ai-key-input" type="text" placeholder="sk-..." 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; box-sizing: border-box; pointer-events: auto; color: black;">
          <small style="color: #999; display: block; margin-top: 4px;">For OpenAI: sk-... | Leave empty for local servers</small>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #666; font-size: 12px;">Max Tokens</label>
          <input id="ai-max-tokens-input" type="number" min="1" step="1" placeholder="1024" 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; box-sizing: border-box; pointer-events: auto; color: black;">
          <small style="color: #999; display: block; margin-top: 4px;">Optional. Controls the maximum response length.</small>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #666; font-size: 12px;">Default Prompt</label>
          <textarea id="default-prompt-input" placeholder="Nhập prompt mặc định sẽ gửi kèm mỗi request..." 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; box-sizing: border-box; pointer-events: auto; min-height: 80px; font-family: monospace; color: black;"></textarea>
          <small style="color: #999; display: block; margin-top: 4px;">Prompt này sẽ được gửi ẩn kèm mỗi request. Hữu ích để set context mặc định cho AI.</small>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="settings-save-btn" style="padding: 8px 16px; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; pointer-events: auto;">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  attachEventListeners();
  makeDraggable();
}

// Attach event listeners
function attachEventListeners() {
  const closeBtn = document.getElementById('close-btn');
  const settingsBtn = document.getElementById('settings-btn');

  closeBtn.addEventListener('click', () => {
    toggleOverlay(false);
  });

  settingsBtn.addEventListener('click', () => {
    console.log('⚙️ Settings button clicked!');
    openSettingsModal();
  });

  // Settings modal buttons
  const settingsModal = document.getElementById('settings-modal');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const settingsSaveBtn = document.getElementById('settings-save-btn');

  console.log('=== DEBUG: Attachment listeners ===');
  console.log('settingsModal:', settingsModal);
  console.log('settingsCloseBtn:', settingsCloseBtn);
  console.log('settingsSaveBtn:', settingsSaveBtn);
  
  if (!settingsCloseBtn) {
    console.error('settings-close-btn not found');
  }

  if (settingsCloseBtn) {
    console.log('Attaching click listener to settings-close-btn');
    settingsCloseBtn.addEventListener('click', (e) => {
      console.log('❌ Settings close button clicked!', e);
      e.preventDefault();
      e.stopPropagation();
      console.log('Calling closeSettingsModal()');
      closeSettingsModal();
    });
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', (e) => {
      console.log('💾 Settings save button clicked!', e);
      e.preventDefault();
      e.stopPropagation();
      saveAISettings();
    });
  }

  // Close modal when clicking outside
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      console.log('Modal backdrop clicked:', e.target);
      if (e.target === settingsModal) {
        console.log('Backdrop click detected - closing modal');
        closeSettingsModal();
      }
    }, true);  // Use capture phase
  }

  // Load saved settings
  loadAISettings();
}

// Make chat box draggable
function makeDraggable() {
  const messageBox = document.getElementById('message-box');
  const header = document.getElementById('message-header');
  const container = document.getElementById('message-overlay-container');
  
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;
  
  // Store position in localStorage for persistence
  const storedPosition = localStorage.getItem('messageBoxPosition');
  if (storedPosition) {
    const pos = JSON.parse(storedPosition);
    container.style.left = pos.left;
    container.style.right = 'auto';
    container.style.top = pos.top;
    container.style.bottom = 'auto';
    currentX = parseInt(pos.left);
    currentY = parseInt(pos.top);
  } else {
    // Convert from bottom/right to left/top
    const rect = container.getBoundingClientRect();
    currentX = rect.left;
    currentY = rect.top;
    container.style.left = currentX + 'px';
    container.style.top = currentY + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  }

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    initialX = e.clientX - currentX;
    initialY = e.clientY - currentY;
    header.style.opacity = '0.8';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - messageBox.offsetWidth;
    const maxY = window.innerHeight - messageBox.offsetHeight;
    
    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));
    
    container.style.left = currentX + 'px';
    container.style.top = currentY + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.opacity = '1';
      
      // Save position to localStorage
      localStorage.setItem('messageBoxPosition', JSON.stringify({
        left: currentX + 'px',
        top: currentY + 'px'
      }));
    }
  });
}

// Settings modal functions
function openSettingsModal() {
  console.log('Opening settings modal...');
  const settingsModal = document.getElementById('settings-modal');
  console.log('settingsModal before:', settingsModal, settingsModal?.style.display);
  settingsModal.style.display = 'flex';
  console.log('settingsModal after:', settingsModal.style.display);
}

function closeSettingsModal() {
  console.log('Closing settings modal...');
  const settingsModal = document.getElementById('settings-modal');
  console.log('settingsModal before close:', settingsModal, settingsModal?.style.display);
  settingsModal.style.display = 'none';
  console.log('settingsModal after close:', settingsModal.style.display);
}

function sanitizeApiKey(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  return trimmed;
}

function loadAISettings() {
  chrome.storage.sync.get(['aiUrl', 'aiModel', 'aiKey', 'defaultPrompt', 'aiMaxTokens'], (result) => {
    const urlInput = document.getElementById('ai-url-input');
    const modelInput = document.getElementById('ai-model-input');
    const keyInput = document.getElementById('ai-key-input');
    const promptInput = document.getElementById('default-prompt-input');
    const maxTokensInput = document.getElementById('ai-max-tokens-input');
    
    if (urlInput) {
      urlInput.value = result.aiUrl || 'http://127.0.0.1:5000/v1/chat/completions';
    }
    if (modelInput) {
      modelInput.value = result.aiModel || 'gemini';
    }
    if (keyInput) {
      keyInput.value = sanitizeApiKey(result.aiKey) || '';
    }
    if (promptInput) {
      promptInput.value = result.defaultPrompt || '';
    }
    if (maxTokensInput) {
      const savedMaxTokens = result.aiMaxTokens;
      maxTokensInput.value = savedMaxTokens && Number.isFinite(Number(savedMaxTokens)) ? String(savedMaxTokens) : '1024';
    }
  });
}

function saveAISettings() {
  const urlInput = document.getElementById('ai-url-input');
  const modelInput = document.getElementById('ai-model-input');
  const keyInput = document.getElementById('ai-key-input');
  const promptInput = document.getElementById('default-prompt-input');
  const maxTokensInput = document.getElementById('ai-max-tokens-input');
  
  const aiUrl = urlInput.value.trim();
  const aiModel = modelInput.value.trim();
  const aiKey = sanitizeApiKey(keyInput.value);
  const defaultPrompt = promptInput.value.trim();
  const aiMaxTokens = Number.parseInt(maxTokensInput.value, 10);
  const safeMaxTokens = Number.isFinite(aiMaxTokens) && aiMaxTokens > 0 ? aiMaxTokens : 1024;

  if (!aiUrl || !aiModel) {
    showNotification('⚠️ Vui lòng nhập URL và Model name!', 'error');
    return;
  }

  chrome.storage.sync.set({
    aiUrl: aiUrl,
    aiModel: aiModel,
    aiKey: aiKey,
    defaultPrompt: defaultPrompt,
    aiMaxTokens: safeMaxTokens
  }, () => {
    showNotification('✅ Cấu hình AI đã được lưu!', 'success');
    setTimeout(() => closeSettingsModal(), 500);
  });
}

function showNotification(message, type = 'info') {
  let notification = document.getElementById('ai-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'ai-notification';
    document.body.appendChild(notification);
  }
  
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 2147483650;
    animation: slideInNotif 0.3s ease-out;
    ${type === 'error' ? 'background: #ff4444; color: white;' : 'background: #44dd44; color: white;'}
  `;
  
  setTimeout(() => {
    notification.style.animation = 'slideOutNotif 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}

// Toggle overlay visibility
function toggleOverlay(show = true) {
  const container = document.getElementById('message-overlay-container');
  if (show) {
    container.style.display = 'flex';
  } else {
    container.style.display = 'none';
  }
}

// Display element info in tree structure
function displayElementInfo(element) {
  const elementInfo = document.getElementById('element-info');
  const elementPreview = document.getElementById('element-preview');

  // Build tree HTML
  const treeHtml = buildElementTree(element, 0);
  
  elementPreview.innerHTML = treeHtml;
  elementInfo.style.display = 'block';

  // Add click handlers for collapsible tree
  elementPreview.querySelectorAll('.tree-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const children = toggle.closest('.tree-node').querySelector('.tree-children');
      if (children) {
        children.style.display = children.style.display === 'none' ? 'block' : 'none';
        toggle.textContent = children.style.display === 'none' ? '▶' : '▼';
      }
    });
  });

  updateElementPickStatus();
}

// Build element tree recursively
function buildElementTree(element, depth, maxDepth = 5) {
  if (depth > maxDepth) return '';

  const tagName = element.tagName.toLowerCase();
  const attrs = getElementAttributes(element);
  const hasChildren = element.children.length > 0;
  const indent = '  '.repeat(depth);

  let html = `<div class="tree-node" style="margin-left: ${depth * 16}px;">`;
  
  if (hasChildren) {
    html += `<span class="tree-toggle">▼</span>`;
  } else {
    html += `<span class="tree-toggle" style="visibility: hidden;">▼</span>`;
  }

  html += `<span class="tree-tag">&lt;${tagName}</span>`;
  html += `${attrs}</span><span class="tree-bracket">&gt;</span>`;

  if (hasChildren) {
    html += `<div class="tree-children">`;
    for (let child of element.children) {
      html += buildElementTree(child, depth + 1, maxDepth);
    }
    html += `</div>`;
  }

  if (element.children.length === 0 && element.textContent.trim()) {
    const text = element.textContent.trim().substring(0, 50);
    html += `<span class="tree-text">${escapeHtml(text)}</span>`;
  }

  html += `<span class="tree-tag">&lt;/${tagName}&gt;</span></div>`;

  return html;
}

// Get element attributes
function getElementAttributes(element) {
  let attrs = '';
  for (let attr of element.attributes) {
    const value = attr.value.substring(0, 30);
    attrs += ` <span class="tree-attr">${attr.name}</span>=<span class="tree-attrvalue">"${escapeHtml(value)}"</span>`;
  }
  return attrs;
}

// Send message
function sendMessage() {
  const messageInput = document.getElementById('message-input');
  const message = messageInput.value.trim();

  if (!message && !pickedElement) {
    alert('Vui lòng nhập tin nhắn hoặc pick element!');
    return;
  }

  // Prepare full message with element info
  let fullMessage = message;
  let elementInfo = null;

  if (pickedElement) {
    const tagName = pickedElement.tagName.toLowerCase();
    const className = pickedElement.className ? `.${pickedElement.className.split(' ').join('.')}` : '';
    const idName = pickedElement.id ? `#${pickedElement.id}` : '';
    const selector = `${tagName}${idName}${className}`;
    
    elementInfo = {
      selector: selector,
      tagName: tagName,
      id: pickedElement.id,
      className: pickedElement.className,
      html: pickedElement.outerHTML
    };

    // Add element info to message display
    if (!message) {
      fullMessage = `📌 Element: ${selector}`;
    }
  }

  // Display user message in chat with element
  addMessageToChat('user', fullMessage, elementInfo);

  // Prepare payload
  const payload = {
    message: message || '',
    element: elementInfo,
    timestamp: new Date().toISOString()
  };

  console.log('Sending payload to AI:', JSON.stringify(payload, null, 2));

  // Send to background script
  try {
    chrome.runtime.sendMessage({
      action: 'sendMessage',
      data: payload
    }, (response) => {
      // Check if there's a runtime error (context invalidated, etc.)
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError.message);
        addMessageToChat('error', '⚠️ Lỗi: Tiện ích đã được cập nhật. Vui lòng làm mới trang.');
        return;
      }

      if (response && response.success) {
        messageInput.value = '';
        pickedElement = null;
        updateElementPickStatus();
        
        // Display server response
        if (response.data) {
          const responseMsg = response.data.message || JSON.stringify(response.data);
          addMessageToChat('bot', responseMsg);
        }
      } else {
        const errorMsg = response?.error || 'Lỗi khi gửi tin nhắn!';
        addMessageToChat('error', `❌ ${errorMsg}`);
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    addMessageToChat('error', '⚠️ Lỗi: Tiện ích không hoạt động. Vui lòng làm mới trang.');
  }
}

// Update element pick status indicator
function updateElementPickStatus() {
  const elementInfo = document.getElementById('element-info');
  if (pickedElement) {
    elementInfo.style.display = 'block';
  } else {
    elementInfo.style.display = 'none';
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== AUTO MODE FUNCTIONS =====

function getQuizContainer() {
  return document.querySelector('[data-cy="quiz-container"]') ||
         document.querySelector('.quiz-container') ||
         document.querySelector('[data-testid="quiz-container"]');
}

function clearAutoAdvanceWatcher() {
  if (autoAdvanceObserver) {
    autoAdvanceObserver.disconnect();
    autoAdvanceObserver = null;
  }
}

function scheduleAutoAdvanceToNextQuestion() {
  autoAdvancePending = true;
  clearAutoAdvanceWatcher();

  addMessageToChat('system', '⏳ Đang chờ câu hỏi tiếp theo...');

  const quizContainer = getQuizContainer();
  if (!quizContainer) {
    setTimeout(() => {
      if (autoAdvancePending && !autoModeInProgress) {
        autoAdvancePending = false;
        startAutoMode();
      }
    }, 2500);
    return;
  }

  autoAdvanceObserver = new MutationObserver(() => {
    if (!autoAdvancePending || autoModeInProgress) return;

    const quizData = extractQuizData();
    if (quizData && quizData.question && quizData.question !== lastAutoQuestionText) {
      clearAutoAdvanceWatcher();
      autoAdvancePending = false;
      addMessageToChat('system', '🔄 Phát hiện câu hỏi mới, đang tự động tiếp tục...');
      startAutoMode();
    }
  });

  autoAdvanceObserver.observe(quizContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  setTimeout(() => {
    if (!autoAdvancePending || autoModeInProgress) return;

    const quizData = extractQuizData();
    if (quizData && quizData.question && quizData.question !== lastAutoQuestionText) {
      clearAutoAdvanceWatcher();
      autoAdvancePending = false;
      addMessageToChat('system', '🔄 Tự động tiếp tục câu hỏi tiếp theo...');
      startAutoMode();
      return;
    }

    setTimeout(() => {
      if (!autoAdvancePending || autoModeInProgress) return;
      const fallbackQuizData = extractQuizData();
      if (fallbackQuizData && fallbackQuizData.question && fallbackQuizData.question !== lastAutoQuestionText) {
        clearAutoAdvanceWatcher();
        autoAdvancePending = false;
        addMessageToChat('system', '🔄 Tự động tiếp tục câu hỏi tiếp theo...');
        startAutoMode();
      } else {
        autoAdvancePending = false;
        setAutomationStatus('Đang chờ câu hỏi tiếp theo...', 'idle');
      }
    }, 2500);
  }, 2200);
}

// Start auto mode - get question and options, then ask AI
function startAutoMode() {
  if (autoModeInProgress) {
    showNotification('⏳ Auto mode đang chạy...', 'info');
    return;
  }

  autoModeInProgress = true;
  autoAdvancePending = false;
  clearAutoAdvanceWatcher();
  setAutomationStatus('Đang tìm đáp án...', 'working');
  
  addMessageToChat('system', '🤖 Auto mode bắt đầu...');
  
  // Get question and options
  const quizData = extractQuizData();
  if (!quizData) {
    addMessageToChat('error', '❌ Không tìm thấy câu hỏi. Kiểm tra selector!');
    autoModeInProgress = false;
    return;
  }

  lastAutoQuestionText = quizData.question;
  console.log('Quiz data:', quizData);
  addMessageToChat('system', `📋 Câu hỏi: ${quizData.question}\n✅ Số đáp án: ${quizData.options.length}`);

  // Send to AI to get answer
  sendQuizToAI(quizData);
}

// Extract question and options from quiz page
function extractQuizData() {
  const quizContainer = getQuizContainer();

  if (!quizContainer) {
    console.error('Quiz container not found');
    return null;
  }

  // Extract question text
  const questionEl = quizContainer.querySelector('[data-cy="question-container-text"]') ||
                     quizContainer.querySelector('[data-testid="question-container-text"]') ||
                     quizContainer.querySelector('#questionText');
  
  const question = questionEl ? questionEl.textContent.trim() : 'Unknown question';

  // Extract options - only direct children
  const optionsContainer = quizContainer.querySelector('.options-grid') ||
                          quizContainer.querySelector('[data-testid="options-container"]');

  let options = [];
  if (optionsContainer) {
    // Get direct child buttons only
    const optionButtons = optionsContainer.querySelectorAll(':scope > button[role="option"]');
    
    optionButtons.forEach((btn, index) => {
      const text = btn.textContent.trim();
      if (text) {
        options.push({
          index: index,
          text: text,
          element: btn
        });
      }
    });
  }

  if (options.length === 0) {
    console.error('No options found');
    return null;
  }

  return {
    question: question,
    options: options
  };
}

function normalizeAiUrl(aiUrl) {
  const defaultUrl = 'http://127.0.0.1:5000/v1/chat/completions';
  if (!aiUrl || !aiUrl.trim()) return defaultUrl;

  const trimmed = aiUrl.trim();
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/')) return `${trimmed}chat/completions`;
  if (trimmed.includes('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/chat/completions`;
}

function buildAiHeaders(aiUrl, aiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const cleanedKey = sanitizeApiKey(aiKey);
  if (cleanedKey) {
    headers.Authorization = `Bearer ${cleanedKey}`;
    headers['X-API-Key'] = cleanedKey;
    headers['api-key'] = cleanedKey;
  }

  if (aiUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://localhost';
    headers['X-Title'] = 'Wayground';
  }

  return headers;
}

// Send quiz data to AI and get answer
function sendQuizToAI(quizData) {
  // Prepare message for AI
  const optionsText = quizData.options
    .map(opt => `${opt.text}`)
    .join('\n');

  const prompt = `Câu hỏi: ${quizData.question}\n\nĐáp án:\n${optionsText}\n\nChọn đáp án đúng và trả lời dưới dạng: ###đáp án đúng###`;

  chrome.storage.sync.get(['defaultPrompt'], (result) => {
    const defaultPrompt = result.defaultPrompt || '';

    chrome.runtime.sendMessage({
      action: 'sendMessage',
      data: {
        prompt: prompt,
        systemPrompt: defaultPrompt,
        isAutoMode: true
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError.message);
        addMessageToChat('error', '⚠️ Lỗi: Tiện ích đã được cập nhật. Vui lòng làm mới trang.');
        autoModeInProgress = false;
        return;
      }

      if (response && response.success) {
        const aiResponse = response.data?.message || '';
        addMessageToChat('bot', aiResponse);

        const answer = extractAnswerFromResponse(aiResponse);
        
        if (answer) {
          addMessageToChat('system', `✨ Trích xuất đáp án: "${answer}"`);
          setTimeout(() => {
            autoClickAnswer(answer, quizData);
          }, 1000);
        } else {
          addMessageToChat('error', '❌ Không thể trích xuất đáp án từ AI');
          autoModeInProgress = false;
        }
      } else {
        const errorMsg = response?.error || 'Lỗi khi gửi tin nhắn!';
        addMessageToChat('error', `❌ ${errorMsg}`);
        autoModeInProgress = false;
      }
    });
  });
}

// Extract answer from response like "###answer text###"
function extractAnswerFromResponse(response) {
  const match = response.match(/###(.*?)###/) || response.match(/###(.+?)###/) || response.match(/###(.*)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Fallback: try to find the first line that looks like an answer
  const lines = response.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (line && !line.includes('?') && line.length > 3 && line.length < 200) {
      return line;
    }
  }
  
  return null;
}

// Auto-click the matching answer
function autoClickAnswer(answer, quizData) {
  // Find matching option - STRICT MATCHING ONLY
  const answerLower = answer.toLowerCase().trim();
  let matchedOption = null;

  // First pass: Try exact match
  for (let option of quizData.options) {
    const optionText = option.text.toLowerCase().trim();
    
    // Exact match only
    if (optionText === answerLower) {
      matchedOption = option;
      break;
    }
  }

  // If no exact match found, try removing common punctuation/extra spaces
  if (!matchedOption) {
    const cleanAnswer = answerLower.replace(/[.,!?;:\s]+/g, '').toLowerCase();
    
    for (let option of quizData.options) {
      const cleanOption = option.text.toLowerCase().replace(/[.,!?;:\s]+/g, '').toLowerCase();
      
      if (cleanOption === cleanAnswer && cleanAnswer.length > 2) {
        matchedOption = option;
        break;
      }
    }
  }

  if (matchedOption) {
    addMessageToChat('system', `🎯 Tìm thấy đáp án: "${matchedOption.text}"`);
    
    // Click the matched option
    setTimeout(() => {
      matchedOption.element.click();
      addMessageToChat('system', '✅ Đã click đáp án');
      
      // Auto-send after delay
      setTimeout(() => {
        autoSendAnswer();
      }, 1500);
    }, 500);
  } else {
    addMessageToChat('error', `Không tìm thấy đáp án khớp: "${answer}"`);
    showNotification('Không tự chọn được đáp án. Hãy chọn trực tiếp trên trang.', 'error');

    // Stop cleanly; the compact panel has no manual controls to maintain.
    setTimeout(() => {
      if (autoModeInProgress) {
        autoModeInProgress = false;
        setAutomationStatus('Tạm dừng: chưa tìm được đáp án khớp', 'error');
      }
    }, 30000);
  }
}

// Auto-send the answer
function autoSendAnswer() {
  addMessageToChat('system', '📤 Đáp án đã submit, đang tự động chuyển câu hỏi tiếp theo...');
  
  setTimeout(() => {
    autoModeInProgress = false;
    scheduleAutoAdvanceToNextQuestion();
  }, 1800);
}

// Add system message type
function addMessageToChat(sender, message) {
  const compactMessage = String(message).replace(/\s+/g, ' ').trim();
  setAutomationStatus(compactMessage, sender === 'error' ? 'error' : 'working');
}

function setAutomationStatus(message, state = 'working') {
  const statusText = document.getElementById('status-text');
  const status = document.getElementById('automation-status');
  if (!statusText || !status) return;

  const compactMessage = String(message).trim();
  statusText.textContent = compactMessage.length > 120
    ? `${compactMessage.slice(0, 117)}…`
    : compactMessage;
  status.dataset.state = state;
}

// =========================================================================
// ANTI-TRACKING SHIELD FUNCTIONS
// =========================================================================
let isTrackingShieldEnabled = false;
let trackingShieldInterval = null;

// Apply ultimate tracking shield
function applyUltimateShield() {
  try {
    // 1. Freeze tab visibility state
    const forceVisible = { value: 'visible', writable: false, configurable: true };
    const forceFalse = { value: false, writable: false, configurable: true };
    
    Object.defineProperties(document, {
      'hidden': forceFalse,
      'visibilityState': forceVisible,
      'webkitVisibilityState': forceVisible,
      'mozVisibilityState': forceVisible
    });

    // 2. Freeze document title
    if (!window.savedTitle) window.savedTitle = document.title || "Web Page";
    Object.defineProperty(document, 'title', {
      get: function() { return window.savedTitle; },
      set: function() { /* Block changes */ },
      configurable: true
    });

    // 3. Lock window dimensions
    const w = window.outerWidth || 1920;
    const h = window.outerHeight || 1080;
    Object.defineProperties(window, {
      'innerWidth': { value: w, writable: false, configurable: true },
      'innerHeight': { value: h, writable: false, configurable: true },
      'outerWidth': { value: w, writable: false, configurable: true },
      'outerHeight': { value: h, writable: false, configurable: true }
    });

    // 4. Disable page unload events
    Object.defineProperties(window, {
      'onbeforeunload': { value: null, writable: false, configurable: true },
      'onunload': { value: null, writable: false, configurable: true },
      'onpagehide': { value: null, writable: false, configurable: true },
      'onblur': { value: null, writable: false, configurable: true }
    });

  } catch (err) {
    console.warn('[Shield] Error applying shield:', err.message);
  }
}

// Kill event function
function killTrackerEvent(e) {
  try {
    e.stopImmediatePropagation();
    e.stopPropagation();
  } catch (err) {
    // Ignore
  }
}

// Enable tracking shield
function enableTrackingShield() {
  if (isTrackingShieldEnabled) return;
  
  isTrackingShieldEnabled = true;
  const btn = document.getElementById('tracking-shield-btn');
  
  // Update button appearance
  if (btn) {
    btn.style.backgroundColor = '#ff6b6b';
    btn.style.color = 'white';
    btn.title = '🛡️ Tracking Shield: ACTIVE';
  }

  // Apply shield immediately
  applyUltimateShield();

  // Events to block
  const eventsToKill = [
    'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange',
    'blur', 'mouseleave', 'mouseout', 'copy', 'paste', 'cut', 'beforeunload', 'unload', 'pagehide', 'resize'
  ];

  eventsToKill.forEach(evt => {
    try {
      window.addEventListener(evt, killTrackerEvent, true);
      document.addEventListener(evt, killTrackerEvent, true);
    } catch (err) {
      // Ignore if event doesn't exist
    }
  });

  // Block navigator APIs
  if (navigator.sendBeacon) {
    navigator.sendBeacon = function() { return true; };
  }

  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (init && init.keepalive) return Promise.resolve(new Response());
    return originalFetch.apply(this, arguments);
  };

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = function() {
      return Promise.resolve([
        { kind: 'audioinput', label: 'Default Audio', deviceId: 'protected' },
        { kind: 'videoinput', label: 'Default Video', deviceId: 'protected' }
      ]);
    };
  }

  // Re-apply shield every 2 seconds to counter overwrites
  if (trackingShieldInterval) clearInterval(trackingShieldInterval);
  trackingShieldInterval = setInterval(() => {
    applyUltimateShield();
  }, 10);

  addMessageToChat('system', '🛡️ Tracking Shield: ACTIVATED - Monitoring every seconds');
}

// Disable tracking shield
function disableTrackingShield() {
  if (!isTrackingShieldEnabled) return;
  
  isTrackingShieldEnabled = false;
  const btn = document.getElementById('tracking-shield-btn');
  
  // Update button appearance
  if (btn) {
    btn.style.backgroundColor = '';
    btn.style.color = '#666';
    btn.title = '🛡️ Shield';
  }

  // Stop the interval
  if (trackingShieldInterval) {
    clearInterval(trackingShieldInterval);
    trackingShieldInterval = null;
  }

  addMessageToChat('system', '🛡️ Tracking Shield: DEACTIVATED');
}

// Toggle tracking shield
function toggleTrackingShield() {
  if (isTrackingShieldEnabled) {
    disableTrackingShield();
  } else {
    enableTrackingShield();
  }
}

// Initialize extension
function init() {
  // Check if overlay already exists
  if (document.getElementById('message-overlay-container')) {
    toggleOverlay(true);
    return;
  }

  createOverlay();

  // Start without user input when a supported quiz is already on the page.
  setTimeout(() => {
    if (getQuizContainer() && extractQuizData()) startAutoMode();
  }, 500);

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showOverlay') {
      toggleOverlay(true);
      sendResponse({ success: true });
    }
  });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
