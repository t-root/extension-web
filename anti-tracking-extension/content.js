(function() {
    'use strict';

    if (window.__ultimateAntiTrackingShield) return;
    window.__ultimateAntiTrackingShield = true;

    const SHIELD_REAPPLY_MS = 10;
    const STYLE_ID = 'ultimate-shield-copy-style';
    const BLOCKED_TRACKING_EVENTS = new Set([
        'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange',
        'blur', 'focus', 'focusin', 'focusout',
        'mouseleave', 'mouseout', 'mouseenter',
        'pagehide', 'pageshow', 'freeze', 'resume',
        'beforeunload', 'unload', 'resize', 'orientationchange'
    ]);
    const UNBLOCK_CLIPBOARD_EVENTS = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'];
    const INLINE_BLOCK_PROPS = ['oncopy', 'oncut', 'onpaste', 'onselectstart', 'oncontextmenu', 'ondragstart'];
    const SHORTCUT_KEYS = new Set(['c', 'v', 'x', 'a', 'u', 's', 'p']);
    const DEVTOOLS_KEYS = new Set(['f12']);

    let shieldObserver = null;
    let unlockScheduled = false;
    let styleInjected = false;

    const killEvent = function(e) {
        e.stopImmediatePropagation();
        e.stopPropagation();
    };

    const unblockClipboardEvent = function(e) {
        e.stopImmediatePropagation();
        e.stopPropagation();
    };

    const allowDevToolsEvent = function(e) {
        const key = e.key && e.key.toLowerCase();
        if (DEVTOOLS_KEYS.has(key) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'i' || key === 'j'))) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            return true;
        }
        return false;
    };

    function applyUltimateShield() {
        try {
            const forceVisible = { value: 'visible', writable: false, configurable: true };
            const forceFalse = { value: false, writable: false, configurable: true };

            Object.defineProperties(document, {
                hidden: forceFalse,
                visibilityState: forceVisible,
                webkitVisibilityState: forceVisible,
                mozVisibilityState: forceVisible,
                wasDiscarded: forceFalse
            });

            if (!window.__shieldSavedTitle) {
                window.__shieldSavedTitle = document.title || 'Trang web';
            }
            Object.defineProperty(document, 'title', {
                get: function() { return window.__shieldSavedTitle; },
                set: function() {},
                configurable: true
            });

            if (!window.__shieldOuterW) {
                window.__shieldOuterW = window.outerWidth || screen.width || 1920;
                window.__shieldOuterH = window.outerHeight || screen.height || 1080;
            }

            const w = window.__shieldOuterW;
            const h = window.__shieldOuterH;

            Object.defineProperties(window, {
                innerWidth: { value: w, writable: false, configurable: true },
                innerHeight: { value: h, writable: false, configurable: true },
                outerWidth: { value: w, writable: false, configurable: true },
                outerHeight: { value: h, writable: false, configurable: true },
                screenX: { value: 0, writable: false, configurable: true },
                screenY: { value: 0, writable: false, configurable: true },
                screenLeft: { value: 0, writable: false, configurable: true },
                screenTop: { value: 0, writable: false, configurable: true },
                onbeforeunload: { value: null, writable: false, configurable: true },
                onunload: { value: null, writable: false, configurable: true },
                onpagehide: { value: null, writable: false, configurable: true },
                onblur: { value: null, writable: false, configurable: true },
                onfocus: { value: null, writable: false, configurable: true },
                onresize: { value: null, writable: false, configurable: true }
            });

            if (document.hasFocus && !document.__shieldHasFocusPatched) {
                document.__shieldHasFocusPatched = true;
                document.hasFocus = function() { return true; };
            }
        } catch (err) {}
    }

    function injectCopyUnlockStyles(root) {
        if (styleInjected && (!root || root === document.documentElement || root === document.head)) return;

        const host = root && root.nodeType === 11 ? root : (document.head || document.documentElement);
        if (!host) return;

        if (host.querySelector && host.querySelector('#' + STYLE_ID)) {
            if (!root || root === document.documentElement || root === document.head) styleInjected = true;
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '*, *::before, *::after {',
            '  -webkit-user-select: text !important;',
            '  -moz-user-select: text !important;',
            '  -ms-user-select: text !important;',
            '  user-select: text !important;',
            '  -webkit-touch-callout: default !important;',
            '}',
            'input, textarea {',
            '  -webkit-user-select: text !important;',
            '  user-select: text !important;',
            '}'
        ].join('\n');
        host.appendChild(style);

        if (!root || root === document.documentElement || root === document.head) styleInjected = true;
    }

    function stripBlockingHandlersOnElement(el) {
        if (!el || el.nodeType !== 1) return;

        INLINE_BLOCK_PROPS.forEach(function(prop) {
            if (el[prop]) el[prop] = null;
        });

        if (el.shadowRoot) {
            injectCopyUnlockStyles(el.shadowRoot);
            el.shadowRoot.querySelectorAll('*').forEach(stripBlockingHandlersOnElement);
        }
    }

    function stripBlockingHandlersOnNodes(nodes) {
        nodes.forEach(function(node) {
            if (node.nodeType === 1) {
                stripBlockingHandlersOnElement(node);
                if (node.querySelectorAll) {
                    node.querySelectorAll('*').forEach(stripBlockingHandlersOnElement);
                }
            }
        });
    }

    function applyCopyPasteUnlock(nodes) {
        injectCopyUnlockStyles();
        if (nodes && nodes.length) {
            stripBlockingHandlersOnNodes(nodes);
            return;
        }
        if (document.body) {
            stripBlockingHandlersOnElement(document.body);
        }
    }

    function scheduleCopyPasteUnlock(nodes) {
        if (unlockScheduled) return;
        unlockScheduled = true;
        requestAnimationFrame(function() {
            unlockScheduled = false;
            if (shieldObserver) shieldObserver.disconnect();
            try {
                applyCopyPasteUnlock(nodes);
            } finally {
                if (shieldObserver) observeTargets();
            }
        });
    }

    if (!EventTarget.prototype.__shieldAddPatched) {
        EventTarget.prototype.__shieldAddPatched = true;
        const originalAdd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (BLOCKED_TRACKING_EVENTS.has(type)) return;
            if (type === 'copy' || type === 'cut' || type === 'paste' ||
                type === 'contextmenu' || type === 'selectstart' || type === 'dragstart') {
                return;
            }
            return originalAdd.call(this, type, listener, options);
        };
    }

    BLOCKED_TRACKING_EVENTS.forEach(function(evt) {
        window.addEventListener(evt, killEvent, true);
        document.addEventListener(evt, killEvent, true);
    });

    UNBLOCK_CLIPBOARD_EVENTS.forEach(function(evt) {
        window.addEventListener(evt, unblockClipboardEvent, true);
        document.addEventListener(evt, unblockClipboardEvent, true);
    });

    window.addEventListener('beforeunload', function(e) {
        killEvent(e);
        delete e.returnValue;
    }, true);

    window.addEventListener('keydown', function(e) {
        const key = e.key && e.key.toLowerCase();
        if (e.key === 'PrintScreen') {
            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
        }
        if (allowDevToolsEvent(e)) {
            return;
        }
        if ((e.ctrlKey || e.metaKey) && SHORTCUT_KEYS.has(key)) {
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    }, true);

    window.addEventListener('keyup', function(e) {
        const key = e.key && e.key.toLowerCase();
        if (allowDevToolsEvent(e)) {
            return;
        }
        if ((e.ctrlKey || e.metaKey) && SHORTCUT_KEYS.has(key)) {
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    }, true);

    if (navigator.sendBeacon) {
        navigator.sendBeacon = function() { return true; };
    }

    if (!window.__shieldFetchPatched) {
        window.__shieldFetchPatched = true;
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
            if (init && init.keepalive) return Promise.resolve(new Response());
            return originalFetch.apply(this, arguments);
        };
    }

    if ('IdleDetector' in window) {
        window.IdleDetector = undefined;
    }

    if (document.__shieldVisibilityPatch !== true) {
        document.__shieldVisibilityPatch = true;
        try {
            Object.defineProperty(Document.prototype, 'hidden', {
                get: function() { return false; },
                configurable: true
            });
            Object.defineProperty(Document.prototype, 'visibilityState', {
                get: function() { return 'visible'; },
                configurable: true
            });
        } catch (err) {}
    }

    function observeTargets() {
        if (!shieldObserver) return;
        if (document.documentElement) {
            shieldObserver.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['oncopy', 'onpaste', 'oncut', 'onselectstart', 'oncontextmenu']
            });
        }
    }

    function startMutationObserver() {
        if (window.__shieldObserverStarted) return;
        window.__shieldObserverStarted = true;

        shieldObserver = new MutationObserver(function(mutations) {
            const added = [];
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === 'attributes' && m.target.nodeType === 1) {
                    added.push(m.target);
                } else if (m.addedNodes && m.addedNodes.length) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        added.push(m.addedNodes[j]);
                    }
                }
            }
            if (added.length) scheduleCopyPasteUnlock(added);
        });

        observeTargets();

        document.addEventListener('DOMContentLoaded', function() {
            scheduleCopyPasteUnlock();
        }, { once: true });
    }

    applyUltimateShield();
    injectCopyUnlockStyles();
    startMutationObserver();

    setInterval(applyUltimateShield, SHIELD_REAPPLY_MS);

    console.log(
    `%c[SHIELD EXT] Active (performance optimized). Tracking protection is reapplied every ${SHIELD_REAPPLY_MS}ms.`,
    'color: #00ff88; font-weight: bold; background: #111; padding: 8px;'
);
})();
