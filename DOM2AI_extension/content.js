// State management
let isPicking = false;
let pickedElement = null;
let isMinimized = true; // Start minimized on first load
let elementCaptureMode = 'full'; // full | content | screenshot

const PX_BASE = 1400;

function pxToVw(px) {
  return (px / PX_BASE * 100) + 'vw';
}

function positionValueToPx(value) {
  if (typeof value === 'number') return value;
  const str = String(value);
  if (str.endsWith('vw')) {
    return parseFloat(str) / 100 * PX_BASE;
  }
  return parseFloat(str) || 0;
}

const CAPTURE_MODE_LABELS = {
  full: 'Full HTML',
  content: 'Content Only',
  screenshot: 'Screenshot'
};

function setCaptureMode(mode, persist = true) {
  elementCaptureMode = mode;
  const root = document.getElementById('capture-mode-select');
  if (!root) return;

  const label = root.querySelector('.custom-select-label');
  if (label) {
    label.textContent = CAPTURE_MODE_LABELS[mode] || mode;
  }

  root.querySelectorAll('.custom-select-option').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.value === mode);
  });

  root.classList.remove('open');

  if (persist) {
    chrome.storage.sync.set({ elementCaptureMode: mode });
  }

  if (pickedElement) {
    displayElementInfo(pickedElement);
  }
}

function initCaptureModeSelect() {
  const root = document.getElementById('capture-mode-select');
  if (!root) return;

  const trigger = root.querySelector('.custom-select-trigger');
  if (trigger) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      root.classList.toggle('open');
    });
  }

  root.querySelectorAll('.custom-select-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setCaptureMode(btn.dataset.value);
    });
  });

  document.addEventListener('click', () => {
    root.classList.remove('open');
  });
}

function sanitizeEndpointUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/^["']+|["']+$/g, '');
}

function sanitizeApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '');
}

