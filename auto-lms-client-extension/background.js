const lmsXblockBaseUrl = 'https://lms.hutech.edu.vn/xblock/';
const xblockQueryParams = '?exam_access=&preview=0&recheck_access=1&show_bookmark=0&show_title=0&view=student_view';
const studyJobs = new Map();
const activeScanControllers = new Set();
const activitySourceTabIds = new Set();
const scanControllersByTab = new Map();
const pendingLessonTabs = new Map();
let stopRequested = false;

function isReviewLesson(title) {
	return /ôn\s*tập/i.test(String(title || ''));
}

function extractDocumentTabs(htmlText, lesson) {
	const tabs = [];
	const searchableHtml = htmlText
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, '&');
	const buttonPattern = /<button\b[^>]*\bseq_other\b[^>]*>/gi;
	for (const match of searchableHtml.matchAll(buttonPattern)) {
		const markup = match[0];
		const classMatch = markup.match(/\bclass=["']([^"']*)["']/i);
		const idMatch = markup.match(/data-id=["']([^"']+)["']/i);
		const titleMatch = markup.match(/data-page-title=["']([^"']+)["']/i);
		const title = (titleMatch?.[1] || '').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
		if (!classMatch || !/(^|\s)seq_other(?:\s|$)/i.test(classMatch[1])) continue;
		if (!titleMatch || !/tài liệu/i.test(title)) continue;
		const blockId = idMatch?.[1]?.replace(/&amp;/g, '&');
		const documentUrl = blockId && /^block-v1:[^\s]+$/i.test(blockId)
			? `${lmsXblockBaseUrl}${blockId}${xblockQueryParams}`
			: lesson.generatedUrl || lesson.url;
		tabs.push({
			...lesson,
			title,
			generatedUrl: documentUrl,
			url: documentUrl,
			hasVideo: false,
			hasProblem: false,
			hasDocument: true,
			isReview: false,
			videoCompleted: false,
			problemCompleted: false,
			documentCompleted: null
		});
	}
	return tabs;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status !== 'complete') return;
	const pendingLesson = pendingLessonTabs.get(tabId);
	if (pendingLesson) {
		pendingLessonTabs.delete(tabId);
		chrome.tabs.sendMessage(tabId, pendingLesson).catch(error => {
		});
	}

	for (const [jobId, job] of studyJobs) {
		const task = job.running.get(tabId);
		if (!task || task.processing) continue;
		startStudyTask(jobId, tabId, task);
		break;
	}
});

chrome.webNavigation.onCommitted.addListener(details => {
	if (details.frameId !== 0 || details.transitionType !== 'reload') return;
	scanControllersByTab.get(details.tabId)?.abort();
	scanControllersByTab.delete(details.tabId);
	chrome.storage.local.set({ scanToggleEnabled: false });
});

function startStudyTask(jobId, tabId, task) {
	if (task.processing) return;
	task.processing = true;
	processStudyTab(jobId, tabId, task.lesson);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === 'startStudy') {
		stopRequested = false;
		startStudy(message.mode, message.lessons, sender.tab?.windowId, message.sourceTabId, message.answerSource, message.answerBank)
			.then(jobId => sendResponse({ ok: true, jobId }))
			.catch(error => sendResponse({ ok: false, error: error.message }));
		return true;
	}

	if (message?.type === 'openLessonTab') {
		chrome.tabs.create({ url: message.url, active: true, windowId: sender.tab?.windowId }, tab => {
			if (chrome.runtime.lastError || !tab?.id) {
				sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'Không mở được tab bài học.' });
				return;
			}
			pendingLessonTabs.set(tab.id, {
				type: 'openLessonTab',
				lessonType: message.lessonType,
				generatedUrl: message.url,
				lessonTitle: message.lessonTitle || ''
			});
			sendResponse({ ok: true, tabId: tab.id });
		});
		return true;
	}

	if (message?.type === 'stopAllActivity') {
		stopAllActivity();
		sendResponse({ ok: true });
		return false;
	}

	if (message?.type === 'checkCompletions') {
		checkCompletions(message.lessons, message.sourceTabId)
			.then(result => sendResponse({ ok: true, result }))
			.catch(error => sendResponse({ ok: false, error: error.message }));
		return true;
	}

	if (message?.type === 'startScanAndCheck') {
		startScanAndCheck(message.sourceTabId)
			.then(result => sendResponse({ ok: true, result }))
			.catch(error => sendResponse({ ok: false, error: error.message }));
		return true;
	}

	if (message?.type === 'solveProblem') {
		solveProblemWithAi(message)
			.then(sendResponse)
			.catch(error => sendResponse({ ok: false, error: error.message }));
		return true;
	}

	if (message?.type === 'exportProblemAnswers') {
		exportProblemAnswers(message.lessons)
			.then(result => sendResponse({ ok: true, answers: result }))
			.catch(error => sendResponse({ ok: false, error: error.message }));
		return true;
	}

	if (!message || message.type !== 'fetchLessonDetails') return false;

	fetchLessonDetails(message.lessons, sender.tab?.id)
		.then(result => sendResponse({ ok: true, ...result }))
		.catch(error => {
			sendResponse({ ok: false, error: error.message });
		});

	return true;
});

