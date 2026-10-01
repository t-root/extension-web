'use strict';

const externalIframeTabs = new Set();

function isHutechUrl(url) {
  try {
    return new URL(url).hostname.endsWith('.hutech.edu.vn')
      || new URL(url).hostname === 'hutech.edu.vn';
  } catch (error) {
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete' || !externalIframeTabs.has(tabId)) return;

  externalIframeTabs.delete(tabId);
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  }).catch((error) => {
    console.error('[Auto LMS Engine] Không thể inject content.js vào tab iframe:', error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'solveProblem') {
    solveProblemWithAi(message).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (!message || message.type !== 'openIframeTab' || typeof message.url !== 'string') {
    return false;
  }

  chrome.tabs.create({ url: message.url, active: false }, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      sendResponse({ opened: false });
      return;
    }

    if (!isHutechUrl(message.url)) {
      externalIframeTabs.add(tab.id);
    }

    sendResponse({ opened: true, tabId: tab.id });
  });

  return true;
});

async function solveProblemWithAi(message) {
  const settings = await chrome.storage.sync.get(['aiModel', 'aiEndpoint', 'aiApiKey']);
  const apiKey = settings.aiApiKey;

  if (!apiKey) {
    throw new Error('Chưa cấu hình API key trong Popup.');
  }

  const model = settings.aiModel || 'auto';
  const endpoint = settings.aiEndpoint || 'http://127.0.0.1:5000/v1/chat/completions';
  const prompt = buildProblemPrompt(message.problemText, message.questions);
  const requestBody = {
    model,
    messages: [
      { role: 'system', content: 'Bạn là trợ lý trả lời câu hỏi trắc nghiệm. Chỉ trả về JSON hợp lệ.' },
      { role: 'user', content: prompt }
    ]
  };

  console.log('[Auto LMS AI] Sending request:', {
    model,
    endpoint,
    questionCount: message.questions?.length || 0
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    console.error('[Auto LMS AI] API error:', response.status, response.statusText);
    throw new Error(`AI API trả về HTTP ${response.status}.`);
  }

  const data = await response.json();
  console.log('[Auto LMS AI] Raw API response:', data);
  const text = data.choices?.[0]?.message?.content;

  if (!text) throw new Error('AI không trả về nội dung đáp án.');

  console.log('[Auto LMS AI] AI response text:', text);
  const answers = parseAnswers(text);
  console.log('[Auto LMS AI] Parsed answers:', answers);
  return { ok: true, answers };
}

function buildProblemPrompt(problemText, questions) {
  return [
    'Đọc bài trắc nghiệm dưới đây và chọn đáp án đúng.',
    'Trả về duy nhất JSON theo định dạng: {"answers":[{"question":1,"answer":"c"}]}.' ,
    'answer phải là chữ cái a, b, c hoặc d; question là số thứ tự câu hỏi.',
    '',
    JSON.stringify({ questions, problemText })
  ].join('\n');
}

function parseAnswers(text) {
  const cleaned = String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const jsonText = extractFirstJsonObject(cleaned);
  if (!jsonText) {
    throw new Error('AI không trả về JSON đáp án hợp lệ.');
  }

  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed.answers)) throw new Error('JSON đáp án không đúng định dạng.');
  return parsed.answers;
}

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}