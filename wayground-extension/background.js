// Background script to handle messaging and API calls

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendMessage') {
    handleMessage(request.data, sender, sendResponse);
    return true; // Keep channel open for async response
  }
  if (request.action === 'testConnection') {
    testServerConnection(request.url, sendResponse);
    return true;
  }
});

// Handle message sending
async function handleMessage(data, sender, sendResponse) {
  console.log('Received message from content script:', JSON.stringify(data, null, 2));

  try {
    // Get AI settings from storage
    chrome.storage.sync.get(['aiUrl', 'aiModel', 'aiKey', 'defaultPrompt', 'aiMaxTokens'], async (result) => {
      const aiUrl = result.aiUrl || 'http://127.0.0.1:5000/v1/chat/completions';
      const aiModel = result.aiModel || 'gpt-4';
      const aiKey = result.aiKey || '';
      const defaultPrompt = result.defaultPrompt || '';
      const aiMaxTokens = Number.parseInt(result.aiMaxTokens, 10);
      const safeMaxTokens = Number.isFinite(aiMaxTokens) && aiMaxTokens > 0 ? aiMaxTokens : 1024;

      console.log('Using AI URL:', aiUrl);
      console.log('Using AI Model:', aiModel);
      console.log('Has API Key:', !!aiKey);

      try {
        const cleanedKey = (typeof aiKey === 'string' ? aiKey.trim() : '');

        const promptContent = typeof data?.prompt === 'string' && data.prompt.trim()
          ? data.prompt
          : buildMessageContent(data, defaultPrompt);
        const systemPrompt = typeof data?.systemPrompt === 'string' && data.systemPrompt.trim()
          ? data.systemPrompt
          : defaultPrompt;

        // Build messages array with element context and default prompt
        const messages = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({
          role: 'user',
          content: promptContent
        });

        const requestBody = {
          model: aiModel,
          messages: messages,
          max_tokens: safeMaxTokens
        };

        if (cleanedKey) {
          requestBody.api_key = cleanedKey;
          requestBody.apiKey = cleanedKey;
        }

        console.log('Final message content to send to AI:');
        console.log(requestBody.messages[0].content);
        console.log('Sending request to AI server:', aiUrl);

        // Build headers with optional API key
        const headers = {
          'Content-Type': 'application/json',
        };

        if (cleanedKey) {
          headers['Authorization'] = `Bearer ${cleanedKey}`;
          headers['X-API-Key'] = cleanedKey;
          headers['api-key'] = cleanedKey;
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
function buildMessageContent(data, defaultPrompt = '') {
  let content = data.message || '';

  // Always include element context if present
  if (data.element) {
    const elem = data.element;
    const elementContext = `📌 **Context Element:**
- Selector: \`${elem.selector}\`
- Tag: \`${elem.tagName}\`
${elem.id ? `- ID: \`${elem.id}\`` : ''}
${elem.className ? `- Class: \`${elem.className}\`` : ''}
- HTML: \`\`\`
${elem.html}
\`\`\``;

    // If there's no user message, use element as the main content
    if (!content) {
      content = elementContext;
    } else {
      // Append element context to user message
      content = content + '\n\n' + elementContext;
    }
  }

  // Append default prompt if provided
  if (defaultPrompt && defaultPrompt.trim()) {
    content = content + '\n\n---\n' + defaultPrompt;
  }

  return content;
}

// Test server connection
async function testServerConnection(url, sendResponse) {
  console.log('Testing connection to:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'test',
        messages: [{ role: 'user', content: 'test' }]
      })
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
}