async function startScanAndCheck(sourceTabId) {
	if (!Number.isInteger(sourceTabId)) throw new Error('Không tìm thấy tab LMS hiện tại.');
	await chrome.storage.local.set({ scanCheckProgress: { running: true, phase: 'fetch' } });
	try {
		const sourceTab = await chrome.tabs.get(sourceTabId);
		const homeUrl = getCourseHomeUrl(sourceTab.url);
		if (!homeUrl) throw new Error('URL hiện tại không chứa mã khóa học hợp lệ.');
		if (sourceTab.url !== homeUrl) {
			await navigateTabAndWait(sourceTabId, homeUrl);
		}
		const response = await chrome.tabs.sendMessage(sourceTabId, { type: 'fetchLessons' });
		if (!response?.ok) throw new Error(response?.error || 'Không lấy được dữ liệu.');

		const initialScan = response.result;
		const scanKey = `lessonScan:${initialScan.sourceUrl}`;
		await chrome.storage.local.set({ [scanKey]: initialScan, scanCheckProgress: { running: true, phase: 'check' } });
		const completionResult = await checkCompletions(initialScan.lessons, sourceTabId);
		const finalScan = {
			...initialScan,
			...completionResult,
			scannedAt: new Date().toISOString()
		};
		await chrome.storage.local.set({ [scanKey]: finalScan });
		return finalScan;
	} finally {
		await chrome.storage.local.set({
			scanCheckProgress: { running: false },
			checkProgress: { running: false }
		});
	}
}

function getCourseHomeUrl(tabUrl) {
	try {
		const url = new URL(tabUrl || '');
		const match = decodeURIComponent(url.pathname).match(/(course-v1:[^/]+)/);
		return match
			? `https://apps.lms.hutech.edu.vn/learning/course/${match[1]}/home`
			: '';
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
		function onUpdated(updatedTabId, changeInfo, updatedTab) {
			if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
			clearTimeout(timeout);
			chrome.tabs.onUpdated.removeListener(onUpdated);
			resolve(updatedTab);
		}
		chrome.tabs.onUpdated.addListener(onUpdated);
		chrome.tabs.update(tabId, { url }).catch(error => {
			clearTimeout(timeout);
			chrome.tabs.onUpdated.removeListener(onUpdated);
			reject(error);
		});
	});
}

async function startStudy(mode, lessons, windowId, sourceTabId, answerSource = 'ai', answerBank = []) {
	if (!['video', 'exercise', 'review', 'document'].includes(mode)) throw new Error('Loại tiến trình không hợp lệ.');
	if (!Array.isArray(lessons) || !lessons.length) throw new Error('Không có bài để xử lý.');

	const backgroundMode = mode === 'exercise' || mode === 'review';
	const concurrency = backgroundMode ? 5 : 1;
	const jobId = `${mode}-${Date.now()}`;
	const job = {
		mode,
		backgroundMode,
		queue: lessons.filter(lesson => mode === 'video'
			? lesson.hasVideo && lesson.videoCompleted !== true
			: mode === 'review'
				? lesson.isReview && lesson.problemCompleted !== true
				: mode === 'exercise'
					? lesson.hasProblem && !lesson.isReview && lesson.problemCompleted !== true
					: lesson.hasDocument && lesson.documentCompleted !== true),
		running: new Map(),
		opening: 0,
		completed: 0,
		failed: [],
		total: lessons.filter(lesson => mode === 'video'
			? lesson.hasVideo && lesson.videoCompleted !== true
			: mode === 'review'
				? lesson.isReview && lesson.problemCompleted !== true
				: mode === 'exercise'
					? lesson.hasProblem && !lesson.isReview && lesson.problemCompleted !== true
					: lesson.hasDocument && lesson.documentCompleted !== true).length,
		concurrency,
		windowId,
		sourceTabId,
		answerSource,
		answerBank: Array.isArray(answerBank) ? answerBank : []
	};

	studyJobs.set(jobId, job);
	if (Number.isInteger(sourceTabId)) activitySourceTabIds.add(sourceTabId);
	dispatchStudyTabs(jobId);
	return jobId;
}