function parseMaxTokens(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Store function references for proper event listener removal
const highlightElementHandler = (e) => {
  if (!isPicking || e.target.id === 'message-overlay-container' || 
      e.target.closest('#message-overlay-container')) {
    return;
  }

  removeHighlight();
  e.target.setAttribute('data-picking-highlight', 'true');
  e.target.style.outline = '0.14286vw solid red';
  e.target.style.outlineOffset = '-0.14286vw';
};

const selectElementHandler = (e) => {
  if (!isPicking || e.target.id === 'message-overlay-container' || 
      e.target.closest('#message-overlay-container')) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  pickedElement = e.target;
  displayElementInfo(e.target);

  // End picking mode
  toggleElementPicker();
};

// Create the overlay container
function createOverlay() {
  // Create main container
  const container = document.createElement('div');
  container.id = 'message-overlay-container';
  container.innerHTML = `
    <div id="message-box">
      <div id="message-header">
        <span>💬 Chat Box</span>
        <div style="display: flex; gap: 0.57143vw;">
          <button id="minimize-btn" title="Minimize" style="background: none; border: none; color: white; font-size: 1.28571vw; cursor: pointer; padding: 0; width: 2.14286vw; height: 2.14286vw; display: flex; align-items: center; justify-content: center; border-radius: 0.28571vw;">_</button>
          <button id="settings-btn" title="⚙️ Settings" style="background: none; border: none; color: white; font-size: 1.28571vw; cursor: pointer; padding: 0; width: 2.14286vw; height: 2.14286vw; display: flex; align-items: center; justify-content: center; border-radius: 0.28571vw;">⚙️</button>
          <button id="close-btn">×</button>
        </div>
      </div>
      <div id="chat-messages"></div>
      <div id="message-content">
        <textarea id="message-input" placeholder="Nhập tin nhắn..."></textarea>
        <div id="element-info" style="display:none; background:transparent; padding:0.71429vw; margin:0.71429vw 0; max-height:10.71429vw; overflow-y:auto; font-size:0.85714vw; border: 0.07143vw solid rgba(255, 255, 255, 0.2);">
          <strong>Element Info:</strong>
          <pre id="element-preview" style="margin:0.35714vw 0; white-space: pre-wrap; word-break: break-all;"></pre>
        </div>
      </div>
      <div id="message-footer">
        <button id="pick-element-btn" title="Click to select element">Select</button>
        <div id="capture-mode-select" class="custom-select" title="Element capture mode">
          <button type="button" class="custom-select-trigger">
            <span class="custom-select-label">Full HTML</span>
            <span class="custom-select-arrow"></span>
          </button>
          <div class="custom-select-menu">
            <button type="button" class="custom-select-option selected" data-value="full">Full HTML</button>
            <button type="button" class="custom-select-option" data-value="content">Content Only</button>
            <button type="button" class="custom-select-option" data-value="screenshot">Screenshot</button>
          </div>
        </div>
        <button id="send-btn">Send</button>
      </div>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2147483648; align-items: center; justify-content: center;">
      <div style="background: #000000; border: 0.07143vw solid rgba(255, 255, 255, 0.3); padding: 1.42857vw; width: 90%; max-width: 28.57143vw; box-shadow: 0 0.35714vw 2.85714vw rgba(0,0,0,0.5); pointer-events: auto; position: relative; color: white;">
        <button id="settings-close-btn" style="position: absolute; top: 0.71429vw; right: 0.71429vw; background: none; border: none; font-size: 1.71429vw; color: rgba(255, 255, 255, 0.5); cursor: pointer; padding: 0; width: 2.14286vw; height: 2.14286vw; display: flex; align-items: center; justify-content: center; pointer-events: auto;">×</button>
        <h2 style="margin: 0 0 1.42857vw 0; color: white; font-size: 1.14286vw;">⚙️ AI Configuration</h2>
        
        <div style="margin-bottom: 1.07143vw;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.42857vw; color: rgba(255, 255, 255, 0.7); font-size: 0.85714vw;">AI Server URL</label>
          <input id="ai-url-input" type="text" placeholder="https://openrouter.ai/api/v1/chat/completions" 
            style="width: 100%; padding: 0.57143vw; border: 0.07143vw solid rgba(255, 255, 255, 0.2); background: #1a1a1a; color: white; font-size: 0.85714vw; box-sizing: border-box; pointer-events: auto;">
        </div>

        <div style="margin-bottom: 1.07143vw;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.42857vw; color: rgba(255, 255, 255, 0.7); font-size: 0.85714vw;">API Key</label>
          <div style="position: relative; display: flex; align-items: center;">
            <input id="ai-key-input" type="password" placeholder="sk-or-v1-... or trungdeptrai" 
              style="width: 100%; padding: 0.57143vw 2.57143vw 0.57143vw 0.57143vw; border: 0.07143vw solid rgba(255, 255, 255, 0.2); background: #1a1a1a; color: white; font-size: 0.85714vw; box-sizing: border-box; pointer-events: auto;">
            <button id="ai-key-toggle" type="button" title="Show/Hide key"
              style="position: absolute; right: 0.28571vw; background: none; border: none; color: rgba(255, 255, 255, 0.5); cursor: pointer; font-size: 1vw; padding: 0.28571vw 0.57143vw; pointer-events: auto;">👁</button>
          </div> 
        </div>

        <div style="margin-bottom: 1.07143vw;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.42857vw; color: rgba(255, 255, 255, 0.7); font-size: 0.85714vw;">Model Name</label>
          <input id="ai-model-input" type="text" placeholder="claude" 
            style="width: 100%; padding: 0.57143vw; border: 0.07143vw solid rgba(255, 255, 255, 0.2); background: #1a1a1a; color: white; font-size: 0.85714vw; box-sizing: border-box; pointer-events: auto;">
        </div>

        <div style="margin-bottom: 1.07143vw;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.42857vw; color: rgba(255, 255, 255, 0.7); font-size: 0.85714vw;">Max Tokens</label>
          <input id="ai-max-tokens-input" type="number" min="1" placeholder="4096" 
            style="width: 100%; padding: 0.57143vw; border: 0.07143vw solid rgba(255, 255, 255, 0.2); background: #1a1a1a; color: white; font-size: 0.85714vw; box-sizing: border-box; pointer-events: auto;">
        </div>

        <div style="margin-bottom: 1.07143vw;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.42857vw; color: rgba(255, 255, 255, 0.7); font-size: 0.85714vw;">Default Prompt</label>
          <textarea id="default-prompt-input" placeholder="Nhập prompt mặc định sẽ gửi kèm mỗi request..." 
            style="width: 100%; padding: 0.57143vw; border: 0.07143vw solid rgba(255, 255, 255, 0.2); background: #1a1a1a; color: white; font-size: 0.85714vw; box-sizing: border-box; pointer-events: auto; min-height: 5.71429vw; font-family: monospace;"></textarea> 
        </div>

        <div style="display: flex; gap: 0.57143vw; justify-content: flex-end;">
          <button id="settings-save-btn" style="padding: 0.57143vw 1.14286vw; border: 0.07143vw solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.15); color: white; cursor: pointer; font-weight: 600; font-size: 0.85714vw; pointer-events: auto;">Save</button>
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
  const minimizeBtn = document.getElementById('minimize-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const pickBtn = document.getElementById('pick-element-btn');
  const sendBtn = document.getElementById('send-btn');
  const messageInput = document.getElementById('message-input');

  closeBtn.addEventListener('click', () => {
    toggleOverlay(false);
  });

  minimizeBtn.addEventListener('click', () => {
    toggleMinimize();
  });

  settingsBtn.addEventListener('click', () => {
    console.log('⚙️ Settings button clicked!');
    openSettingsModal();
  });

  pickBtn.addEventListener('click', () => {
    toggleElementPicker();
  });

  sendBtn.addEventListener('click', () => {
    sendMessage();
  });

  initCaptureModeSelect();

  messageInput.addEventListener('keypress', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      sendMessage();
    }
  });

  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    chatMessages.addEventListener('click', (e) => {
      const elementBlock = e.target.closest('.message-element');
      if (!elementBlock || e.target.closest('.element-full-details')) return;

      elementBlock.classList.toggle('expanded');
      const hint = elementBlock.querySelector('.element-toggle-hint');
      if (hint) {
        hint.textContent = elementBlock.classList.contains('expanded')
          ? 'Click to hide details'
          : 'Click to view details';
      }
    });
  }

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

  const keyToggle = document.getElementById('ai-key-toggle');
  const keyInput = document.getElementById('ai-key-input');
  if (keyToggle && keyInput) {
    keyToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = keyInput.type === 'password';
      keyInput.type = isHidden ? 'text' : 'password';
      keyToggle.textContent = isHidden ? '🙈' : '👁';
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
    currentX = positionValueToPx(pos.left);
    currentY = positionValueToPx(pos.top);
  } else {
    // Convert from bottom/right to left/top
    const rect = container.getBoundingClientRect();
    currentX = rect.left;
    currentY = rect.top;
    container.style.left = pxToVw(currentX);
    container.style.top = pxToVw(currentY);
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
    
    container.style.left = pxToVw(currentX);
    container.style.top = pxToVw(currentY);
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.opacity = '1';
      
      // Save position to localStorage
      localStorage.setItem('messageBoxPosition', JSON.stringify({
        left: pxToVw(currentX),
        top: pxToVw(currentY)
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

function loadAISettings() {
  chrome.storage.sync.get(['aiUrl', 'aiModel', 'aiKey', 'aiToken', 'maxTokens', 'defaultPrompt', 'elementCaptureMode'], (result) => {
    const urlInput = document.getElementById('ai-url-input');
    const modelInput = document.getElementById('ai-model-input');
    const keyInput = document.getElementById('ai-key-input');
    const maxTokensInput = document.getElementById('ai-max-tokens-input');
    const promptInput = document.getElementById('default-prompt-input');
    
    if (urlInput) {
      urlInput.value = result.aiUrl || 'http://127.0.0.1:5000/v1/chat/completions';
    }
    if (modelInput) {
      modelInput.value = result.aiModel || 'claude';
    }
    if (keyInput) {
      keyInput.value = result.aiKey || result.aiToken || '';
    }
    if (maxTokensInput) {
      maxTokensInput.value = result.maxTokens ?? '';
    }
    if (promptInput) {
      promptInput.value = result.defaultPrompt || '';
    }
    setCaptureMode(result.elementCaptureMode || 'full', false);
  });
}

function saveAISettings() {
  const urlInput = document.getElementById('ai-url-input');
  const modelInput = document.getElementById('ai-model-input');
  const keyInput = document.getElementById('ai-key-input');
  const maxTokensInput = document.getElementById('ai-max-tokens-input');
  const promptInput = document.getElementById('default-prompt-input');
  
  const aiUrl = sanitizeEndpointUrl(urlInput.value);
  const aiModel = modelInput.value.trim();
  const aiKey = sanitizeApiKey(keyInput.value);
  const maxTokens = parseMaxTokens(maxTokensInput.value);
  const defaultPrompt = promptInput.value.trim();

  if (!aiUrl || !aiModel) {
    showNotification('Vui lòng nhập URL và Model name!', 'error');
    return;
  }

  chrome.storage.sync.set({
    aiUrl: aiUrl,
    aiModel: aiModel,
    aiKey: aiKey,
    maxTokens: maxTokens,
    defaultPrompt: defaultPrompt
  }, () => {
    showNotification('Cấu hình AI đã được lưu!', 'success');
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
    top: 1.42857vw;
    right: 1.42857vw;
    padding: 0.85714vw 1.42857vw;
    font-size: 1vw;
    z-index: 2147483650;
    animation: slideInNotif 0.3s ease-out;
    ${type === 'error' ? 'background: rgba(255, 255, 255, 0.2); color: white; border: 0.07143vw solid rgba(255, 255, 255, 0.3);' : 'background: rgba(255, 255, 255, 0.15); color: white; border: 0.07143vw solid rgba(255, 255, 255, 0.3);'}
  `;
  
  setTimeout(() => {
    notification.style.animation = 'slideOutNotif 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}

// Apply minimize/expand state
function setMinimizeState(minimized) {
  isMinimized = minimized;
  const messageBox = document.getElementById('message-box');
  const chatMessages = document.getElementById('chat-messages');
  const messageContent = document.getElementById('message-content');
  const messageFooter = document.getElementById('message-footer');
  const minimizeBtn = document.getElementById('minimize-btn');

  if (isMinimized) {
    // Collapse
    chatMessages.style.display = 'none';
    messageContent.style.display = 'none';
    messageFooter.style.display = 'none';
    messageBox.classList.add('minimized');
    minimizeBtn.textContent = '▲';
    minimizeBtn.title = 'Expand';
  } else {
    // Expand
    chatMessages.style.display = 'flex';
    messageContent.style.display = 'block';
    messageFooter.style.display = 'flex';
    messageBox.classList.remove('minimized');
    minimizeBtn.textContent = '_';
    minimizeBtn.title = 'Minimize';
  }
}

// Toggle minimize/expand
function toggleMinimize() {
  setMinimizeState(!isMinimized);
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

// Toggle element picker mode
function toggleElementPicker() {
  isPicking = !isPicking;
  const pickBtn = document.getElementById('pick-element-btn');
  const overlay = document.getElementById('message-overlay-container');

  if (isPicking) {
    pickBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    pickBtn.style.color = 'white';
    pickBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    overlay.style.pointerEvents = 'none'; // Allow clicks to pass through
    document.addEventListener('mouseover', highlightElementHandler, false);
    document.addEventListener('click', selectElementHandler, true);
  } else {
    // Remove all highlights first
    removeHighlight();
    
    pickBtn.style.backgroundColor = '';
    pickBtn.style.color = '';
    pickBtn.style.borderColor = '';
    overlay.style.pointerEvents = 'auto';
    document.removeEventListener('mouseover', highlightElementHandler, false);
    document.removeEventListener('click', selectElementHandler, true);
  }
}

// Remove highlight
function removeHighlight() {
  document.querySelectorAll('[data-picking-highlight="true"]').forEach(el => {
    el.removeAttribute('data-picking-highlight');
    el.style.outline = '';
    el.style.outlineOffset = '';
  });
}

// Display element info in tree structure
function displayElementInfo(element) {
  const elementInfo = document.getElementById('element-info');
  const elementPreview = document.getElementById('element-preview');

  if (elementCaptureMode === 'screenshot') {
    elementPreview.textContent = `Screenshot mode (full element): ${buildElementSelector(element)}`;
    elementInfo.style.display = 'block';
    updateElementPickStatus();
    return;
  }

  if (elementCaptureMode === 'content') {
    const contentElements = extractContentElements(element);
    elementPreview.textContent = contentElements.length
      ? contentElements.map((item, index) => `${index + 1}. ${item.selector}\n${item.html}`).join('\n\n')
      : 'No content elements found.';
    elementInfo.style.display = 'block';
    updateElementPickStatus();
    return;
  }

  const treeHtml = buildElementTree(element, 0);
  elementPreview.innerHTML = treeHtml;
  elementInfo.style.display = 'block';

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

function buildElementSelector(element) {
  const tagName = element.tagName.toLowerCase();
  const className = element.className && typeof element.className === 'string'
    ? `.${element.className.trim().split(/\s+/).join('.')}`
    : '';
  const idName = element.id ? `#${element.id}` : '';
  return `${tagName}${idName}${className}`;
}

function isContentElement(element) {
  const text = element.innerText?.trim();
  if (!text) return false;

  for (const child of element.children) {
    if (child.innerText?.trim()) return false;
  }
  return true;
}

function extractContentElements(root) {
  const results = [];
  const seen = new Set();

  if (isContentElement(root)) {
    seen.add(root);
    results.push({
      selector: buildElementSelector(root),
      html: root.outerHTML,
      text: root.innerText.trim()
    });
  }

  root.querySelectorAll('*').forEach((element) => {
    if (seen.has(element) || !isContentElement(element)) return;
    seen.add(element);
    results.push({
      selector: buildElementSelector(element),
      html: element.outerHTML,
      text: element.innerText.trim()
    });
  });

  return results;
}

const CAPTURE_FRAME_DELAY_MS = 150;
const MAX_CAPTURE_FRAMES = 100;
const MAX_CANVAS_DIMENSION = 16384;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findScrollableAncestor(element) {
  let node = element.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const scrollableY = (style.overflowY === 'auto' || style.overflowY === 'scroll')
      && node.scrollHeight > node.clientHeight + 1;
    const scrollableX = (style.overflowX === 'auto' || style.overflowX === 'scroll')
      && node.scrollWidth > node.clientWidth + 1;
    if (scrollableY || scrollableX) return node;
    node = node.parentElement;
  }
  return null;
}

function saveScrollState(scrollContainer) {
  return {
    scrollContainer,
    containerScrollTop: scrollContainer?.scrollTop ?? 0,
    containerScrollLeft: scrollContainer?.scrollLeft ?? 0,
    windowX: window.scrollX,
    windowY: window.scrollY
  };
}

function restoreScrollState(state) {
  if (state.scrollContainer) {
    state.scrollContainer.scrollTop = state.containerScrollTop;
    state.scrollContainer.scrollLeft = state.containerScrollLeft;
  }
  window.scrollTo(state.windowX, state.windowY);
}

function getElementCaptureMetrics(element, scrollContainer) {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(Math.max(rect.width, element.offsetWidth, element.scrollWidth));
  const height = Math.ceil(Math.max(rect.height, element.offsetHeight, element.scrollHeight));

  if (width <= 0 || height <= 0) return null;

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    return {
      width,
      height,
      baseScrollTop: scrollContainer.scrollTop + (rect.top - containerRect.top),
      baseScrollLeft: scrollContainer.scrollLeft + (rect.left - containerRect.left)
    };
  }

  return {
    width,
    height,
    baseScrollTop: rect.top + window.scrollY,
    baseScrollLeft: rect.left + window.scrollX
  };
}

function scrollToCapturePosition(metrics, scrollContainer, clipTop, clipLeft) {
  if (scrollContainer) {
    scrollContainer.scrollTop = metrics.baseScrollTop + clipTop;
    scrollContainer.scrollLeft = metrics.baseScrollLeft + clipLeft;
    return;
  }
  window.scrollTo(metrics.baseScrollLeft + clipLeft, metrics.baseScrollTop + clipTop);
}

async function captureVisibleTabScreenshot() {
  const dataUrl = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.dataUrl);
    });
  });

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load captured screenshot'));
    img.src = dataUrl;
  });

  return img;
}

