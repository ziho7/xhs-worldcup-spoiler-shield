const DEFAULTS = {
  enabled: true,
  hideScoreNumbers: true,
  hideSpoilerTitles: true,
  hidePanels: true,
  showToast: true
};

const fields = ["enabled", "hideScoreNumbers", "hideSpoilerTitles", "hidePanels"];
const statusEl = document.querySelector("#status");

function readForm() {
  return fields.reduce(
    (settings, field) => {
      settings[field] = document.querySelector(`#${field}`).checked;
      return settings;
    },
    { showToast: true }
  );
}

function writeForm(settings) {
  fields.forEach((field) => {
    document.querySelector(`#${field}`).checked = Boolean(settings[field]);
  });
}

function setStatus(text) {
  statusEl.textContent = text;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusEl.textContent = "设置会自动保存";
  }, 1200);
}

function notifyActiveTab(settings) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "xhs-shield-settings", settings }, () => {
      void chrome.runtime.lastError;
    });
  });
}

function saveSettings() {
  const settings = readForm();
  chrome.storage.sync.set(settings, () => {
    notifyActiveTab(settings);
    setStatus("已保存");
  });
}

chrome.storage.sync.get(DEFAULTS, (items) => {
  writeForm({ ...DEFAULTS, ...items });
});

fields.forEach((field) => {
  document.querySelector(`#${field}`).addEventListener("change", saveSettings);
});