function dispatchStudyTabs(jobId) {
	const job = studyJobs.get(jobId);
	if (!job || job.stopped || stopRequested) return;

	while (job.queue.length && job.running.size + job.opening < job.concurrency) {
		const lesson = job.queue.shift();
		job.opening++;
		chrome.tabs.create({
			url: lesson.url || lesson.generatedUrl,
			active: !job.backgroundMode,
			windowId: job.windowId
		}, tab => {
			job.opening--;
			if (job.stopped || stopRequested || !studyJobs.has(jobId)) {
				if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
				return;
			}
			if (chrome.runtime.lastError || !tab?.id) {
				const error = chrome.runtime.lastError?.message || 'Không mở được tab.';
				job.failed.push({ lesson, error });
				finishStudyTask(jobId, null, false);
				return;
			}

			job.running.set(tab.id, { lesson, processing: false });
			if (tab.status === 'complete') startStudyTask(jobId, tab.id, job.running.get(tab.id));
		});
	}

	logStudyProgress(jobId);
}

async function processStudyTab(jobId, tabId, lesson) {
	const job = studyJobs.get(jobId);
	if (!job) return;

	if (!job.backgroundMode) await focusVideoTab(tabId, job.windowId);
	let response;
	let lastError;
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			response = await chrome.tabs.sendMessage(tabId, {
				type: 'processLesson',
				mode: job.mode,
				generatedUrl: lesson.generatedUrl,
				lessonTitle: lesson.title,
				answerSource: job.answerSource,
				answerBank: job.answerBank
			});
			break;
		} catch (error) {
			lastError = error;
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}

	const success = Boolean(response?.ok && response.completed);
	if (!success) {
		const error = response?.error || lastError?.message || 'Tab không trả về kết quả.';
		job.failed.push({ lesson, error });
	} else {
		job.completed++;
		if (response?.questions && response?.answers) {
			lesson.questions = response.questions;
			lesson.answers = response.answers;
		}
		await markLessonCompleted(lesson, job.mode);
	}

	finishStudyTask(jobId, tabId, success);
}

async function markLessonCompleted(lesson, mode) {
	if (mode !== 'video' && mode !== 'exercise' && mode !== 'review' && mode !== 'document') return;
	const source = lesson.originalUrl || lesson.coursewareUrl || '';
	const match = String(source).match(/^https:\/\/apps\.lms\.hutech\.edu\.vn\/learning\/course\/(course-v1:[^/]+)(?:\/|$)/);
	if (!match) return;

	const scanKey = `lessonScan:https://apps.lms.hutech.edu.vn/learning/course/${match[1]}/home`;
	const saved = await chrome.storage.local.get([scanKey]);
	const scan = saved[scanKey];
	if (!scan?.lessons) return;

	const targetUrl = lesson.generatedUrl || lesson.url;
	const updatedLessons = scan.lessons.map(item => {
		const sameLesson = item.generatedUrl === targetUrl || item.url === targetUrl;
		if (!sameLesson) return item;
		return {
			...item,
			videoCompleted: mode === 'video' ? true : item.videoCompleted,
				problemCompleted: mode === 'exercise' || mode === 'review' ? true : item.problemCompleted,
				documentCompleted: mode === 'document' ? true : item.documentCompleted,
			questions: lesson.questions || item.questions,
			answers: lesson.answers || item.answers
		};
	});

	const updatedScan = {
		...scan,
		lessons: updatedLessons,
		videoCompletedCount: updatedLessons.filter(item => item.hasVideo && item.videoCompleted).length,
		videoIncompleteCount: updatedLessons.filter(item => item.hasVideo && item.videoCompleted === false).length,
		problemCompletedCount: updatedLessons.filter(item => item.hasProblem && !item.isReview && item.problemCompleted).length,
		problemIncompleteCount: updatedLessons.filter(item => item.hasProblem && !item.isReview && item.problemCompleted === false).length,
		reviewCompletedCount: updatedLessons.filter(item => item.isReview && item.problemCompleted).length,
		reviewIncompleteCount: updatedLessons.filter(item => item.isReview && item.problemCompleted === false).length,
		documentCompletedCount: updatedLessons.filter(item => item.hasDocument && item.documentCompleted).length,
		documentIncompleteCount: updatedLessons.filter(item => item.hasDocument && item.documentCompleted === false).length,
		completionChecked: true
	};

	await chrome.storage.local.set({ [scanKey]: updatedScan });
}

