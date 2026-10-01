// Background script to handle messaging and API calls

// Use endpoint URL exactly as configured — no path joining or base-URL rewriting.
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

function getStoredApiKey(result) {
  return sanitizeApiKey(result.aiKey || result.aiToken || '');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendMessage') {
    handleMessage(request.data, sender, sendResponse);
    return true; // Keep channel open for async response
  }
  if (request.action === 'testConnection') {
    testServerConnection(request.url, sendResponse);
    return true;
  }
  if (request.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }
});

// Handle message sending
async function handleMessage(data, sender, sendResponse) {
  console.log('Received message from content script:', JSON.stringify(data, null, 2));

  try {
    // Get AI settings from storage
    chrome.storage.sync.get(['aiUrl', 'aiModel', 'aiKey', 'aiToken', 'maxTokens', 'defaultPrompt'], async (result) => {
      const aiUrl = sanitizeEndpointUrl(result.aiUrl) || 'http://127.0.0.1:5000/v1/chat/completions';
      const aiModel = (result.aiModel || 'claude').trim();
      const aiKey = getStoredApiKey(result);
      const maxTokens = parseMaxTokens(result.maxTokens);
      const defaultPrompt = result.defaultPrompt || '';

      console.log('Using AI URL:', aiUrl);
      console.log('Using AI Model:', aiModel);
      console.log('Has API Key:', !!aiKey);
      console.log('Max Tokens:', maxTokens ?? '(default)');

      try {
        const messages = [];

        if (defaultPrompt && defaultPrompt.trim()) {
          messages.push({
            role: 'system',
            content: defaultPrompt.trim()
          });
        }

        messages.push({
          role: 'user',
          content: buildMessageContent(data)
        });

        const requestBody = {
          model: aiModel,
          messages: messages
        };

        if (maxTokens !== null) {
          requestBody.max_tokens = maxTokens;
        }

        console.log('Final message content to send to AI:');
        console.log(requestBody.messages[0].content);
        console.log('Sending request to AI server:', aiUrl);

        // Build headers with optional API key
        const headers = {
          'Content-Type': 'application/json',
        };
        
        if (aiKey) {
          headers['Authorization'] = `Bearer ${aiKey}`;
        }

        // Send to AI endpoint
        const response = await fetch(aiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        console.log('Response status:', response.status, response.statusText);
        console.log('Response headers:', {
          contentType: response.headers.get('content-type'),
          corsOrigin: response.headers.get('access-control-allow-origin')
        });

        if (response.ok) {
          const responseData = await response.json();
          console.log('AI Response:', responseData);
          
          // Extract message from response - handle various formats
          let aiMessage = '';
          if (responseData.choices && responseData.choices[0]) {
            aiMessage = responseData.choices[0].message?.content || 
                       responseData.choices[0].text || 
                       JSON.stringify(responseData.choices[0]);
          } else if (responseData.message) {
            aiMessage = responseData.message;
          } else {
            aiMessage = JSON.stringify(responseData);
          }

          console.log('Extracted message:', aiMessage);

          sendResponse({
            success: true,
            data: {
              message: aiMessage,
              timestamp: new Date().toISOString()
            }
          });
        } else {
          const errorText = await response.text().catch(() => '(no response text)');
          const errorMsg = `AI Server returned error: ${response.status} ${response.statusText}${errorText ? '\n' + errorText : ''}`;
          console.error(errorMsg);
          sendResponse({
            success: false,
            error: errorMsg
          });
        }
      } catch (error) {
        console.error('Error sending to AI:', error);
        sendResponse({
          success: false,
          error: 'Error: ' + error.message
        });
      }
    });
  } catch (error) {
    console.error('Error in handleMessage:', error);
    sendResponse({
      success: false,
      error: 'Error: ' + error.message
    });
  }
}

// Build message content with element context
function buildMessageContent(data) {
  const textParts = [];
  if (data.message) {
    textParts.push(data.message);
  }

  if (data.element) {
    const elem = data.element;
    let elementContext = '';

    if (elem.mode === 'screenshot' && elem.imageBase64) {
      elementContext = `📌 **Context Element (Screenshot):**
- Selector: \`${elem.selector}\`
- Tag: \`${elem.tagName}\`
${elem.id ? `- ID: \`${elem.id}\`` : ''}
${elem.className ? `- Class: \`${elem.className}\`` : ''}`;
    } else if (elem.mode === 'content' && elem.contentElements?.length) {
      const items = elem.contentElements.map((item, index) => {
        return `${index + 1}. \`${item.selector}\`\n\`\`\`html\n${item.html}\n\`\`\``;
      }).join('\n\n');
      elementContext = `📌 **Context Elements (Content Only):**
- Root: \`${elem.selector}\`
- Found: ${elem.contentElements.length} element(s)

${items}`;
    } else {
      elementContext = `📌 **Context Element:**
- Selector: \`${elem.selector}\`
- Tag: \`${elem.tagName}\`
${elem.id ? `- ID: \`${elem.id}\`` : ''}
${elem.className ? `- Class: \`${elem.className}\`` : ''}
- HTML: \`\`\`html
${elem.html}
\`\`\``;
    }

    if (!textParts.length) {
      textParts.push(elementContext);
    } else {
      textParts.push(elementContext);
    }
  }

  const textContent = textParts.join('\n\n');

  if (data.element?.mode === 'screenshot' && data.element.imageBase64) {
    return [
      { type: 'text', text: textContent },
      { type: 'image_url', image_url: { url: data.element.imageBase64 } }
    ];
  }

  return textContent;
}

// Test server connection
async function testServerConnection(rawUrl, sendResponse) {
  const url = sanitizeEndpointUrl(rawUrl);
  console.log('Testing connection to:', url);

  if (!url) {
    sendResponse({ error: 'Endpoint URL is empty', ok: false });
    return;
  }

  try {
    chrome.storage.sync.get(['aiModel', 'aiKey', 'aiToken', 'maxTokens'], async (result) => {
      const headers = { 'Content-Type': 'application/json' };
      const aiKey = getStoredApiKey(result);
      const maxTokens = parseMaxTokens(result.maxTokens);
      if (aiKey) {
        headers['Authorization'] = `Bearer ${aiKey}`;
      }

      const body = {
        model: (result.aiModel || 'test').trim(),
        messages: [{ role: 'user', content: 'test' }]
      };
      if (maxTokens !== null) {
        body.max_tokens = maxTokens;
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        console.log('Test response status:', response.status);
        const text = await response.text();
        console.log('Test response:', text);

        sendResponse({
          status: response.status,
          statusText: response.statusText,
          responsePreview: text.substring(0, 200),
          ok: response.ok
        });
      } catch (error) {
        console.error('Connection test failed:', error);
        sendResponse({
          error: error.message,
          ok: false
        });
      }
    });
  } catch (error) {
    console.error('Connection test failed:', error);
    sendResponse({
      error: error.message,
      ok: false
    });
  }
}

// Optional: Add a context menu item to open the overlay
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.contextMenus.create({
      id: 'openOverlay',
      title: 'Open Message Box',
      contexts: ['page']
    });
  } catch (err) {
    console.log('Context menu creation error:', err);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'openOverlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'showOverlay' });
      }
    });
  }
});
