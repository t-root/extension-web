document.addEventListener('DOMContentLoaded', async () => {
  if (window.top === window) {
    document.body.classList.add('extension-popup');
    const panelToggleButton = document.getElementById('panelToggleButton');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentState = tabs[0]?.id
      ? await chrome.tabs.sendMessage(tabs[0].id, { type: 'getControlPanelState' }).catch(() => null)
      : null;
    panelToggleButton.textContent = currentState?.visible ? 'Tắt' : 'Bật';
    panelToggleButton.addEventListener('click', async () => {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = activeTabs[0]?.id
        ? await chrome.tabs.sendMessage(activeTabs[0].id, { type: 'toggleControlPanel' }).catch(() => null)
        : null;
      panelToggleButton.textContent = response?.visible ? 'Tắt' : 'Bật';
    });
    return;
  }

  const scanCheckButton = document.getElementById('scanCheckButton');
  const stopButton = document.getElementById('stopActivity');
  const studyVideosButton = document.getElementById('studyVideos');
  const studyExercisesButton = document.getElementById('studyExercises');
  const studyReviewsButton = document.getElementById('studyReviews');
  const studyDocumentsButton = document.getElementById('studyDocuments');
  const status = document.getElementById('status');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingMessage = document.getElementById('loadingMessage');
  const noticeOverlay = document.getElementById('noticeOverlay');
  const noticeTitle = document.getElementById('noticeTitle');
  const noticeMessage = document.getElementById('noticeMessage');
  const noticeOkButton = document.getElementById('noticeOkButton');
  const totalCount = document.getElementById('totalCount');
  const videoCount = document.getElementById('videoCount');
  const videoCompletedCount = document.getElementById('videoCompletedCount');
  const videoIncompleteCount = document.getElementById('videoIncompleteCount');
  const problemCount = document.getElementById('problemCount');
  const problemCompletedCount = document.getElementById('problemCompletedCount');
  const problemIncompleteCount = document.getElementById('problemIncompleteCount');
  const reviewCount = document.getElementById('reviewCount');
  const reviewCompletedCount = document.getElementById('reviewCompletedCount');
  const reviewIncompleteCount = document.getElementById('reviewIncompleteCount');
  const documentCount = document.getElementById('documentCount');
  const documentCompletedCount = document.getElementById('documentCompletedCount');
  const documentIncompleteCount = document.getElementById('documentIncompleteCount');
  const videoIncompleteSelect = document.getElementById('videoIncompleteSelect');
  const problemIncompleteSelect = document.getElementById('problemIncompleteSelect');
  const reviewIncompleteSelect = document.getElementById('reviewIncompleteSelect');
  const documentIncompleteSelect = document.getElementById('documentIncompleteSelect');
  let scanStorageKey = 'lessonScan';
  const actionButtons = [studyVideosButton, studyExercisesButton, studyReviewsButton, studyDocumentsButton];

  const initialTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const initialHomeUrl = getCourseHomeUrl(initialTabs[0]?.url);
  if (initialHomeUrl) scanStorageKey = getScanStorageKey(initialHomeUrl);
  const savedScan = await chrome.storage.local.get([scanStorageKey]);
  if (savedScan[scanStorageKey]) renderScan(savedScan[scanStorageKey]);
  const savedProgress = await chrome.storage.local.get(['studyProgress']);
  const savedCheckProgress = await chrome.storage.local.get(['checkProgress', 'scanCheckProgress']);
  const activeCheckProgress = savedCheckProgress.scanCheckProgress?.running
    ? savedCheckProgress.checkProgress
    : null;
  updateStopButton(savedProgress.studyProgress, activeCheckProgress);
  if (savedProgress.studyProgress) renderStudyProgress(savedProgress.studyProgress);
  else if (savedCheckProgress.scanCheckProgress?.running) {
    setActionButtonsBusy('check');
    setStatus('Đang check, không đóng popup/extension...');
  }

  if (savedCheckProgress.scanCheckProgress?.running) {
    setActionButtonsBusy('check');
    scanCheckButton.disabled = true;
    setStatus('Đang check, không đóng popup/extension...');
  }

  scanCheckButton.addEventListener('click', runScanAndCheck);
  stopButton.addEventListener('click', stopActivity);
  studyVideosButton.addEventListener('click', () => startStudy('video'));
  studyExercisesButton.addEventListener('click', () => startStudy('exercise'));
  studyReviewsButton.addEventListener('click', () => startStudy('review'));
  studyDocumentsButton.addEventListener('click', () => startStudy('document'));
  [videoIncompleteSelect, problemIncompleteSelect, reviewIncompleteSelect, documentIncompleteSelect].forEach(select => {
    select.addEventListener('change', () => {
      if (!select.value) return;
      const option = select.options[select.selectedIndex];
      chrome.runtime.sendMessage({
        type: 'openLessonTab',
        url: select.value,
        lessonType: option.dataset.lessonType,
        lessonTitle: option.dataset.lessonTitle
      });
    });
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[scanStorageKey]) {
      const updatedScan = changes[scanStorageKey].newValue;
      if (updatedScan) renderScan(updatedScan, false);
    }
    if (areaName === 'local' && changes.scanCheckProgress?.newValue?.running) {
      setActionButtonsBusy('check');
      scanCheckButton.disabled = true;
      setStatus('Đang check, không đóng popup/extension...');
    }
    if (areaName === 'local' && (changes.studyProgress || changes.checkProgress || changes.scanCheckProgress)) {
      chrome.storage.local.get(['studyProgress', 'checkProgress', 'scanCheckProgress']).then(current => {
        const scanRunning = current.scanCheckProgress?.running === true;
        updateStopButton(current.studyProgress, scanRunning ? current.checkProgress : null);
        if (changes.studyProgress && current.studyProgress) {
          renderStudyProgress(current.studyProgress);
        } else if (scanRunning) {
          setActionButtonsBusy('check');
          scanCheckButton.disabled = true;
          setStatus('Đang check, không đóng popup/extension...');
        } else if (changes.scanCheckProgress) {
          scanCheckButton.disabled = false;
          resetActionButtons();
          setStatus('');
        }
      });
    }
  });

  async function fetchLinks() {
    scanCheckButton.disabled = true;
    setActionButtonsBusy('fetch');
    setStatus('Đang chuẩn bị trang khóa học...');

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab?.id) throw new Error('Không tìm thấy tab hiện tại.');

      const homeUrl = getCourseHomeUrl(activeTab.url);
      if (!homeUrl) throw new Error('URL hiện tại không chứa mã khóa học hợp lệ.');
      scanStorageKey = getScanStorageKey(homeUrl);
      if (activeTab.url !== homeUrl) await navigateTabAndWait(activeTab.id, homeUrl);


      setStatus('Đang lấy link và đếm video/bài tập...');
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'fetchLessons' });
      if (!response?.ok) throw new Error(response?.error || 'Không lấy được dữ liệu.');

      await chrome.storage.local.set({ [scanStorageKey]: response.result });
      renderScan(response.result);
      setStatus(`Đã lưu ${response.result.totalCount} bài từ trang hiện tại.`);
    } catch (error) {
      setStatus(error.message.includes('Receiving end')
        ? 'Hãy mở trang khóa học LMS rồi thử lại.'
        : error.message, true);
    } finally {
      scanCheckButton.disabled = false;
      resetActionButtons();
    }
  }

  async function runScanAndCheck() {
    scanCheckButton.disabled = true;
    setActionButtonsBusy('check');
    setStatus('Đang check, không đóng popup/extension...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab?.id) throw new Error('Không tìm thấy tab hiện tại.');
      const homeUrl = getCourseHomeUrl(activeTab.url);
      if (!homeUrl) throw new Error('URL hiện tại không chứa mã khóa học hợp lệ.');
      scanStorageKey = getScanStorageKey(homeUrl);
      const response = await chrome.runtime.sendMessage({
        type: 'startScanAndCheck',
        sourceTabId: activeTab.id
      });
      if (!response?.ok) throw new Error(response?.error || 'Không thể lấy link và check hoàn thành.');
      renderScan(response.result);
      setStatus('Đã lấy link và check hoàn thành.');
    } finally {
      scanCheckButton.disabled = false;
      resetActionButtons();
    }
  }

  function getCourseHomeUrl(tabUrl) {
    try {
      const url = new URL(tabUrl || '');
      const path = decodeURIComponent(url.pathname);
      const match = path.match(/(course-v1:[^/]+)/);
      if (!match) return '';
      return `https://apps.lms.hutech.edu.vn/learning/course/${match[1]}/home`;
    } catch (error) {
      return '';
    }
  }

  async function refreshScanStorageKey() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const homeUrl = getCourseHomeUrl(tabs[0]?.url);
    if (homeUrl) scanStorageKey = getScanStorageKey(homeUrl);
  }

  async function loadCurrentScan() {
    const saved = await chrome.storage.local.get([scanStorageKey, 'lessonScan']);
    if (saved[scanStorageKey]?.lessons) return saved[scanStorageKey];

    const courseMatch = scanStorageKey.match(/(course-v1:[^/]+)/);
    if (!courseMatch) return saved.lessonScan || null;
    const all = await chrome.storage.local.get(null);
    const matchingKey = Object.keys(all).find(key => {
      if (!key.startsWith('lessonScan:') || !all[key]?.lessons) return false;
      return String(all[key].sourceUrl || '').includes(courseMatch[1]);
    });
    return matchingKey ? all[matchingKey] : (saved.lessonScan || null);
  }

  async function loadRemoteAnswerBank(mode) {
    if (mode !== 'exercise' && mode !== 'review') return [];
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const courseCode = getCourseCode(tabs[0]?.url);
    if (!courseCode) throw new Error('Không lấy được mã khóa học từ URL hiện tại.');

    const suffix = mode === 'exercise' ? 'baitap' : 'ontap';
    const url = `https://t-root.github.io/data-lms-hutech/${courseCode}-${suffix}-answers.json`;
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status === 404) {
      throw new Error(`Chưa có dữ liệu đáp án cho mã ${courseCode}. Vui lòng liên hệ Zalo 0325565117 Tran Trung để yêu cầu dữ liệu.`);
    }
    if (!response.ok) throw new Error(`Không tải được đáp án từ GitHub (${response.status}).`);
    const data = await response.json();
    const answers = Array.isArray(data) ? data : data.answers;
    if (!Array.isArray(answers) || !answers.length) throw new Error('File đáp án trên GitHub không có dữ liệu.');
    await showNotice('Tải thành công', `Đã tải ${answers.length} bộ đáp án cho ${courseCode}.`);
    return answers;
  }

  function getScanStorageKey(homeUrl) {
    return `lessonScan:${homeUrl}`;
  }

  function getCourseCode(tabUrl) {
    try {
      const path = decodeURIComponent(new URL(tabUrl || '').pathname);
      const match = path.match(/course-v1:[^/]+\+[^/+]*?_([A-Za-z0-9]+)_/);
      return match ? match[1].toUpperCase() : '';
    } catch (error) {
      return '';
    }
  }

  function navigateTabAndWait(tabId, url) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('Trang khóa học tải quá lâu.'));
      }, 30000);

      function cleanup() {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
      }

      function onUpdated(updatedTabId, changeInfo, updatedTab) {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
        cleanup();
        resolve(updatedTab);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.update(tabId, { url }).catch(error => {
        cleanup();
        reject(error);
      });
    });
  }

  async function checkCompletion() {
    await refreshScanStorageKey();
    const savedLessonScan = await loadCurrentScan();
    const lessons = savedLessonScan?.lessons || [];
    if (!lessons.length) {
      setStatus('Hãy bấm Lấy link trước khi Check hoàn thành.', true);
      return;
    }

    scanCheckButton.disabled = true;
    setActionButtonsBusy('check');
    setStatus('Đang check trạng thái hoàn thành...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.runtime.sendMessage({
        type: 'checkCompletions',
        lessons,
        sourceTabId: tabs[0]?.id
      });
      if (!response?.ok) throw new Error(response?.error || 'Không thể check hoàn thành.');
      const scan = { ...savedLessonScan, ...response.result, scannedAt: new Date().toISOString() };
      await chrome.storage.local.set({ [scanStorageKey]: scan });
      renderScan(scan);
      setStatus('Đã check xong trạng thái hoàn thành.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      scanCheckButton.disabled = false;
      resetActionButtons();
    }
  }

  async function stopActivity() {
    stopButton.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'stopAllActivity' });
      if (!response?.ok) throw new Error(response?.error || 'Không thể dừng hoạt động.');
      setStatus('Đã dừng toàn bộ hoạt động và đóng các tab đang chạy.');
      stopButton.disabled = true;
      enableStudyButtons();
      resetActionButtons();
    } catch (error) {
      setStatus(error.message, true);
      stopButton.disabled = false;
      enableStudyButtons();
      resetActionButtons();
    }
  }

  async function startStudy(mode) {
    await refreshScanStorageKey();
    const savedLessonScan = await loadCurrentScan();
    const lessons = savedLessonScan?.lessons || [];
    let answerBank;
    try {
      answerBank = await loadRemoteAnswerBank(mode);
    } catch (error) {
      setStatus(error.message, true);
      await showNotice('Không có dữ liệu', error.message, true);
      return;
    }
    const eligibleLessons = lessons.filter(lesson => mode === 'video'
      ? lesson.hasVideo && lesson.videoCompleted !== true
      : mode === 'review'
        ? lesson.isReview && lesson.problemCompleted !== true
        : mode === 'exercise'
          ? lesson.hasProblem && !lesson.isReview && lesson.problemCompleted !== true
          : lesson.hasDocument && lesson.documentCompleted !== true);

    if (!eligibleLessons.length) {
      setStatus('Chưa có danh sách bài phù hợp. Hãy bấm Lấy link trước.', true);
      return;
    }

    studyVideosButton.disabled = true;
    studyExercisesButton.disabled = true;
    studyReviewsButton.disabled = true;
    studyDocumentsButton.disabled = true;
    setActionButtonsBusy(mode);
    const modeLabel = mode === 'video' ? 'bài video' : mode === 'review' ? 'bài ôn tập trắc nghiệm' : mode === 'exercise' ? 'bài tập' : 'tài liệu';
    setStatus(`Đang chuẩn bị ${eligibleLessons.length} ${modeLabel}...`);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.runtime.sendMessage({
        type: 'startStudy',
        mode,
        lessons: eligibleLessons,
        answerSource: mode === 'video' || mode === 'document' ? 'ai' : 'file',
        answerBank,
        sourceTabId: tabs[0]?.id
      });
      if (!response?.ok) throw new Error(response?.error || 'Không thể bắt đầu tiến trình.');
      stopButton.disabled = false;
      setStatus(`Đã mở tiến trình ${mode === 'video' ? 'Học video' : mode === 'review' ? 'ôn tập trắc nghiệm' : mode === 'exercise' ? 'làm bài tập' : 'mở tài liệu'}. Theo dõi trong Console.`);
    } catch (error) {
      setStatus(error.message, true);
      studyVideosButton.disabled = false;
      studyExercisesButton.disabled = false;
      studyReviewsButton.disabled = false;
      studyDocumentsButton.disabled = false;
      resetActionButtons();
    }
  }

  function updateStopButton(progress, checkProgress) {
    stopButton.disabled = !(progress && !progress.finished) && !(checkProgress && checkProgress.running);
    if (progress?.finished) {
      enableStudyButtons();
      resetActionButtons();
    } else if (progress && !progress.finished) {
      setActionButtonsBusy(progress.mode);
    }
  }

  function enableStudyButtons() {
    studyVideosButton.disabled = false;
    studyExercisesButton.disabled = false;
    studyReviewsButton.disabled = false;
    studyDocumentsButton.disabled = false;
  }

  function setActionButtonsBusy(activeAction) {
    actionButtons.forEach(button => {
      button.disabled = activeAction === 'check'
        ? true
        : button.id !== getActionButtonId(activeAction);
    });
    stopButton.disabled = false;
  }

  function getActionButtonId(action) {
    return {
      fetch: 'fetchLinks',
      check: 'checkCompletion',
      video: 'studyVideos',
      exercise: 'studyExercises',
      review: 'studyReviews',
      document: 'studyDocuments'
    }[action] || '';
  }

  function resetActionButtons() {
    actionButtons.forEach(button => {
      button.disabled = false;
    });
    stopButton.disabled = true;
  }

  function renderScan(scan, updateStatus = true) {
    const showCounts = Boolean(scan.completionChecked);
    totalCount.textContent = showCounts ? (scan.totalCount || 0) : '';
    videoCount.textContent = showCounts ? (scan.videoCount || 0) : '';
    videoCompletedCount.textContent = showCounts ? (scan.videoCompletedCount || 0) : '';
    videoIncompleteCount.textContent = showCounts ? (scan.videoIncompleteCount || 0) : '';
    problemCount.textContent = showCounts ? (scan.problemCount || 0) : '';
    problemCompletedCount.textContent = showCounts ? (scan.problemCompletedCount || 0) : '';
    problemIncompleteCount.textContent = showCounts ? (scan.problemIncompleteCount || 0) : '';
    reviewCount.textContent = showCounts ? (scan.reviewCount || 0) : '';
    reviewCompletedCount.textContent = showCounts ? (scan.reviewCompletedCount || 0) : '';
    reviewIncompleteCount.textContent = showCounts ? (scan.reviewIncompleteCount || 0) : '';
    const totalDocuments = scan.documentCount || (scan.documentCompletedCount || 0) + (scan.documentIncompleteCount || 0);
    documentCount.textContent = showCounts ? totalDocuments : '';
    documentCompletedCount.textContent = showCounts ? (scan.documentCompletedCount || 0) : '';
    documentIncompleteCount.textContent = showCounts ? (scan.documentIncompleteCount || 0) : '';
    renderIncompleteSelect(videoIncompleteSelect, scan, lesson => lesson.hasVideo && lesson.videoCompleted === false, 'Video');
    renderIncompleteSelect(problemIncompleteSelect, scan, lesson => lesson.hasProblem && !lesson.isReview && lesson.problemCompleted === false, 'Bài tập');
    renderIncompleteSelect(reviewIncompleteSelect, scan, lesson => lesson.isReview && lesson.problemCompleted === false, 'Ôn tập trắc nghiệm');
    renderIncompleteSelect(documentIncompleteSelect, scan, lesson => lesson.hasDocument && lesson.documentCompleted === false, 'Tài liệu');
    if (updateStatus && scan.scannedAt) {
      setStatus(`Lần quét gần nhất: ${new Date(scan.scannedAt).toLocaleString('vi-VN')}`);
    }
  }

  function renderIncompleteSelect(select, scan, predicate, type) {
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';

    if (!scan.completionChecked) {
      placeholder.textContent = 'Chưa chạy Check hoàn thành.';
      select.appendChild(placeholder);
      return;
    }

    const incompleteLessons = (scan.lessons || []).filter(predicate);

    if (!incompleteLessons.length) {
      placeholder.textContent = `Tất cả ${type.toLowerCase()} đã hoàn thành.`;
      select.appendChild(placeholder);
      return;
    }

    placeholder.textContent = `Chọn ${type.toLowerCase()} chưa hoàn thành...`;
    select.appendChild(placeholder);
    incompleteLessons.forEach(lesson => {
      const option = document.createElement('option');
      const url = lesson.url || lesson.generatedUrl || '';
      option.dataset.lessonType = type === 'Video' ? 'video' : type === 'Tài liệu' ? 'document' : 'problem';
      option.dataset.lessonTitle = lesson.title || '';
      option.value = url;
      option.textContent = `${lesson.title || 'Không có tên bài'} - ${type}`;
      select.appendChild(option);
    });
  }

  function renderStudyProgress(progress) {
    const label = progress.mode === 'video'
      ? 'video'
      : progress.mode === 'review'
        ? 'ôn tập trắc nghiệm'
        : progress.mode === 'exercise' ? 'bài tập' : 'tài liệu';
    if (progress.finished) {
      setStatus(`Đã xử lý ${progress.completed}/${progress.total} ${label}; lỗi: ${progress.failed}.`);
      return;
    }
    setStatus(`Đang xử lý ${progress.completed}/${progress.total} ${label}; đang chạy: ${progress.running}.`);
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.className = `status${isError ? ' error' : ''}`;
    const isChecking = /^Đang (check|lấy link và check)/i.test(message);
    loadingMessage.textContent = message;
    loadingOverlay.classList.toggle('visible', isChecking);
    loadingOverlay.setAttribute('aria-hidden', String(!isChecking));
  }

  function showNotice(title, message, isError = false) {
    noticeTitle.textContent = title;
    noticeMessage.textContent = message;
    noticeOverlay.classList.toggle('error', isError);
    noticeOverlay.classList.add('visible');
    noticeOverlay.setAttribute('aria-hidden', 'false');
    noticeOkButton.focus();
    return new Promise(resolve => {
      const close = () => {
        noticeOverlay.classList.remove('visible', 'error');
        noticeOverlay.setAttribute('aria-hidden', 'true');
        noticeOkButton.removeEventListener('click', close);
        resolve();
      };
      noticeOkButton.addEventListener('click', close);
    });
  }

});