async function focusVideoTab(tabId, windowId) {
	try {
		await chrome.tabs.update(tabId, { active: true });
		if (Number.isInteger(windowId)) await chrome.windows.update(windowId, { focused: true });
	} catch (error) {
	}
}

function finishStudyTask(jobId, tabId) {
	const job = studyJobs.get(jobId);
	if (!job) return;
	if (tabId !== null) {
		job.running.delete(tabId);
		chrome.tabs.remove(tabId).catch(() => {});
	}

	if (!job.queue.length && !job.running.size && !job.opening) {
		logStudyProgress(jobId, true);
		if (!job.backgroundMode && Number.isInteger(job.sourceTabId)) activateSourceTab(job.sourceTabId, job.windowId);
		studyJobs.delete(jobId);
		if (Number.isInteger(job.sourceTabId)) activitySourceTabIds.delete(job.sourceTabId);
		return;
	}

	dispatchStudyTabs(jobId);
}

async function activateSourceTab(tabId, windowId) {
	try {
		await chrome.tabs.update(tabId, { active: true });
		if (Number.isInteger(windowId)) await chrome.windows.update(windowId, { focused: true });
	} catch (error) {
	}
}

function logStudyProgress(jobId, finished = false) {
	const job = studyJobs.get(jobId);
	if (!job) return;
	const progress = {
		jobId,
		mode: job.mode,
		completed: job.completed,
		failed: job.failed.length,
		failedLessons: job.failed.slice(-10).map(item => ({ title: item.lesson.title, error: item.error })),
		waiting: job.queue.length,
		running: job.running.size,
		opening: job.opening,
		total: job.total,
		finished
	};
	chrome.storage.local.set({ studyProgress: { ...progress, updatedAt: new Date().toISOString() } });
}

