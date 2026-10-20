(() => {
  'use strict';

  let controlPanel;

  function createControlPanel() {
    if (location.hostname !== 'apps.lms.hutech.edu.vn') return null;
    if (controlPanel) return controlPanel;
    const wrapper = document.createElement('div');
    wrapper.id = 'autoLmsControlPanel';
    wrapper.style.cssText = 'position:fixed;top:16px;right:16px;width:300px;height:440px;z-index:2147483647;overflow:hidden;border:1px solid #94a3b8;border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.28);background:#f4f7fb;display:none;';
    const header = document.createElement('div');
    header.style.cssText = 'height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 12px;color:#fff;background:#805ad5;font:700 12px Arial,sans-serif;cursor:move;user-select:none;';
    header.textContent = 'Auto LMS HUTECH';
    const controls = document.createElement('span');
    controls.style.cssText = 'display:flex;gap:5px;';
    const minimizeButton = document.createElement('button');
    minimizeButton.type = 'button';
    minimizeButton.textContent = '-';
    minimizeButton.title = 'Thu nhỏ';
    minimizeButton.style.cssText = 'width:24px;height:22px;padding:0;border:0;border-radius:4px;color:#fff;background:rgba(255,255,255,.2);font:bold 16px Arial;cursor:pointer;';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'x';
    closeButton.title = 'Ẩn panel';
    closeButton.style.cssText = minimizeButton.style.cssText;
    controls.append(minimizeButton, closeButton);
    header.appendChild(controls);
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html');
    frame.title = 'Auto LMS HUTECH';
    frame.style.cssText = 'display:block;width:100%;height:calc(100% - 32px);border:0;background:#f4f7fb;';
    wrapper.append(header, frame);
    document.documentElement.appendChild(wrapper);
    let minimized = false;
    minimizeButton.addEventListener('click', event => {
      event.stopPropagation();
      minimized = !minimized;
      frame.style.display = minimized ? 'none' : 'block';
      wrapper.style.height = minimized ? '32px' : 'calc(100vh - 32px)';
      minimizeButton.textContent = minimized ? '+' : '-';
      minimizeButton.title = minimized ? 'Mở rộng' : 'Thu nhỏ';
    });
    closeButton.addEventListener('click', event => {
      event.stopPropagation();
      wrapper.style.display = 'none';
    });
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    header.addEventListener('pointerdown', event => {
      if (event.target !== header) return;
      dragging = true;
      const rect = wrapper.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
      if (!dragging) return;
      wrapper.style.left = `${Math.max(0, event.clientX - offsetX)}px`;
      wrapper.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
      wrapper.style.right = 'auto';
    });
    header.addEventListener('pointerup', event => {
      dragging = false;
      header.releasePointerCapture(event.pointerId);
    });
    controlPanel = wrapper;
    return wrapper;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'getControlPanelState') {
      sendResponse({ ok: true, visible: controlPanel?.style.display !== 'none' });
      return false;
    }
    if (message?.type !== 'toggleControlPanel') return false;
    const frame = createControlPanel();
    if (!frame) {
      sendResponse({ ok: false, visible: false });
      return false;
    }
    const visible = frame.style.display !== 'none';
    frame.style.display = visible ? 'none' : 'block';
    sendResponse({ ok: true, visible: !visible });
    return false;
  });

  createControlPanel();
  chrome.storage.local.get('scanCheckProgress').then(({ scanCheckProgress }) => {
    if (scanCheckProgress?.running) createControlPanel().style.display = 'block';
  });

  const domain = 'https://apps.lms.hutech.edu.vn';
  const baseUrl = 'https://lms.hutech.edu.vn/xblock/';
  const queryParams = '?exam_access=&preview=0&recheck_access=1&show_bookmark=0&show_title=0&view=student_view';

  async function fetchAndFilterLessons() {
    await prepareCourseOutline();
    const links = document.querySelectorAll('#courseHome-outline a[href]');

    if (!links.length) {
    }

    const lessonCandidates = [];

    for (const link of links) {
      const title = link.textContent.trim().replace(/\s+/g, ' ');
      const rawHref = link.getAttribute('href') || '';
      const match = rawHref.match(/block-v1:[^/]*type@vertical[^/?\s]*/)
        || rawHref.match(/block-v1:[^/]+$/);

      if (!match) continue;

      const originalUrl = rawHref.startsWith('http')
        ? rawHref
        : `${domain}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
      const generatedUrl = `${baseUrl}${match[0]}${queryParams}`;

      lessonCandidates.push({ title, originalUrl, generatedUrl });
    }

    const response = await chrome.runtime.sendMessage({
      type: 'fetchLessonDetails',
      lessons: lessonCandidates
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Background không trả về kết quả.');
    }

    const result = {
      scannedAt: new Date().toISOString(),
      sourceUrl: location.href,
      lessons: response.lessons,
      videoCount: response.videoCount,
      problemCount: response.problemCount,
      videoCompletedCount: response.videoCompletedCount,
      videoIncompleteCount: response.videoIncompleteCount,
      problemCompletedCount: response.problemCompletedCount,
      problemIncompleteCount: response.problemIncompleteCount,
      reviewCount: response.reviewCount,
      reviewCompletedCount: response.reviewCompletedCount,
      reviewIncompleteCount: response.reviewIncompleteCount,
      totalCount: response.lessons.length
    };

    return result;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitFor(getValue, timeout = 15000, interval = 300) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = getValue();
      if (value) return value;
      await wait(interval);
    }
    return null;
  }

  async function prepareCourseOutline() {
    const selector = 'button.btn.btn-outline-primary.btn-block';
    const button = await waitFor(() => Array.from(document.querySelectorAll(selector)).find(item => {
      const text = item.textContent.trim();
      return text === 'Mở rộng tất cả' || text === 'Thu gọn tất cả';
    }), 15000, 300);

    if (!button) {
      return;
    }

    if (button.textContent.trim() === 'Mở rộng tất cả') {
      button.click();
      await waitFor(() => button.textContent.trim() === 'Thu gọn tất cả', 10000, 200);
      return;
    }

    button.click();
    await waitFor(() => button.textContent.trim() === 'Mở rộng tất cả', 10000, 200);
    button.click();
    await waitFor(() => button.textContent.trim() === 'Thu gọn tất cả', 10000, 200);
  }

  function getTargetBlockId(generatedUrl) {
    const url = new URL(generatedUrl);
    return decodeURIComponent(url.pathname.split('/xblock/')[1] || '').trim();
  }

  function findSequenceButton(type, blockId, allowFallback = true) {
    const buttons = Array.from(document.querySelectorAll(`button.seq_${type}`));
    const normalizeId = value => {
      try {
        return decodeURIComponent(String(value || '')).trim();
      } catch (error) {
        return String(value || '').trim();
      }
    };
    const wantedId = normalizeId(blockId);
    const exactButton = buttons.find(button => normalizeId(button.dataset.id) === wantedId);
    if (exactButton || !allowFallback) return exactButton || null;
    return buttons.find(button => button.offsetParent !== null) || buttons[0];
  }

  function isCompleted(button) {
    if (!button) return false;
    const check = button.querySelector('.check-circle');
    const checkStyle = `${check?.getAttribute('style') || ''} ${check?.innerHTML || ''}`;
    const checkVisible = check && !check.classList.contains('is-hidden');
    const hasGreenCheck = checkVisible && (
      checkStyle.toLowerCase().includes('color:green')
      || checkStyle.toLowerCase().includes('color: green')
      || Boolean(check.querySelector('.fa-check-circle[style*="green"]'))
    );
    return Boolean(hasGreenCheck);
  }

  async function processVideo(generatedUrl) {
    const blockId = getTargetBlockId(generatedUrl);
    const button = await waitFor(() => findSequenceButton('video', blockId));
    if (!button) throw new Error('Không tìm thấy nút video seq_video.');
    if (isCompleted(button)) return { completed: true, reason: 'already-completed' };

    button.click();
    const video = await waitFor(() => document.querySelector('video'), 20000);
    if (!video) throw new Error('Không tìm thấy thẻ video sau khi mở bài.');

    const videoReady = await waitForVideoReady(video, 30000);
    if (!videoReady) throw new Error('Video chưa có thời lượng hợp lệ.');

    const seeked = await seekVideoToEnd(video, 10000);
    if (!seeked) throw new Error('Không thể tua video đến cuối.');

    // Tua xong thì cuộn mượt từ trên xuống dưới trang, trước khi để video
    // tự chạy tiếp và xác nhận hoàn thành.
    await smoothScrollThroughPage();

    video.play().catch(() => {});
    // Chờ LMS xác nhận hoàn thành sau khi bắn event: tối đa 3 giây.
    const completion = waitForVideoCompletion(blockId, 3000);
    video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
    video.dispatchEvent(new Event('ended', { bubbles: true }));
    const completed = await completion;
    if (!completed) throw new Error('Đã xem xong video nhưng LMS chưa xác nhận hoàn tất trong 3 giây.');
    return { completed: true, reason: 'video-completed' };
  }

  function seekVideoToEnd(video, timeout) {
    return new Promise(resolve => {
      const target = Math.max(0, video.duration - 0.1);
      const events = ['loadeddata', 'canplay', 'progress', 'timeupdate', 'seeked'];
      let settled = false;
      let timer;
      let attempts = 0;

      const cleanup = () => {
        events.forEach(event => video.removeEventListener(event, onProgress));
        clearTimeout(timer);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const isAtTarget = () => Number.isFinite(video.currentTime)
        && video.currentTime >= target - 0.25;
      const seek = () => {
        if (isAtTarget()) {
          finish(true);
          return;
        }
        if (attempts >= 5) return;
        attempts++;
        try {
          video.currentTime = target;
        } catch (error) {
        }
      };
      const onProgress = () => {
        if (isAtTarget()) finish(true);
        else if (video.readyState >= 1) seek();
      };

      timer = setTimeout(() => finish(isAtTarget()), timeout);
      events.forEach(event => video.addEventListener(event, onProgress));
      seek();
    });
  }

  function waitForVideoReady(video, timeout) {
    return new Promise(resolve => {
      let settled = false;
      let timer;
      let pollTimer;
      let loadRequested = false;
      const events = ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay'];
      const ready = () => Number.isFinite(video.duration) && video.duration > 0;
      const cleanup = () => {
        events.forEach(event => video.removeEventListener(event, onReady));
        clearTimeout(timer);
        clearInterval(pollTimer);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onReady = () => {
        if (ready()) finish(true);
      };
      timer = setTimeout(() => finish(false), timeout);
      pollTimer = setInterval(() => {
        if (ready()) {
          finish(true);
          return;
        }

        const hasSource = Boolean(video.currentSrc || video.querySelector('source[src]'));
        if (hasSource && !loadRequested) {
          loadRequested = true;
          try {
            video.preload = 'auto';
            video.load();
          } catch (error) {
          }
        }
      }, 250);

      if (ready()) {
        finish(true);
        return;
      }
      events.forEach(event => video.addEventListener(event, onReady, { once: false }));
    });
  }

  // Chờ LMS xác nhận hoàn thành video qua MutationObserver, tối đa `timeout`ms
  // (mặc định 3 giây) rồi thôi, tránh treo mãi khi LMS không cập nhật DOM.
  function waitForVideoCompletion(blockId, timeout = 3000) {
    return new Promise(resolve => {
      let settled = false;
      let observer;
      let timer;
      const finish = value => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(value);
      };
      const check = () => {
        const button = findSequenceButton('video', blockId, false);
        if (isCompleted(button)) {
          finish(true);
        }
      };
      observer = new MutationObserver(check);
      timer = setTimeout(() => finish(false), timeout);

      check();
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    });
  }

  function getProblemQuestions(problem) {
    return Array.from(problem.querySelectorAll('.wrapper-problem-response')).map((wrapper, index) => {
      // Some questions (in both bài tập and ôn tập) use checkboxes and require
      // more than one correct choice, e.g. "(Choose two.)". Flag those so the
      // filling logic and the AI prompt know to expect multiple letters.
      // "Điền khuyết" (fill-in-the-blank) questions have a free-text input and
      // no <label>/options at all — flag those as "text" instead.
      const type = wrapper.querySelector('input[type="checkbox"]')
        ? 'checkbox'
        : wrapper.querySelector('input[type="radio"]')
          ? 'radio'
          : wrapper.querySelector('input[type="text"]')
            ? 'text'
            : 'radio';
      return {
        question: index + 1,
        text: wrapper.previousElementSibling?.innerText?.trim() || '',
        type,
        options: type === 'text'
          ? []
          : Array.from(wrapper.querySelectorAll('label')).map((label, optionIndex) => ({
            letter: String.fromCharCode(97 + optionIndex),
            text: label.innerText.trim()
          }))
      };
    });
  }

  // For fill-in-the-blank ("điền khuyết") text inputs there is no label to mark
  // correct like radio/checkbox options get. The right answer, when the LMS
  // reveals it, shows up either in the "<p class="answer">" placeholder next to
  // the input, or pre-filled on the input's own value attribute.
  function readRevealedTextAnswer(wrapper) {
    const revealed = wrapper.querySelector('.answer')?.textContent?.trim();
    if (revealed) return revealed;
    const prefilled = wrapper.querySelector('input[type="text"]')?.getAttribute('value')?.trim();
    return prefilled || '';
  }

  async function readProblemData(message = {}) {
    const problemButton = findSequenceButton('problem', message.lessonBlockId || '');
    if (problemButton) problemButton.click();
    const problem = await waitFor(() => document.querySelector('.problem'), 20000, 300);
    if (!problem) throw new Error('Không tìm thấy nội dung bài tập.');

    const questions = getProblemQuestions(problem);
    const answers = Array.from(problem.querySelectorAll('.wrapper-problem-response')).map((wrapper, index) => {
      // Fill-in-the-blank ("điền khuyết") questions: no labels, just a text input.
      const textInput = wrapper.querySelector('input[type="text"]');
      if (textInput) {
        const revealedText = readRevealedTextAnswer(wrapper);
        if (!revealedText) return null;
        return { question: index + 1, answer: revealedText };
      }

      const labels = Array.from(wrapper.querySelectorAll('label'));
      // Checkbox (multi-select) questions can have more than one label marked
      // correct, so collect ALL of them instead of stopping at the first match.
      let correctLabels = labels.filter(label => label.classList.contains('choicegroup_correct'));
      if (!correctLabels.length) {
        correctLabels = labels.filter(label => wrapper.querySelector(`input#${CSS.escape(label.htmlFor)}:checked`));
      }
      const letters = correctLabels
        .map(label => labels.indexOf(label))
        .filter(optionIndex => optionIndex >= 0)
        .sort((a, b) => a - b)
        .map(optionIndex => String.fromCharCode(97 + optionIndex));
      if (!letters.length) return null;
      return {
        question: index + 1,
        // Single-select stays a plain letter ("c"); multi-select becomes a
        // comma-separated list ("b,d") so the export/import format stays one string.
        answer: letters.join(',')
      };
    }).filter(Boolean);

    // Some "điền khuyết" blanks may not reveal their correct text before the
    // exercise is submitted — don't fail the whole lesson over those, keep
    // whatever answers we *could* read (radio/checkbox ones, mainly).
    if (!questions.length || !answers.length) {
      throw new Error('Không đọc đủ câu hỏi hoặc đáp án đúng từ bài.');
    }
    return { questions, answers };
  }

  function normalizeAnswer(answer) {
    const normalized = String(answer || '').trim().toLowerCase();
    // Letters can go past "d" (some questions have 5+ options), so match any
    // single letter marker instead of only a-d.
    const letter = normalized.match(/^([a-z])(?:[.)\-:]|\s|$)/);
    return letter ? letter[1] : normalized;
  }

  function normalizeOptionText(text) {
    return String(text || '').trim().toLowerCase().replace(/^[a-z][.)\-:]?\s*/, '');
  }

  // Splits an answer value that may hold one or several correct letters
  // ("b", "b,d", "b, d", "b and d", ["b","d"], ...) into a clean letter array.
  function parseAnswerLetters(answer) {
    const parts = Array.isArray(answer)
      ? answer
      : String(answer ?? '').split(/\s*[,;\/]\s*|\s+(?:và|and)\s+/i);
    return parts
      .map(part => normalizeAnswer(part))
      .filter(Boolean);
  }

  async function processExercise(message) {
    const blockId = getTargetBlockId(message.generatedUrl);
    const button = await waitFor(() => findSequenceButton('problem', blockId));
    if (!button) throw new Error('Không tìm thấy nút bài tập seq_problem.');
    if (isCompleted(button)) return { completed: true, reason: 'already-completed' };

    button.click();
    const problem = await waitFor(() => document.querySelector('.problem'), 15000);
    if (!problem) throw new Error('Không tìm thấy nội dung bài tập.');

    const questions = getProblemQuestions(problem);
    const problemText = problem.innerText.trim();
    if (!questions.length) throw new Error('Bài tập không có câu hỏi để xử lý.');

    const fileAnswers = message.answerSource === 'file'
      ? findFileAnswers(message.answerBank, message.generatedUrl, message.lessonTitle, questions)
      : null;
    let answers;
    if (fileAnswers) {
      answers = fileAnswers;
    } else if (message.answerSource === 'file') {
      throw new Error('Không tìm thấy đáp án của bài này trong file.');
    } else {
      const response = await chrome.runtime.sendMessage({ type: 'solveProblem', problemText, questions });
      if (!response?.ok) throw new Error(response?.error || 'AI không trả về đáp án.');
      answers = response.answers;
    }

    let selected = 0;
    for (const answer of answers) {
      const wrapper = problem.querySelectorAll('.wrapper-problem-response')[Number(answer.question) - 1];
      if (!wrapper) continue;

      // Fill-in-the-blank ("điền khuyết") questions: type the text straight into
      // the input instead of matching/clicking a letter option.
      const textInput = wrapper.querySelector('input[type="text"]');
      if (textInput) {
        const value = String(answer.answer ?? '').trim();
        if (!value) continue;
        textInput.focus();
        textInput.value = value;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
        textInput.blur();
        selected++;
        continue;
      }

      const wantedLetters = parseAnswerLetters(answer.answer);
      if (!wantedLetters.length) continue;
      const labels = Array.from(wrapper.querySelectorAll('label'));
      // Checkbox questions can need more than one option selected, so match
      // and click EVERY label that corresponds to a wanted letter/text, not
      // just the first one found.
      const matchedLabels = labels.filter((item, index) => {
        const optionLetter = String.fromCharCode(97 + index);
        const optionText = normalizeOptionText(item.innerText);
        return wantedLetters.includes(optionLetter) || wantedLetters.includes(optionText);
      });
      for (const label of matchedLabels) {
        const input = label && document.getElementById(label.htmlFor);
        if (input && !input.checked) {
          input.click();
          selected++;
        }
      }
    }

    if (!selected) throw new Error('Không chọn được đáp án nào.');
    const submit = problem.querySelector('button.submit:not([disabled])') || problem.querySelector('button.submit');
    if (!submit || submit.disabled) throw new Error('Nút Gửi đang bị khóa.');

    // Cuộn mượt từ trên xuống dưới trang trước khi nộp bài (bài tập/ôn tập),
    // để hành động nộp bài diễn ra giống một học viên thật đã xem hết bài.
    await smoothScrollThroughPage();

    const completion = waitForProblemCompletion(blockId, 3000);
    submit.click();
    const completed = await completion;
    if (!completed) throw new Error('Đã nộp bài nhưng LMS chưa xác nhận hoàn tất.');
    return { completed: true, reason: 'exercise-completed', questions, answers };
  }

  // Tìm mọi "khung cuộn" trên trang: window (toàn trang) và bất kỳ phần tử
  // con nào có thanh cuộn riêng (một số trang LMS hiển thị video/tài liệu
  // trong 1 div cuộn riêng, không cuộn ở window).
  function collectScrollTargets() {
    const targets = [{
      getTop: () => window.scrollY,
      getMax: () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      getViewport: () => window.innerHeight,
      setTop: top => window.scrollTo({ top, behavior: 'auto' })
    }];
    document.querySelectorAll('*').forEach(element => {
      if (element.scrollHeight > element.clientHeight + 20) {
        targets.push({
          getTop: () => element.scrollTop,
          getMax: () => Math.max(0, element.scrollHeight - element.clientHeight),
          getViewport: () => element.clientHeight,
          setTop: top => { element.scrollTop = top; }
        });
      }
    });
    return targets;
  }

  // Cuộn thật mượt từ đầu trang xuống cuối trang, đi từng bước nhỏ (không
  // nhảy cóc) để không bỏ sót đoạn nội dung nào đang hiển thị trên view,
  // áp dụng cho cả window và mọi khung con có cuộn riêng.
  function smoothScrollThroughPage() {
    return new Promise(resolve => {
      const targets = collectScrollTargets();
      // Về đầu trang trước, để chắc chắn đi qua toàn bộ nội dung từ trên
      // xuống dưới, không bỏ sót phần nào.
      targets.forEach(target => target.setTop(0));

      const stepDelay = 80;
      const maxSteps = 500;
      let step = 0;

      const tick = () => {
        let stillScrolling = false;
        targets.forEach(target => {
          const max = target.getMax();
          const current = target.getTop();
          if (current < max - 1) {
            // Bước cuộn nhỏ (1/4 khung nhìn) để cuộn êm và quét hết mọi nội
            // dung, không bỏ sót đoạn nào.
            const stepSize = Math.max(40, target.getViewport() * 0.25);
            const next = Math.min(max, current + stepSize);
            target.setTop(next);
            if (next < max - 1) stillScrolling = true;
          }
        });
        step++;
        if (stillScrolling && step < maxSteps) {
          setTimeout(tick, stepDelay);
        } else {
          // Chạm đúng đáy trước khi kết thúc, đảm bảo không còn sót phần nào.
          targets.forEach(target => target.setTop(target.getMax()));
          setTimeout(resolve, 250);
        }
      };

      setTimeout(tick, 150);
    });
  }

  function findFileAnswers(answerBank, generatedUrl, lessonTitle, questions) {
    if (!Array.isArray(answerBank)) return null;
    const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const currentTitle = normalize(document.querySelector('.problem')?.querySelector('.problem-header')?.innerText);
    const entry = answerBank.find(item => item?.url === generatedUrl)
      || answerBank.find(item => item?.title && normalize(item.title) === normalize(lessonTitle))
      || answerBank.find(item => item?.title && normalize(item.title) === currentTitle)
      || (answerBank.length === 1 ? answerBank[0] : null);
    if (!Array.isArray(entry?.answers) || !entry.answers.length) return null;
    if (entry.questions?.length && entry.questions.length !== questions.length) {
      throw new Error('Số câu hỏi trong file không khớp bài hiện tại.');
    }
    return entry.answers.map(answer => ({ ...answer, question: Number(answer.question) }));
  }

  function waitForProblemCompletion(blockId, timeout) {
    return new Promise(resolve => {
      let settled = false;
      let observer;
      let timer;
      const finish = value => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(value);
      };
      const check = () => {
        const button = findSequenceButton('problem', blockId);
        if (isCompleted(button)) finish(true);
      };

      observer = new MutationObserver(check);
      timer = setTimeout(() => finish(false), timeout);
      check();
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    });
  }

  async function processLesson(message) {
    if (message.mode === 'document') {
      // Tài liệu cũng phải cuộn mượt hết trang, giống bài tập/ôn tập/video.
      // Chờ một chút cho nội dung (SPA) kịp render xong trước khi cuộn.
      await wait(600);
      await smoothScrollThroughPage();
      return { completed: true, reason: 'document-opened' };
    }
    const result = message.mode === 'video'
      ? await processVideo(message.generatedUrl)
      : await processExercise(message);
    return result;
  }

  async function checkLessonCompletion(message) {
    const type = message.lessonType === 'problem' ? 'problem' : 'video';
    const blockId = getTargetBlockId(message.generatedUrl);
    const button = await waitFor(() => findSequenceButton(type, blockId), 15000);
    if (!button) throw new Error(`Không tìm thấy button seq_${type}.`);

    button.click();
    await wait(500);

    const refreshedButton = findSequenceButton(type, blockId);
    return {
      completed: isCompleted(refreshedButton),
      type,
      blockId
    };
  }

  function readLessonCompletion(message) {
    if (message.lessonType === 'document') {
      const documentButton = findSequenceButton('other', message.lessonBlockId || '');
      if (documentButton) {
        return {
          completed: isCompleted(documentButton),
          documentCompleted: isCompleted(documentButton),
          found: true,
          type: 'document',
          lessonTitle: message.lessonTitle,
          diagnostics: {
            sequence: true,
            buttonId: documentButton.dataset.id || '',
            buttonTitle: documentButton.dataset.pageTitle || ''
          }
        };
      }
      return {
        completed: true,
        documentCompleted: true,
        found: true,
        type: 'document',
        lessonTitle: message.lessonTitle,
        diagnostics: { direct: true, document: true }
      };
    }
    const type = message.lessonType === 'problem' ? 'problem' : 'video';
    const directProblem = readDirectProblemCompletion();
    if (message.lessonType === 'problem' && directProblem.found && !document.querySelector('button.seq_problem')) {
      return { ...directProblem, type, lessonTitle: message.lessonTitle };
    }
    const directVideo = readDirectVideoCompletion();
    if (message.lessonType === 'video' && directVideo.found && !document.querySelector('button.seq_video')) {
      return { ...directVideo, type, lessonTitle: message.lessonTitle };
    }
    if (message.lessonType === 'all') {
      const readType = lessonType => {
        const buttons = Array.from(document.querySelectorAll(`button.seq_${lessonType}`));
        const normalizeId = value => {
          try {
            return decodeURIComponent(String(value || '')).trim();
          } catch (error) {
            return String(value || '').trim();
          }
        };
        const normalizeTitle = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const wantedTitle = normalizeTitle(message.lessonTitle);
        const wantedId = normalizeId(message.lessonBlockId);
        const button = buttons.find(item => wantedId && normalizeId(item.dataset.id) === wantedId)
          || buttons.find(item => normalizeTitle(item.dataset.pageTitle) === wantedTitle)
          || (buttons.length === 1 ? buttons[0] : null);
        return {
          completed: isCompleted(button),
          found: Boolean(button),
          buttonCount: buttons.length
        };
      };

      const video = readType('video');
      const problem = readType('problem');
      return {
        completed: video.completed && problem.completed,
        found: video.found || problem.found,
        videoCompleted: video.completed,
        problemCompleted: problem.completed,
        videoFound: video.found,
        problemFound: problem.found,
        type: 'all',
        lessonTitle: message.lessonTitle,
        diagnostics: { page: location.href, video, problem }
      };
    }

    const buttons = Array.from(document.querySelectorAll(`button.seq_${type}`));
    const normalizeId = value => {
      try {
        return decodeURIComponent(String(value || '')).trim();
      } catch (error) {
        return String(value || '').trim();
      }
    };
    const normalizeTitle = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const wantedTitle = normalizeTitle(message.lessonTitle);
    const wantedId = normalizeId(message.lessonBlockId);
    const button = buttons.find(item => wantedId && normalizeId(item.dataset.id) === wantedId)
      || buttons.find(item => normalizeTitle(item.dataset.pageTitle) === wantedTitle)
      || (buttons.length === 1 ? buttons[0] : null);
    return {
      completed: isCompleted(button),
      found: Boolean(button),
      type,
      lessonTitle: message.lessonTitle,
      diagnostics: {
        page: location.href,
        title: document.title,
        buttonCount: buttons.length,
        expectedTitle: message.lessonTitle,
        buttonIds: buttons.map(item => item.dataset.id || ''),
        buttonPageTitles: buttons.map(item => item.dataset.pageTitle || ''),
        buttonDetails: buttons.map(item => ({
          id: item.dataset.id || '',
          className: item.className,
          checkClass: item.querySelector('.check-circle')?.className || null,
          checkHtml: item.querySelector('.check-circle')?.innerHTML || null,
          completed: isCompleted(item)
        })),
        matchingButton: Boolean(button),
        matchedButtonHtml: button?.outerHTML || null
      }
    };
  }

  function readDirectProblemCompletion() {
    const problems = Array.from(document.querySelectorAll('.problems-wrapper'));
    if (!problems.length) return { found: false, completed: false, diagnostics: { direct: true } };
    const completed = problems.every(problem => {
      const responses = problem.querySelectorAll('.wrapper-problem-response');
      const correct = problem.querySelectorAll('.wrapper-problem-response .status.correct');
      return responses.length > 0 && correct.length >= responses.length;
    });
    return {
      found: true,
      completed,
      diagnostics: {
        direct: true,
        problemCount: problems.length,
        completed
      }
    };
  }

  function readDirectVideoCompletion() {
    const videoBlock = document.querySelector('.xmodule_VideoBlock, .video[data-block-id], .video-player');
    if (!videoBlock) return { found: false, completed: false, diagnostics: { direct: true } };
    const video = videoBlock.matches('video') ? videoBlock : videoBlock.querySelector('video');
    const duration = Number(video?.duration);
    const currentTime = Number(video?.currentTime);
    const completed = videoBlock.classList.contains('completed')
      || (Number.isFinite(duration) && duration > 0 && currentTime >= duration * 0.65);
    return {
      found: true,
      completed,
      diagnostics: { direct: true, duration, currentTime, completed }
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'debugLog') {
      return false;
    }

    if (message?.type === 'checkLessonCompletion') {
      checkLessonCompletion(message)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(error => {
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message?.type === 'readLessonCompletion') {
      try {
        sendResponse({ ok: true, ...readLessonCompletion(message) });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return false;
    }

    if (message?.type === 'openLessonTab') {
      const type = message.lessonType === 'document' ? 'other' : message.lessonType === 'problem' ? 'problem' : 'video';
      const blockId = getTargetBlockId(message.generatedUrl);
      const button = findSequenceButton(type, blockId);
      if (button) {
        button.scrollIntoView({ block: 'center' });
        button.click();
        sendResponse({ ok: true, type, blockId });
      } else {
        sendResponse({ ok: false, error: `Không tìm thấy tab ${type}.` });
      }
      return false;
    }

    if (message?.type === 'processLesson') {
      processLesson(message)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(error => {
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message?.type === 'readProblemData') {
      readProblemData(message)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (!message || message.type !== 'fetchLessons') return false;

    fetchAndFilterLessons()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => {
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  });
})();
