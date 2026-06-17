(function () {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    hideScoreNumbers: true,
    hideSpoilerTitles: true,
    hidePanels: true,
    showToast: true
  };

  const ROOT_CLASS = "xhs-wc-shield-enabled";
  const SCORE_ROOT_CLASS = "xhs-wc-shield-hide-scores";
  const TITLE_ROOT_CLASS = "xhs-wc-shield-hide-titles";
  const PANEL_ROOT_CLASS = "xhs-wc-shield-hide-panels";
  const DISABLED_ROOT_CLASS = "xhs-wc-shield-disabled";
  const ROUTE_CLASS = "xhs-wc-shield-route-active";
  const READY_CLASS = "xhs-wc-shield-ready";
  const MASK_CLASS = "xhs-wc-shield-mask";
  const WIDE_CLASS = "xhs-wc-shield-wide";
  const PANEL_CLASS = "xhs-wc-shield-panel";
  const SAFE_SCORE_CLASS = "xhs-wc-shield-safe-score";
  const SAFE_TITLE_CLASS = "xhs-wc-shield-safe-title";
  const TOAST_CLASS = "xhs-wc-shield-toast";
  const LABEL_ATTR = "xhsShieldLabel";
  const EARLY_ENABLED_KEY = "xhsWcShieldEnabled";
  const EARLY_SETTINGS_KEY = "xhsWcShieldSettings";
  const MAX_TEXT_LENGTH = 96;
  const MAX_GENERIC_MASK_WIDTH = 720;
  const MAX_GENERIC_MASK_HEIGHT = 90;

  const scoreSelectors = [
    ".xhs-match-header-score-wrap",
    ".xhs-match-header-score",
    ".xhs-match-header-score-sep",
    ".xhs-match-header-status",
    ".xhs-match-timeline-score",
    ".xhs-match-card-vs",
    '[class*="score-wrap"]',
    '[class*="score-sep"]',
    '[class*="match-score"]',
    '[class*="MatchScore"]'
  ];

  const titleSelectors = [
    ".xhs-match-card-match-highlight",
    ".xhs-match-highlights-card-title",
    ".xhs-match-timeline-note-title",
    '[class*="highlight"][class*="title"]',
    '[class*="timeline"][class*="title"]'
  ];

  const panelSelectors = [
    { selector: ".xhs-match-standings", label: "积分榜已隐藏" },
    { selector: ".xhs-match-timeline", label: "进球时间线已隐藏" },
    { selector: ".xhs-match-stats", label: "技术统计已隐藏" },
    { selector: '[class*="standings"]', label: "积分榜已隐藏" },
    { selector: '[class*="timeline"]', label: "进球时间线已隐藏" },
    { selector: '[class*="stats"]', label: "技术统计已隐藏" }
  ];

  const spoilerWords =
    /(全场集锦|战报|进球|破门|扳平|反超|绝杀|点球|乌龙|锁定胜局|世界波|推射|头球|单刀|制胜|补时|大胜|逆转|淘汰|晋级|战胜|击败|惜败|完胜|零封|双响|帽子戏法|戴帽|问鼎|轻取|让一追二|救主|拒绝开门黑|梅开二度|绝平|战平|首胜|一锤定音|赢首胜|火力全开|两度落后|顽强绝平|爆冷)/;
  const resultWords = /(已结束|完场|全场|比分|战胜|击败|大胜|逆转|淘汰|晋级|点球大战|轻取|战平|首胜)/;
  const scorePattern =
    /(^|[^\d])([0-9]|1[0-9])\s*[-:：]\s*([0-9]|1[0-9])($|[^\d])/;

  let settings = { ...DEFAULTS };
  let scanTimer = 0;
  let observer = null;
  let bootScans = 0;
  let toastShown = false;
  let routeActive = false;
  let lastHref = window.location.href;

  function isWorldCupRoute(url = window.location.href) {
    try {
      return new URL(url, window.location.href).pathname.startsWith("/worldcup26");
    } catch (error) {
      return window.location.pathname.startsWith("/worldcup26");
    }
  }

  function readEarlySettings() {
    let saved = {};

    try {
      saved = JSON.parse(window.localStorage.getItem(EARLY_SETTINGS_KEY) || "{}");
    } catch (error) {
      saved = {};
    }

    try {
      saved.enabled = window.localStorage.getItem(EARLY_ENABLED_KEY) !== "false";
    } catch (error) {
      saved.enabled = true;
    }

    return { ...DEFAULTS, ...saved };
  }

  function writeEarlySettings(nextSettings) {
    const next = { ...DEFAULTS, ...nextSettings };

    try {
      window.localStorage.setItem(EARLY_ENABLED_KEY, next.enabled ? "true" : "false");
      window.localStorage.setItem(EARLY_SETTINGS_KEY, JSON.stringify(next));
    } catch (error) {
      // Storage can be blocked in hardened browser modes; the extension still works.
    }
  }

  function applyRootClasses(nextSettings) {
    const root = document.documentElement;
    const enabled = Boolean(nextSettings.enabled);

    root.classList.toggle(ROOT_CLASS, enabled);
    root.classList.toggle(DISABLED_ROOT_CLASS, !enabled);
    root.classList.toggle(SCORE_ROOT_CLASS, enabled && Boolean(nextSettings.hideScoreNumbers));
    root.classList.toggle(TITLE_ROOT_CLASS, enabled && Boolean(nextSettings.hideSpoilerTitles));
    root.classList.toggle(PANEL_ROOT_CLASS, enabled && Boolean(nextSettings.hidePanels));
  }

  function updateRouteState() {
    const nextRouteActive = isWorldCupRoute();
    if (nextRouteActive !== routeActive) {
      routeActive = nextRouteActive;
      document.documentElement.classList.toggle(ROUTE_CLASS, routeActive);

      if (routeActive) {
        document.documentElement.classList.remove(READY_CLASS);
      }
    }

    return routeActive;
  }

  updateRouteState();
  applyRootClasses(readEarlySettings());

  function storageGet(callback) {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.sync) {
      callback({ ...DEFAULTS });
      return;
    }

    chrome.storage.sync.get(DEFAULTS, (items) => callback({ ...DEFAULTS, ...items }));
  }

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function hasScore(text) {
    if (!scorePattern.test(text)) return false;
    if (/^\s*(?:\d\s*-\s*){2,}\d\s*$/.test(text)) return false;
    if (/^\s*\d{1,2}\s*:\s*\d{2}\s*$/.test(text)) return false;
    if (/^\s*\d{4}\s*-\s*\d{2}\s*-\s*\d{2}\s*$/.test(text)) return false;
    return true;
  }

  function isProbablySpoiler(text) {
    return hasScore(text) || spoilerWords.test(text) || resultWords.test(text);
  }

  function isInsideShieldedNode(element) {
    return Boolean(element.closest(`.${MASK_CLASS}, .${PANEL_CLASS}, .${TOAST_CLASS}`));
  }

  function hasShieldedAncestor(element) {
    if (!element || !element.parentElement) return false;
    return Boolean(element.parentElement.closest(`.${MASK_CLASS}, .${PANEL_CLASS}, .${TOAST_CLASS}`));
  }

  function isMatchCardHeader(element) {
    return Boolean(
      element.matches(".xhs-match-card-header") ||
        element.querySelector(".xhs-match-card-match-highlight")
    );
  }

  function directTextOf(element) {
    return normalize(
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
    );
  }

  function hasVisualSurface(element) {
    if (element.querySelector("img, video, picture, canvas, iframe, source")) return true;

    const style = window.getComputedStyle(element);
    return Boolean(style.backgroundImage && style.backgroundImage !== "none");
  }

  function isSmallTextTarget(element, text) {
    const rect = element.getBoundingClientRect();
    const directText = directTextOf(element);

    if (rect.width > MAX_GENERIC_MASK_WIDTH || rect.height > MAX_GENERIC_MASK_HEIGHT) {
      return false;
    }

    if (hasVisualSurface(element)) {
      return false;
    }

    if (element.children.length > 0 && (!directText || directText.length < text.length / 2)) {
      return false;
    }

    return true;
  }

  function canMaskElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    const tag = element.tagName;
    if (
      tag === "HTML" ||
      tag === "BODY" ||
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "SVG" ||
      tag === "PATH" ||
      tag === "IMG" ||
      tag === "VIDEO" ||
      tag === "CANVAS" ||
      tag === "IFRAME"
    ) {
      return false;
    }

    return !element.closest(`.${PANEL_CLASS}, .${TOAST_CLASS}`);
  }

  function maskElement(element, label, options = {}) {
    if (!canMaskElement(element)) return;
    element.classList.add(MASK_CLASS);
    element.classList.toggle(WIDE_CLASS, Boolean(options.wide));
    element.dataset[LABEL_ATTR] = label;
  }

  function maskPanel(element, label) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.closest(`.${PANEL_CLASS}`) && !element.classList.contains(PANEL_CLASS)) return;

    element.classList.add(PANEL_CLASS);
    element.dataset[LABEL_ATTR] = label;
  }

  function clearDynamicShields() {
    document.querySelectorAll(`.${MASK_CLASS}`).forEach((element) => {
      element.classList.remove(MASK_CLASS, WIDE_CLASS);
      delete element.dataset[LABEL_ATTR];
    });
    document.querySelectorAll(`.${PANEL_CLASS}`).forEach((element) => {
      element.classList.remove(PANEL_CLASS);
      delete element.dataset[LABEL_ATTR];
    });
  }

  function removeShieldState() {
    writeEarlySettings({ ...settings, enabled: false });
    document.documentElement.classList.remove(
      ROOT_CLASS,
      SCORE_ROOT_CLASS,
      TITLE_ROOT_CLASS,
      PANEL_ROOT_CLASS
    );
    document.documentElement.classList.add(DISABLED_ROOT_CLASS);
    clearDynamicShields();
    document.querySelectorAll(`.${TOAST_CLASS}`).forEach((element) => element.remove());
  }

  function deactivateForRoute() {
    document.documentElement.classList.remove(
      ROOT_CLASS,
      SCORE_ROOT_CLASS,
      TITLE_ROOT_CLASS,
      PANEL_ROOT_CLASS,
      READY_CLASS
    );
    clearDynamicShields();
    document.querySelectorAll(`.${TOAST_CLASS}`).forEach((element) => element.remove());
  }

  function markReady() {
    document.documentElement.classList.add(READY_CLASS);
  }

  function shieldKnownScoreBlocks() {
    if (!settings.hideScoreNumbers) return;

    scoreSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (hasShieldedAncestor(element) || element.closest(`.${PANEL_CLASS}`)) return;
        const text = normalize(element.textContent);
        if (!text || (!hasScore(text) && !resultWords.test(text))) {
          element.classList.add(SAFE_SCORE_CLASS);
          return;
        }

        element.classList.remove(SAFE_SCORE_CLASS);
        const label = resultWords.test(text) ? "赛果已隐藏" : "比分已隐藏";
        maskElement(element, label);
      });
    });
  }

  function shieldKnownTitles() {
    if (!settings.hideSpoilerTitles) return;

    titleSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (hasShieldedAncestor(element) || element.closest(`.${PANEL_CLASS}`)) return;
        const text = normalize(element.textContent);
        if (element.matches(".xhs-match-card-match-highlight")) {
          if (!text) {
            element.classList.add(SAFE_TITLE_CLASS);
            return;
          }

          element.classList.remove(SAFE_TITLE_CLASS);
          maskElement(element, "赛况已隐藏", { wide: true });
          return;
        }

        if (!text || !isProbablySpoiler(text)) {
          element.classList.add(SAFE_TITLE_CLASS);
          return;
        }

        element.classList.remove(SAFE_TITLE_CLASS);
        maskElement(element, "剧透标题已隐藏", { wide: true });
      });
    });
  }

  function shieldKnownPanels() {
    if (!settings.hidePanels) return;

    panelSelectors.forEach(({ selector, label }) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (element.matches(".xhs-match-highlights-card, a, button")) return;
        maskPanel(element, label);
      });
    });
  }

  function shieldTextLeaves() {
    if (!settings.hideScoreNumbers && !settings.hideSpoilerTitles) return;

    const nodes = document.querySelectorAll("body *");
    nodes.forEach((element) => {
      if (!canMaskElement(element) || isInsideShieldedNode(element)) return;
      if (isMatchCardHeader(element)) return;
      if (element.children.length > 2) return;

      const text = normalize(element.textContent);
      if (!text || text.length > MAX_TEXT_LENGTH) return;

      if (settings.hideScoreNumbers && hasScore(text)) {
        if (!isSmallTextTarget(element, text)) return;
        maskElement(element, "比分已隐藏", { wide: text.length > 12 });
        return;
      }

      if (settings.hideSpoilerTitles && spoilerWords.test(text)) {
        if (!isSmallTextTarget(element, text)) return;
        maskElement(element, "剧透已隐藏", { wide: true });
      }
    });
  }

  function showToastOnce() {
    if (toastShown || !settings.showToast || document.querySelector(`.${TOAST_CLASS}`)) return;
    if (!document.body) return;

    toastShown = true;
    const toast = document.createElement("div");
    toast.className = TOAST_CLASS;
    toast.textContent = "免比分已开启";
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1800);
  }

  function scanNow() {
    scanTimer = 0;

    if (!updateRouteState()) {
      deactivateForRoute();
      return;
    }

    if (!document.body) {
      scheduleScan(30);
      return;
    }

    if (!settings.enabled) {
      removeShieldState();
      markReady();
      return;
    }

    writeEarlySettings(settings);
    applyRootClasses(settings);
    clearDynamicShields();
    shieldKnownPanels();
    shieldKnownScoreBlocks();
    shieldKnownTitles();
    shieldTextLeaves();
    showToastOnce();
    markReady();
  }

  function scheduleScan(delay = 120) {
    if (scanTimer) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanNow, delay);
  }

  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => scheduleScan(routeActive ? 0 : 120));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function startRouteWatcher() {
    window.setInterval(() => {
      if (window.location.href === lastHref) return;
      lastHref = window.location.href;
      updateRouteState();
      scheduleScan(0);
    }, 80);

    window.addEventListener("popstate", () => {
      lastHref = window.location.href;
      updateRouteState();
      scheduleScan(0);
    });
    window.addEventListener("hashchange", () => {
      lastHref = window.location.href;
      updateRouteState();
      scheduleScan(0);
    });
  }

  function bootScanLoop() {
    scheduleScan(0);
    bootScans += 1;
    if (bootScans < 12) {
      window.setTimeout(bootScanLoop, bootScans < 4 ? 250 : 800);
    }
  }

  function applySettings(nextSettings) {
    settings = { ...DEFAULTS, ...settings, ...nextSettings };
    writeEarlySettings(settings);
    applyRootClasses(settings);
    scheduleScan(0);
  }

  function listenForSettings() {
    if (!globalThis.chrome) return;

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.type !== "xhs-shield-settings") return;
        applySettings(message.settings || {});
        sendResponse({ ok: true });
      });
    }

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") return;

        const next = {};
        Object.keys(DEFAULTS).forEach((key) => {
          if (changes[key]) next[key] = changes[key].newValue;
        });

        if (Object.keys(next).length) applySettings(next);
      });
    }
  }

  function init() {
    storageGet((items) => {
      settings = { ...DEFAULTS, ...items };
      writeEarlySettings(settings);
      applyRootClasses(settings);
      startObserver();
      startRouteWatcher();
      listenForSettings();
      bootScanLoop();
    });
  }

  init();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleScan(0), { once: true });
  }
})();