async function fetchLessonDetails(lessons, sourceTabId) {
	stopRequested = false;
	if (Number.isInteger(sourceTabId)) activitySourceTabIds.add(sourceTabId);
	const controller = new AbortController();
	if (Number.isInteger(sourceTabId)) scanControllersByTab.set(sourceTabId, controller);
	activeScanControllers.add(controller);
	const concurrency = 5;
	const results = [];
	let nextIndex = 0;


	async function worker() {
		while (nextIndex < lessons.length) {
			if (stopRequested || controller.signal.aborted) return;
			const lesson = normalizeLessonUrl(lessons[nextIndex++]);

			try {
				const response = await fetch(lesson.generatedUrl, { credentials: 'include', signal: controller.signal });
				if (!response.ok) {
					continue;
				}

				const htmlText = await response.text();
				const hasVideo = /xmodule_VideoBlock|type@video|<video[\s>]|class=["'][^"']*video-player/i.test(htmlText)
					|| htmlText.includes('Video nội dung bài học')
					|| htmlText.includes('Video giới thiệu bài học');
				const hasProblem = /xmodule_ProblemBlock|type@problem|problems-wrapper|wrapper-problem-response/i.test(htmlText)
					|| htmlText.includes('Câu hỏi trắc nghiệm');
				const documentTabs = extractDocumentTabs(htmlText, lesson);
				const sequentialUrl = buildSequentialCheckUrl(lesson.originalUrl || lesson.coursewareUrl);
				if (sequentialUrl && sequentialUrl !== lesson.generatedUrl) {
					try {
						const sequentialResponse = await fetch(sequentialUrl, {
							credentials: 'include',
							signal: controller.signal
						});
					if (sequentialResponse.ok) {
							const sequentialHtml = await sequentialResponse.text();
							documentTabs.push(...extractDocumentTabs(sequentialHtml, {
								...lesson,
								originalUrl: lesson.originalUrl,
								coursewareUrl: sequentialUrl
							}));
						}
					} catch (error) {
					}
				}
				if (!hasVideo && !hasProblem && !documentTabs.length) continue;

				if (hasVideo || hasProblem) {
					results.push({
						...lesson,
						url: lesson.generatedUrl,
						coursewareUrl: lesson.originalUrl,
						hasVideo,
						hasProblem,
					hasDocument: false,
						isReview: hasProblem && isReviewLesson(lesson.title),
						videoCompleted: null,
						problemCompleted: null,
						documentCompleted: null
					});
				}
				results.push(...documentTabs);
			} catch (error) {
			}
		}
	}

	try {
		await Promise.all(Array.from({ length: Math.min(concurrency, lessons.length) }, worker));
	} finally {
		if (Number.isInteger(sourceTabId) && scanControllersByTab.get(sourceTabId) === controller) {
			scanControllersByTab.delete(sourceTabId);
		}
		activeScanControllers.delete(controller);
		if (Number.isInteger(sourceTabId)) activitySourceTabIds.delete(sourceTabId);
	}

	const uniqueResults = Array.from(new Map(results.map(lesson => [lesson.generatedUrl, lesson])).values());
	return {
		lessons: uniqueResults,
		videoCount: uniqueResults.filter(lesson => lesson.hasVideo).length,
		problemCount: uniqueResults.filter(lesson => lesson.hasProblem && !lesson.isReview).length,
		reviewCount: uniqueResults.filter(lesson => lesson.isReview).length,
		videoCompletedCount: uniqueResults.filter(lesson => lesson.hasVideo && lesson.videoCompleted).length,
		videoIncompleteCount: uniqueResults.filter(lesson => lesson.hasVideo && !lesson.videoCompleted).length,
		problemCompletedCount: uniqueResults.filter(lesson => lesson.hasProblem && !lesson.isReview && lesson.problemCompleted).length,
		problemIncompleteCount: uniqueResults.filter(lesson => lesson.hasProblem && !lesson.isReview && !lesson.problemCompleted).length,
		reviewCompletedCount: uniqueResults.filter(lesson => lesson.isReview && lesson.problemCompleted).length,
		reviewIncompleteCount: uniqueResults.filter(lesson => lesson.isReview && !lesson.problemCompleted).length,
		documentCount: uniqueResults.filter(lesson => lesson.hasDocument).length,
		documentCompletedCount: uniqueResults.filter(lesson => lesson.hasDocument && lesson.documentCompleted).length,
		documentIncompleteCount: uniqueResults.filter(lesson => lesson.hasDocument && !lesson.documentCompleted).length,
		completionChecked: false
	};
}

async function checkCompletions(lessons, sourceTabId) {
	stopRequested = false;
	const normalizedLessons = lessons.map(lesson => ({
		...normalizeLessonUrl(lesson),
		isReview: lesson.isReview ?? (lesson.hasProblem && isReviewLesson(lesson.title))
	}));
	if (Number.isInteger(sourceTabId)) activitySourceTabIds.add(sourceTabId);
	const controller = new AbortController();
	activeScanControllers.add(controller);
	await chrome.storage.local.set({ checkProgress: { running: true, total: normalizedLessons.length } });
	const concurrency = 5;
	const results = [];
	let nextIndex = 0;
	debugToRootTab(sourceTabId, 'Bắt đầu check hoàn thành', {
		total: normalizedLessons.length,
		concurrency
	});

	async function worker() {
		while (nextIndex < normalizedLessons.length) {
			if (stopRequested || controller.signal.aborted) return;
			const lessonIndex = nextIndex++;
			const lesson = normalizedLessons[lessonIndex];
			const completion = await getLessonCompletion(lesson, controller.signal, sourceTabId);
			results[lessonIndex] = { ...lesson, ...completion };
		}
	}

	try {
		await Promise.all(Array.from({ length: Math.min(concurrency, normalizedLessons.length) }, worker));
		const mergedLessons = normalizedLessons.map((lesson, index) => results[index] || lesson);
		const completionChecked = !controller.signal.aborted && !stopRequested;
		const completionResult = {
			lessons: mergedLessons,
			documentCount: mergedLessons.filter(lesson => lesson.hasDocument).length,
			videoCompletedCount: mergedLessons.filter(lesson => lesson.hasVideo && lesson.videoCompleted).length,
			videoIncompleteCount: mergedLessons.filter(lesson => lesson.hasVideo && lesson.videoCompleted === false).length,
			problemCompletedCount: mergedLessons.filter(lesson => lesson.hasProblem && !lesson.isReview && lesson.problemCompleted).length,
			problemIncompleteCount: mergedLessons.filter(lesson => lesson.hasProblem && !lesson.isReview && lesson.problemCompleted === false).length,
			reviewCompletedCount: mergedLessons.filter(lesson => lesson.isReview && lesson.problemCompleted).length,
			reviewIncompleteCount: mergedLessons.filter(lesson => lesson.isReview && lesson.problemCompleted === false).length,
			documentCompletedCount: mergedLessons.filter(lesson => lesson.hasDocument && lesson.documentCompleted).length,
			documentIncompleteCount: mergedLessons.filter(lesson => lesson.hasDocument && lesson.documentCompleted === false).length,
			completionChecked
		};
		debugToRootTab(sourceTabId, 'Kết thúc check hoàn thành', {
			completionChecked,
			checked: results.length,
			total: normalizedLessons.length
		});
		return completionResult;
	} finally {
		activeScanControllers.delete(controller);
		if (Number.isInteger(sourceTabId)) activitySourceTabIds.delete(sourceTabId);
		await chrome.storage.local.set({ checkProgress: { running: false, total: normalizedLessons.length } });
	}
}

function debugToRootTab(tabId, label, data) {
	if (!Number.isInteger(tabId)) return;
	chrome.tabs.sendMessage(tabId, { type: 'debugLog', label, data }).catch(() => {});
}

async function getLessonCompletion(lesson, signal, sourceTabId) {
	const checkUrl = buildSequentialCheckUrl(lesson.originalUrl || lesson.coursewareUrl)
		|| lesson.generatedUrl;
	const result = await readCompletionFromXblockTab(checkUrl, lesson, signal);
	const videoCompleted = lesson.hasVideo
		? Boolean(result.videoCompleted ?? (lesson.hasProblem ? false : result.completed))
		: false;
	const problemCompleted = lesson.hasProblem
		? Boolean(result.problemCompleted ?? (lesson.hasVideo ? false : result.completed))
		: false;
	const documentCompleted = lesson.hasDocument ? Boolean(result.documentCompleted ?? result.completed) : false;
	debugToRootTab(sourceTabId, 'Kết quả check bài', {
		title: lesson.title,
		checkUrl,
		lessonTitle: lesson.title,
		videoCompleted,
		problemCompleted,
		documentCompleted,
		diagnostics: result.diagnostics
	});

	return {
		videoCompleted,
		problemCompleted,
		documentCompleted
	};
}

function extractVerticalBlockId(lesson) {
	const sources = [lesson.generatedUrl, lesson.url, lesson.originalUrl, lesson.coursewareUrl];
	for (const source of sources) {
		if (!source) continue;
		const match = String(source).match(/block-v1:[^/\s?]+\+type@vertical\+block@[^/\s?]+/);
		if (match) return match[0];
	}
	return '';
}

function normalizeLessonUrl(lesson) {
	const source = lesson.hasDocument
		? (lesson.generatedUrl || lesson.url || lesson.originalUrl || lesson.coursewareUrl || '')
		: (lesson.originalUrl || lesson.coursewareUrl || lesson.generatedUrl || lesson.url || '');
	const match = String(source).match(/block-v1:[^/\s?]+\+type@vertical\+block@[^/\s?]+/);
	if (!match) return lesson;
	const generatedUrl = `${lmsXblockBaseUrl}${match[0]}${xblockQueryParams}`;
	return {
		...lesson,
		generatedUrl,
		url: generatedUrl
	};
}

async function readCompletionFromXblockTab(checkUrl, lesson, signal) {
	if (!checkUrl) {
		return { found: false, completed: false, diagnostics: { error: 'empty-check-url' } };
	}
	let tabId;
	let lastDiagnostics = null;
	try {
		if (signal?.aborted) return { found: false, completed: false };
		const tab = await chrome.tabs.create({ url: checkUrl, active: false });
		if (!tab?.id) throw new Error('Không mở được tab XBlock để check.');
		tabId = tab.id;
		await waitForTabComplete(tabId, signal);

		for (let attempt = 1; attempt <= 8; attempt++) {
			if (signal?.aborted) return { found: false, completed: false };
			try {
				const response = await chrome.tabs.sendMessage(tabId, {
					type: 'readLessonCompletion',
					lessonType: lesson.hasDocument && !lesson.hasVideo && !lesson.hasProblem
						? 'document'
						: lesson.hasVideo && lesson.hasProblem ? 'all' : (lesson.hasProblem ? 'problem' : 'video'),
					lessonTitle: lesson.title,
					lessonBlockId: extractVerticalBlockId(lesson)
				});
				lastDiagnostics = response?.diagnostics || null;
				if (response?.ok && response.found) return response;
			} catch (error) {
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	} catch (error) {
	} finally {
		if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
	}
	return { found: false, completed: false, diagnostics: lastDiagnostics };
}

async function exportProblemAnswers(lessons) {
	const quizLessons = (lessons || []).filter(lesson => lesson.hasProblem && lesson.problemCompleted === true);
	const answers = [];
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < quizLessons.length) {
			const lesson = quizLessons[nextIndex++];
			const checkUrl = buildSequentialCheckUrl(lesson.originalUrl || lesson.coursewareUrl);
			if (!checkUrl) continue;
			let tabId;
			try {
				const tab = await chrome.tabs.create({ url: checkUrl, active: false });
				if (!tab?.id) continue;
				tabId = tab.id;
				await waitForTabComplete(tabId);
				let response;
				for (let attempt = 1; attempt <= 10; attempt++) {
					try {
						response = await chrome.tabs.sendMessage(tabId, {
							type: 'readProblemData',
							lessonBlockId: extractVerticalBlockId(lesson)
						});
						if (response?.ok) break;
					} catch (error) {
						if (attempt === 10) throw error;
					}
					await new Promise(resolve => setTimeout(resolve, 400));
				}
				if (response?.ok) answers.push({
					title: lesson.title,
					url: lesson.generatedUrl || lesson.url,
					questions: response.questions,
					answers: response.answers
				});
			} catch (error) {
			} finally {
				if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(5, quizLessons.length) }, worker));
	return answers;
}

function waitForTabComplete(tabId, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error('Đã dừng hoạt động.'));
			return;
		}
		const timeout = setTimeout(() => {
			chrome.tabs.onUpdated.removeListener(onUpdated);
			reject(new Error('Tab XBlock tải quá lâu.'));
		}, 30000);
		const onAbort = () => {
			clearTimeout(timeout);
			chrome.tabs.onUpdated.removeListener(onUpdated);
			reject(new Error('Đã dừng hoạt động.'));
		};
		function onUpdated(updatedTabId, changeInfo) {
			if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
			clearTimeout(timeout);
			chrome.tabs.onUpdated.removeListener(onUpdated);
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}
		signal?.addEventListener('abort', onAbort, { once: true });
		chrome.tabs.onUpdated.addListener(onUpdated);
		chrome.tabs.get(tabId, tab => {
			if (chrome.runtime.lastError || tab?.status !== 'complete') return;
			clearTimeout(timeout);
			chrome.tabs.onUpdated.removeListener(onUpdated);
			signal?.removeEventListener('abort', onAbort);
			resolve();
		});
	});
}