async function captureElementScreenshot(element) {
  const overlay = document.getElementById('message-overlay-container');
  const originalDisplay = overlay.style.display;
  overlay.style.display = 'none';

  const scrollState = saveScrollState(findScrollableAncestor(element));

  try {
    element.scrollIntoView({ block: 'start', inline: 'start' });
    await delay(CAPTURE_FRAME_DELAY_MS);

    const scrollContainer = scrollState.scrollContainer;
    const metrics = getElementCaptureMetrics(element, scrollContainer);
    if (!metrics) {
      throw new Error('Selected element has no visible size');
    }

    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(metrics.width * dpr);
    const canvasHeight = Math.round(metrics.height * dpr);

    if (canvasWidth > MAX_CANVAS_DIMENSION || canvasHeight > MAX_CANVAS_DIMENSION) {
      throw new Error('Selected element is too large to capture as a single image');
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let clipTop = 0;
    let frameCount = 0;

    while (clipTop < metrics.height) {
      scrollToCapturePosition(metrics, scrollContainer, clipTop, 0);
      await delay(CAPTURE_FRAME_DELAY_MS);

      const rowRect = element.getBoundingClientRect();
      const rowClipTop = Math.max(0, -rowRect.top);
      const rowVisH = Math.min(
        metrics.height - rowClipTop,
        viewportH - Math.max(0, rowRect.top)
      );

      if (rowVisH <= 0) break;

      let clipLeft = 0;
      while (clipLeft < metrics.width) {
        if (frameCount >= MAX_CAPTURE_FRAMES) {
          throw new Error('Selected element is too large to capture within frame limit');
        }

        scrollToCapturePosition(metrics, scrollContainer, clipTop, clipLeft);
        await delay(CAPTURE_FRAME_DELAY_MS);

        const rect = element.getBoundingClientRect();
        const destX = Math.max(0, -rect.left);
        const destY = Math.max(0, -rect.top);
        const visW = Math.min(metrics.width - destX, viewportW - Math.max(0, rect.left));
        const visH = Math.min(metrics.height - destY, viewportH - Math.max(0, rect.top));

        if (visW <= 0 || visH <= 0) break;

        const img = await captureVisibleTabScreenshot();
        ctx.drawImage(
          img,
          Math.round(Math.max(0, rect.left) * dpr),
          Math.round(Math.max(0, rect.top) * dpr),
          Math.round(visW * dpr),
          Math.round(visH * dpr),
          Math.round(destX * dpr),
          Math.round(destY * dpr),
          Math.round(visW * dpr),
          Math.round(visH * dpr)
        );

        frameCount += 1;
        clipLeft += visW;
      }

      clipTop += rowVisH;
    }

    return canvas.toDataURL('image/png');
  } finally {
    restoreScrollState(scrollState);
    overlay.style.display = originalDisplay;
  }
}

async function buildElementPayload(element) {
  const selector = buildElementSelector(element);
  const baseInfo = {
    selector,
    tagName: element.tagName.toLowerCase(),
    id: element.id || '',
    className: typeof element.className === 'string' ? element.className : '',
    mode: elementCaptureMode
  };

  if (elementCaptureMode === 'screenshot') {
    return {
      ...baseInfo,
      imageBase64: await captureElementScreenshot(element)
    };
  }

  if (elementCaptureMode === 'content') {
    const contentElements = extractContentElements(element);
    return {
      ...baseInfo,
      contentElements,
      html: contentElements.map((item) => item.html).join('\n')
    };
  }

  return {
    ...baseInfo,
    html: element.outerHTML
  };
}

// Build element tree recursively
function buildElementTree(element, depth, maxDepth = 5) {
  if (depth > maxDepth) return '';

  const tagName = element.tagName.toLowerCase();
  const attrs = getElementAttributes(element);
  const hasChildren = element.children.length > 0;
  const indent = '  '.repeat(depth);

  let html = `<div class="tree-node" style="margin-left: ${depth * 16 / PX_BASE * 100}vw;">`;
  
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
async function sendMessage() {
  const messageInput = document.getElementById('message-input');
  const message = messageInput.value.trim();
  const sendBtn = document.getElementById('send-btn');

  if (!message && !pickedElement) {
    alert('Vui lòng nhập tin nhắn hoặc pick element!');
    return;
  }

  let fullMessage = message;
  let elementInfo = null;

  if (pickedElement) {
    sendBtn.disabled = true;
    sendBtn.textContent = elementCaptureMode === 'screenshot' ? 'Capturing...' : 'Sending...';

    try {
      elementInfo = await buildElementPayload(pickedElement);
    } catch (error) {
      console.error('Failed to build element payload:', error);
      addMessageToChat('error', `❌ ${error.message}`);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      return;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }

    if (!message) {
      if (elementCaptureMode === 'screenshot') {
        fullMessage = `📸 Screenshot: ${elementInfo.selector}`;
      } else if (elementCaptureMode === 'content') {
        fullMessage = `📌 Content elements: ${elementInfo.contentElements?.length || 0}`;
      } else {
        fullMessage = `📌 Element: ${elementInfo.selector}`;
      }
    }
  }

  addMessageToChat('user', fullMessage, elementInfo);
  clearMessageForm();

  const payload = {
    message: message || '',
    element: elementInfo,
    timestamp: new Date().toISOString()
  };

  console.log('Sending payload to AI:', JSON.stringify({
    ...payload,
    element: payload.element ? {
      ...payload.element,
      imageBase64: payload.element.imageBase64 ? '[image omitted]' : undefined
    } : null
  }, null, 2));

  try {
    chrome.runtime.sendMessage({
      action: 'sendMessage',
      data: payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError.message);
        addMessageToChat('error', '⚠️ Lỗi: Tiện ích đã được cập nhật. Vui lòng làm mới trang.');
        return;
      }

      if (response && response.success) {
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

function clearMessageForm() {
  const messageInput = document.getElementById('message-input');
  const elementPreview = document.getElementById('element-preview');

  if (messageInput) {
    messageInput.value = '';
  }

  pickedElement = null;
  if (elementPreview) {
    elementPreview.textContent = '';
  }
  updateElementPickStatus();
  setCaptureMode('full', false);
}

// Build clickable element block for chat messages
function buildMessageElementHtml(elementData) {
  const selector = escapeHtml(elementData.selector || 'Element');
  let summary = '';
  let details = '';

  if (elementData.mode === 'screenshot' && elementData.imageBase64) {
    summary = `
      <div class="element-selector">📸 ${selector}</div>
      <div class="element-summary-text">Screenshot</div>
      <div class="element-toggle-hint">Click to view details</div>
    `;
    details = `
      <div class="element-full-details">
        <div><strong>Mode:</strong> Screenshot</div>
        <div><strong>Selector:</strong> ${selector}</div>
        <div><strong>Tag:</strong> ${escapeHtml(elementData.tagName || '')}</div>
        ${elementData.id ? `<div><strong>ID:</strong> ${escapeHtml(elementData.id)}</div>` : ''}
        ${elementData.className ? `<div><strong>Class:</strong> ${escapeHtml(elementData.className)}</div>` : ''}
        <img src="${elementData.imageBase64}" alt="Element screenshot" class="element-screenshot">
      </div>
    `;
  } else if (elementData.mode === 'content' && elementData.contentElements?.length) {
    summary = `
      <div class="element-selector">📍 ${selector}</div>
      <div class="element-summary-text">Content Only · ${elementData.contentElements.length} element(s)</div>
      <div class="element-toggle-hint">Click to view details</div>
    `;
    const itemsHtml = elementData.contentElements.map((item, index) => `
      <div class="element-content-item">
        <div class="element-content-selector">${index + 1}. ${escapeHtml(item.selector)}</div>
        <pre class="element-html-block">${escapeHtml(item.html)}</pre>
      </div>
    `).join('');
    details = `
      <div class="element-full-details">
        <div><strong>Mode:</strong> Content Only</div>
        <div><strong>Root:</strong> ${selector}</div>
        ${itemsHtml}
      </div>
    `;
  } else {
    summary = `
      <div class="element-selector">📍 ${selector}</div>
      <div class="element-summary-text">${escapeHtml(elementData.tagName || '')}${elementData.id ? ` #${escapeHtml(elementData.id)}` : ''}</div>
      <div class="element-toggle-hint">Click to view details</div>
    `;
    details = `
      <div class="element-full-details">
        <div><strong>Mode:</strong> Full HTML</div>
        <div><strong>Selector:</strong> ${selector}</div>
        <div><strong>Tag:</strong> ${escapeHtml(elementData.tagName || '')}</div>
        ${elementData.id ? `<div><strong>ID:</strong> ${escapeHtml(elementData.id)}</div>` : ''}
        ${elementData.className ? `<div><strong>Class:</strong> ${escapeHtml(elementData.className)}</div>` : ''}
        <pre class="element-html-block">${escapeHtml(elementData.html || '')}</pre>
      </div>
    `;
  }

  return `<div class="message-element">${summary}${details}</div>`;
}

// Add message to chat display
function addMessageToChat(sender, message, elementData = null) {
  const chatMessages = document.getElementById('chat-messages');
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${sender}`;
  
  const timestamp = new Date().toLocaleTimeString();
  const senderLabel = sender === 'user' ? '👤 You' : sender === 'bot' ? '🤖 Bot' : '⚠️ Error';
  
  let contentHtml = `
    <div class="message-sender">${senderLabel}</div>
    <div class="message-content">${escapeHtml(message)}</div>
  `;

  // Add element info if available
  if (elementData && (sender === 'user' || sender === 'bot')) {
    contentHtml += buildMessageElementHtml(elementData);
  }

  contentHtml += `<div class="message-time">${timestamp}</div>`;
  
  messageEl.innerHTML = contentHtml;
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight; // Auto scroll to bottom
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize extension
function init() {
  // Check if overlay already exists
  if (document.getElementById('message-overlay-container')) {
    toggleOverlay(true);
    setMinimizeState(isMinimized);
    return;
  }

  createOverlay();
  setMinimizeState(isMinimized);
  updateElementPickStatus();

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
