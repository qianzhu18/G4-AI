const AI_TYPES = ['claude', 'chatgpt', 'gemini', 'qwen', 'grok', 'deepseek', 'kimi', 'doubao', 'chatglm'];

const logContainer = document.getElementById('log-container');
const pairingCodeEl = document.getElementById('pairing-code');
const pairingHintEl = document.getElementById('pairing-hint');
const refreshCodeBtn = document.getElementById('refresh-code-btn');
const extensionIdEl = document.getElementById('extension-id');
const extensionIdContainer = document.getElementById('extension-id-container');
const pairingCodeContainer = document.getElementById('pairing-code-container');
const openDashboardBtn = document.getElementById('open-dashboard-btn');

let currentPairingCode = null;
let codeExpiryTime = null;
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  displayExtensionId();
  checkAIStatuses();
  loadPairingCode();
  setupEventListeners();
});

function displayExtensionId() {
  // Check if chrome.runtime is available
  if (!chrome.runtime || !chrome.runtime.id) {
    extensionIdEl.textContent = 'Error: Runtime invalid';
    return;
  }
  const extId = chrome.runtime.id;
  extensionIdEl.textContent = extId;

  extensionIdContainer.addEventListener('click', () => {
    navigator.clipboard.writeText(extId).then(() => {
      const originalText = extensionIdEl.textContent;
      extensionIdEl.textContent = '已复制!';
      log('Extension ID 已复制', 'success');
      setTimeout(() => {
        extensionIdEl.textContent = originalText;
      }, 1500);
    });
  });
}

function setupEventListeners() {
  refreshCodeBtn.addEventListener('click', generateNewPairingCode);
  openDashboardBtn.addEventListener('click', openDashboard);

  pairingCodeContainer.addEventListener('click', () => {
    if (currentPairingCode) {
      navigator.clipboard.writeText(currentPairingCode).then(() => {
        const originalText = pairingCodeEl.textContent;
        pairingCodeEl.textContent = '已复制!';
        log('配对码已复制', 'success');
        setTimeout(() => {
          pairingCodeEl.textContent = originalText;
        }, 1500);
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TAB_STATUS_UPDATE') {
      updateAIStatus(message.aiType, message.connected);
    } else if (message.type === 'PAIRING_CODE_GENERATED') {
      displayPairingCode(message.code);
    } else if (message.type === 'RESPONSE_CAPTURED') {
      log(`${message.aiType}: 收到回复`, 'success');
    } else if (message.type === 'SEND_RESULT') {
      if (message.success) {
        log(`${message.aiType}: 消息已发送`, 'success');
      } else {
        log(`${message.aiType}: 发送失败 - ${message.error}`, 'error');
      }
    }
  });
}

function openDashboard() {
  const dashboardUrl = chrome.runtime.getURL('web/index.html');
  chrome.tabs.create({ url: dashboardUrl }, (tab) => {
    log('控制台已在新标签页打开', 'success');
  });
}

async function checkAIStatuses() {
  try {
    const tabs = await chrome.tabs.query({});

    for (const aiType of AI_TYPES) {
      updateAIStatus(aiType, false);
    }

    for (const tab of tabs) {
      const aiType = getAITypeFromUrl(tab.url);
      if (aiType) {
        updateAIStatus(aiType, true);
      }
    }
  } catch (err) {
    log('检查 AI 状态失败: ' + err.message, 'error');
  }
}

function getAITypeFromUrl(url) {
  if (!url) return null;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('qianwen.com')) return 'qwen';
  if (url.includes('grok.com') || url.includes('x.ai') || url.includes('x.com/i/grok') || url.includes('x.com/grok') || url.includes('twitter.com/i/grok')) return 'grok';
  if (url.includes('chat.deepseek.com')) return 'deepseek';
  if (url.includes('kimi.com')) return 'kimi';
  if (url.includes('doubao.com')) return 'doubao';
  if (url.includes('chatglm.cn')) return 'chatglm';
  return null;
}

function updateAIStatus(aiType, connected) {
  const statusEl = document.getElementById(`status-${aiType}`);
  if (statusEl) {
    statusEl.className = 'status-dot' + (connected ? ' connected' : '');
  }
}

async function loadPairingCode() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PAIRING_CODE' });
    if (response?.code) {
      displayPairingCode(response.code);
    } else {
      generateNewPairingCode();
    }
  } catch (err) {
    log('加载配对码失败', 'error');
    pairingCodeEl.textContent = '------';
  }
}

async function generateNewPairingCode() {
  pairingCodeEl.textContent = '...';
  pairingHintEl.textContent = '生成中...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GENERATE_PAIR_CODE' });
    if (response?.code) {
      displayPairingCode(response.code);
      log('新配对码已生成', 'success');
    } else {
      throw new Error('No code returned');
    }
  } catch (err) {
    pairingCodeEl.textContent = '------';
    pairingHintEl.textContent = '生成失败';
    log('生成配对码失败: ' + err.message, 'error');
  }
}

function displayPairingCode(code) {
  currentPairingCode = code;
  pairingCodeEl.textContent = code;

  codeExpiryTime = Date.now() + 5 * 60 * 1000;
  startCountdown();
}

function startCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = setInterval(() => {
    const remaining = Math.max(0, codeExpiryTime - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    if (remaining <= 0) {
      pairingHintEl.textContent = '已过期，请刷新';
      pairingCodeEl.style.opacity = '0.4';
      clearInterval(countdownInterval);
    } else {
      pairingHintEl.textContent = `有效期 ${minutes}:${seconds.toString().padStart(2, '0')}`;
      pairingCodeEl.style.opacity = '1';
    }
  }, 1000);
}

function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (type !== 'info' ? ` ${type}` : '');

  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  entry.innerHTML = `<span class="time">${time}</span> ${message}`;
  logContainer.insertBefore(entry, logContainer.firstChild);

  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}