function stopAllActivity() {
	stopRequested = true;
	activeScanControllers.forEach(controller => controller.abort());
	activeScanControllers.clear();

	for (const [jobId, job] of studyJobs) {
		job.stopped = true;
		job.queue = [];
		for (const tabId of job.running.keys()) chrome.tabs.remove(tabId).catch(() => {});
		job.running.clear();
		job.opening = 0;
		logStudyProgress(jobId, true);
		studyJobs.delete(jobId);
	}
	activitySourceTabIds.clear();

}

function buildSequentialCheckUrl(coursewareUrl) {
	if (!coursewareUrl) return '';
	try {
		const pathParts = new URL(coursewareUrl).pathname.split('/');
		const sequentialBlockId = pathParts.find(part =>
			part.startsWith('block-v1:') && part.includes('type@sequential')
		);
		return sequentialBlockId
			? `${lmsXblockBaseUrl}${sequentialBlockId}${xblockQueryParams}`
			: '';
	} catch (error) {
		return '';
	}
}
function extractBlockId(generatedUrl) {
	try {
		return decodeURIComponent(new URL(generatedUrl).pathname.split('/xblock/')[1] || '');
	} catch (error) {
		return '';
	}
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSequenceButtonMarkup(htmlText, blockId) {
	if (!blockId) return '';
	const exactAttribute = `data-id="${blockId}"`;
	const alternateAttribute = `data-id='${blockId}'`;
	const attributeIndex = htmlText.indexOf(exactAttribute) >= 0
		? htmlText.indexOf(exactAttribute)
		: htmlText.indexOf(alternateAttribute);
	if (attributeIndex < 0) return '';

	const buttonStart = htmlText.lastIndexOf('<button', attributeIndex);
	const buttonEnd = htmlText.indexOf('</button>', attributeIndex);
	if (buttonStart < 0 || buttonEnd < 0) return '';
	return htmlText.slice(buttonStart, buttonEnd + '</button>'.length);
}

function isCompletedButtonMarkup(buttonMarkup) {
	if (!buttonMarkup) return false;
	const hasCheckCircle = /check-circle/i.test(buttonMarkup);
	const hasGreenCheck = /style=["'][^"']*color\s*:\s*green/i.test(buttonMarkup);
	return /\bvisited\b/i.test(buttonMarkup) || (hasCheckCircle && hasGreenCheck);
}

async function solveProblemWithAi(message) {
	const settings = await chrome.storage.sync.get(['aiModel', 'aiEndpoint', 'aiApiKey']);
	if (!settings.aiApiKey) throw new Error('Chưa cấu hình API key trong Popup.');

	const response = await fetch(settings.aiEndpoint || 'http://127.0.0.1:5000/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${settings.aiApiKey}`
		},
		body: JSON.stringify({
			model: settings.aiModel || 'auto',
			messages: [
				{ role: 'system', content: 'Bạn là trợ lý trả lời câu hỏi trắc nghiệm và điền khuyết. Chỉ trả về JSON hợp lệ.' },
				{ role: 'user', content: buildProblemPrompt(message.problemText, message.questions) }
			]
		})
	});

	if (!response.ok) throw new Error(`AI API trả về HTTP ${response.status}.`);
	const data = await response.json();
	const text = data.choices?.[0]?.message?.content;
	if (!text) throw new Error('AI không trả về nội dung đáp án.');
	return { ok: true, answers: parseAnswers(text) };
}

