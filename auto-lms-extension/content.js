(function () {
  'use strict';

  let isWorking = false;
  let lastUrl = location.href;
  let iframeOpenedForUrl = false;

  const LOG_PREFIX = '[Auto LMS Engine]';

  function log(msg, color = '#00ff00') {
    console.log(`%c${LOG_PREFIX} ${msg}`, `color: ${color}; font-weight: bold; font-size: 13px;`);
  }

  /**
   * Kiểm tra trạng thái On/Off (Mặc định là TRUE nếu chưa set)
   */
  async function checkIsEnabled() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['autoLmsEnabled'], (result) => {
          resolve(result.autoLmsEnabled !== false);
        });
      } else {
        resolve(true);
      }
    });
  }

  /**
   * Lấy tốc độ phát video đã cấu hình ('default' = giữ nguyên tốc độ hiện tại)
   */
  async function getPlaybackSpeed() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['playbackSpeed'], (result) => {
          resolve(result.playbackSpeed || 'default');
        });
      } else {
        resolve('default');
      }
    });
  }

  /**
   * Cuộn trang mượt
   */
  async function autoScroll() {
    log('📜 Đang cuộn trang...', '#00bfff');
    return new Promise((resolve) => {
      let totalScroll = 0;
      const distance = 250;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalScroll += distance;

        if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 20 || totalScroll > 10000) {
          clearInterval(timer);
          window.scrollTo(0, document.body.scrollHeight);
          log('📜 Đã cuộn xong.', '#00bfff');
          setTimeout(resolve, 1000);
        }
      }, 200);
    });
  }

  /**
   * Tìm thẻ Video (Quét rộng các khung HTML5 / edX Player)
   */
  function findVideo() {
    return document.querySelector('video') || 
           document.querySelector('.video-player video') || 
           document.querySelector('div.video video') ||
           document.querySelector('.tc-wrapper video');
  }

  function isXBlockPage() {
    return window.top === window && location.pathname.startsWith('/xblock/');
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'Không nhận được phản hồi từ extension.' });
      });
    });
  }

  function getProblemQuestions(problem) {
    return Array.from(problem.querySelectorAll('.wrapper-problem-response')).map((wrapper, index) => ({
      question: index + 1,
      text: wrapper.previousElementSibling?.innerText?.trim() || '',
      options: Array.from(wrapper.querySelectorAll('label')).map((label, optionIndex) => ({
        letter: String.fromCharCode(97 + optionIndex),
        text: label.innerText.trim()
      }))
    }));
  }

  function normalizeAnswer(answer) {
    const normalized = String(answer || '')
      .trim()
      .toLowerCase();
    const letter = normalized.match(/^([a-d])(?:[.)\-:]|\s|$)/);
    return letter ? letter[1] : normalized;
  }

  function normalizeOptionText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/^[a-d][.)\-:]?\s*/, '');
  }

  async function handleXBlockProblem() {
    const problem = document.querySelector('.problem');
    if (!problem) {
      log('ℹ️ XBlock chưa có phần câu hỏi.', '#aaa');
      return false;
    }

    const firstChild = problem.children[0];
    const problemText = firstChild ? firstChild.innerText.trim() : '';
    const questions = getProblemQuestions(problem);
    if (!problemText || !questions.length) {
      log('⚠️ Không lấy được nội dung câu hỏi trong XBlock.', '#ff6347');
      return false;
    }

    log(`🧠 Đang gửi ${questions.length} câu hỏi cho AI...`, '#00ffff');
    const result = await sendMessage({ type: 'solveProblem', problemText, questions });
    if (!result.ok) {
      log(`⚠️ AI không trả lời: ${result.error}`, '#ff6347');
      return false;
    }

    log(`🤖 AI trả lời: ${JSON.stringify(result.answers)}`, '#00ffff');

    let selected = 0;
    result.answers.forEach((answer) => {
      const wrapper = problem.querySelectorAll('.wrapper-problem-response')[Number(answer.question) - 1];
      if (!wrapper) return;

      const wanted = normalizeAnswer(answer.answer);
      const labels = Array.from(wrapper.querySelectorAll('label'));
      const label = labels.find((item, index) => {
        const optionText = normalizeOptionText(item.innerText);
        return wanted === String.fromCharCode(97 + index) || wanted === optionText;
      });
      if (!label) return;

      const input = document.getElementById(label.htmlFor);
      if (input && !input.checked) {
        input.click();
        selected++;
      }
    });

    if (!selected) {
      log('⚠️ AI không chọn được đáp án nào.', '#ff6347');
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    const submit = problem.querySelector('button.submit:not([disabled])')
      || problem.querySelector('button.submit');
    if (!submit || submit.disabled) {
      log('⚠️ Nút Gửi chưa được bật sau khi chọn đáp án.', '#ff6347');
      return false;
    }

    submit.click();
    log(`✅ Đã chọn ${selected} đáp án và bấm Gửi.`, '#00ff00');
    return true;
  }

  /**
   * Mở nội dung bài thực hành trong tab riêng trước khi xử lý trang hiện tại.
   * Chỉ frame chính được phép thực hiện để tránh mở trùng tab do all_frames.
   */
  async function openPracticalExercise() {
    if (window.top !== window || iframeOpenedForUrl) return false;

    const findExerciseIframe = () => {
      const pageText = document.body
        ? `${document.body.innerText || ''} ${document.body.textContent || ''}`
        : '';
      if (!pageText.includes('Bài tập thực hành')) return null;
      return Array.from(document.querySelectorAll('iframe'))
        .find(frame => frame.src && frame.src !== 'about:blank');
    };

    let iframe = findExerciseIframe();
    const pageHasExerciseTitle = document.body
      && `${document.body.innerText || ''} ${document.body.textContent || ''}`
        .includes('Bài tập thực hành');

    if (!iframe && pageHasExerciseTitle) {
      iframe = await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const foundIframe = findExerciseIframe();
          if (foundIframe) {
            observer.disconnect();
            resolve(foundIframe);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, 8000);
      });
    }

    if (!iframe) {
      if (pageHasExerciseTitle) {
        log('ℹ️ Có tiêu đề bài thực hành nhưng chưa tìm thấy iframe.', '#aaa');
        return true;
      }

      log('ℹ️ Trang này không có "Bài tập thực hành". Tiếp tục xử lý video thông thường.', '#aaa');
      return false;
    }

    iframeOpenedForUrl = true;
    log('🧩 Đã tìm thấy iframe bài thực hành. Đang mở tab mới...', '#00ffff');

    const opened = await new Promise((resolve) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(false);
        return;
      }

      chrome.runtime.sendMessage({
        type: 'openIframeTab',
        url: iframe.src
      }, (response) => {
        if (chrome.runtime.lastError) {
          log(`⚠️ Không thể mở iframe: ${chrome.runtime.lastError.message}`, '#ff6347');
          resolve(false);
          return;
        }
        resolve(Boolean(response && response.opened));
      });
    });

    if (opened) {
      log('✅ Đã mở iframe bằng tab mới.', '#00ff00');
    }

    return true;
  }

  /**
   * Tìm nút Next
   */
  function findNextButton() {
    let btn = document.querySelector('a.next-button') || 
              document.querySelector('a.sequence-btn-next') || 
              document.querySelector('.next-btn') ||
              document.querySelector('button.next-button') ||
              document.querySelector('button.sequence-nav-button.button-next');

    if (btn) return btn;

    const elements = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
    return elements.find(el => {
      const text = (el.textContent || el.innerText || '').trim().toLowerCase();
      return (text.includes('tiếp theo') || text.includes('next')) && el.offsetParent !== null;
    });
  }

  /**
   * Xử lý Video: Đợi Player khởi tạo -> Play -> Tua -> Đợi LMS ghi nhận
   */
  async function handleVideo() {
    let video = findVideo();

    // Video có thể được render bất đồng bộ (sau khi trang tải xong).
    // Thay vì chờ mù theo thời gian, theo dõi DOM và phản ứng ngay khi video xuất hiện.
    if (!video) {
      video = await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const v = findVideo();
          if (v) {
            observer.disconnect();
            resolve(v);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, 8000);
      });
    }

    if (!video) {
      // Không có video ở tab/bài này -> không cần chờ xác nhận, cho phép Next ngay.
      log('ℹ️ Không tìm thấy video trên trang này.', '#aaa');
      return true;
    }

    log('🎥 ĐÃ THẤY VIDEO! Đang chờ nạp thời lượng...', '#00ff00');
    log(`🎥 Video state: readyState=${video.readyState}, duration=${video.duration}`, '#00bfff');

    const speedSetting = await getPlaybackSpeed();
    if (speedSetting !== 'default') {
      const rate = parseFloat(speedSetting);
      if (!isNaN(rate)) {
        video.playbackRate = rate;
        log(`⚡ Áp dụng tốc độ phát: ${rate}x`, '#00bfff');
      }
    }

    return new Promise((resolve) => {
      let durationAttempts = 0;
      const processSeek = async () => {
        if (video.duration && !isNaN(video.duration) && video.duration > 0) {
          log(`⏩ Thời lượng: ${video.duration.toFixed(1)}s. Đang tiến hành TUA HẾT...`, '#00ff00');

          const target = Math.max(0, video.duration - 0.5);
          let confirmed = false;

          // Thử tua và XÁC NHẬN currentTime đã thực sự cập nhật trước khi cho qua bài
          for (let i = 0; i < 10 && !confirmed; i++) {
            try {
              await video.play().catch(() => {});
              video.currentTime = target;
              await video.play().catch(() => {});
            } catch (e) {
              console.error(e);
            }

            await new Promise(r => setTimeout(r, 500));

            if (video.ended || video.currentTime >= target - 0.3) {
              confirmed = true;
            }
          }

          log(`⏩ Kiểm tra sau khi tua: currentTime=${video.currentTime}, target=${target}`, '#00bfff');

          if (confirmed) {
            log('✅ Đã xác nhận video đã tua xong.', '#00ff00');
            log('⏳ Chờ 4 giây để hệ thống LMS ghi nhận hoàn thành video...', '#ffa500');
            setTimeout(() => resolve(true), 4000);
          } else {
            log('⚠️ Không xác nhận được video đã tua xong, KHÔNG chuyển bài.', '#ff6347');
            resolve(false);
          }
        } else {
          durationAttempts++;
          if (durationAttempts >= 25) {
            log(`⚠️ Video không có duration hợp lệ sau ${durationAttempts * 800 / 1000}s.`, '#ff6347');
            resolve(false);
            return;
          }
          setTimeout(processSeek, 800);
        }
      };

      if (video.readyState >= 1) {
        processSeek();
      } else {
        video.addEventListener('loadedmetadata', processSeek, { once: true });
        setTimeout(() => resolve(false), 20000); // Timeout an toàn 20s
      }
    });
  }

  /**
   * Xử lý chuyển bài
   */
  async function handleNext() {
    log('🔍 Đang tìm nút "Tiếp theo"...', '#ffa500');

    let attempts = 0;
    while (attempts < 10) {
      const nextBtn = findNextButton();
      if (nextBtn) {
        log('🚀 ĐÃ BẤM NÚT "TIẾP THEO"!', '#00ff00');
        nextBtn.click();
        return true;
      }
      await new Promise(r => setTimeout(r, 800));
      attempts++;
    }

    log('⚠️ Không tìm thấy nút Next.', '#ff6347');
    return false;
  }

  /**
   * Luồng chính
   */
  async function runEngine() {
    if (isWorking) return;

    const enabled = await checkIsEnabled();
    if (!enabled) {
      log('⏸️ Extension đang TẮT trong Popup.', '#ff6347');
      return;
    }

    isWorking = true;
    log('▶️ Bắt đầu tiến trình tự động...', '#00ffff');

    if (isXBlockPage()) {
      await handleXBlockProblem();
      isWorking = false;
      return;
    }

    // 1. Kiểm tra bài thực hành trước khi cuộn hoặc xử lý video.
    const isPracticalExercisePage = await openPracticalExercise();
    log(
      isPracticalExercisePage
        ? '🔎 Đã xác nhận trang có "Bài tập thực hành".'
        : '🔎 Đã xác nhận đây không phải trang bài thực hành.',
      '#00bfff'
    );

    // 2. Cuộn trang
    await autoScroll();

    // 3. Xử lý Video. Trả về true nếu không có video HOẶC đã xác nhận tua xong;
    //    false nếu có video nhưng chưa xác nhận hoàn tất.
    const videoReady = await handleVideo();

    // 4. Chỉ bấm Next khi videoReady = true
    if (videoReady) {
      await handleNext();
    } else {
      log('⏸️ Bỏ qua bước Next vì chưa xác nhận video hoàn tất.', '#ff6347');
    }

    isWorking = false;
  }

  // Khởi chạy khi tải trang (Chờ 2.5s)
  setTimeout(runEngine, 2500);

  // Theo dõi đổi bài (SPA / Single Page App)
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      iframeOpenedForUrl = false;
      log('🔄 URL đã thay đổi! Chuẩn bị chạy bài mới...', '#ff00ff');
      isWorking = false;
      setTimeout(runEngine, 3000);
    }
  }, 1500);

})();