function buildProblemPrompt(problemText, questions) {
	return [
		'Đọc bài tập/trắc nghiệm dưới đây và trả lời từng câu.',
		'Trả về duy nhất JSON theo định dạng: {"answers":[{"question":1,"answer":"c"}]}.' ,
		'question là số thứ tự câu hỏi. Mỗi câu hỏi có trường "type": "radio" (chỉ 1 đáp án đúng), "checkbox" (nhiều đáp án đúng, thường ghi "(Choose two.)"/"(Choose three.)" trong đề bài), hoặc "text" (câu điền khuyết — không có "options").',
		'Với câu type "radio"/"checkbox", answer là chữ cái của đáp án đúng (a, b, c, d, e, ... tuỳ số lượng lựa chọn trong "options" của câu đó).',
		'Với câu type "checkbox", answer phải liệt kê ĐẦY ĐỦ các chữ cái đúng, cách nhau bởi dấu phẩy, ví dụ "b,d" — đúng bằng số lượng được yêu cầu chọn.',
		'Với câu type "text", answer là đoạn văn bản ngắn cần điền vào chỗ trống đó (không dùng chữ cái), viết đúng chính tả như trong bài.',
		'',
		JSON.stringify({ questions, problemText })
	].join('\n');
}

function parseAnswers(text) {
	const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
	const jsonText = extractFirstJsonObject(cleaned);
	if (!jsonText) throw new Error('AI không trả về JSON đáp án hợp lệ.');
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
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') inString = true;
		else if (character === '{') depth++;
		else if (character === '}' && --depth === 0) return text.slice(start, index + 1);
	}
	return null;
}
