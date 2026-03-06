const AI_URL_PATTERNS = {
  claude: ['claude.ai'],
  chatgpt: ['chat.openai.com', 'chatgpt.com'],
  gemini: ['gemini.google.com'],
  grok: ['grok.com', 'x.ai', 'x.com/i/grok', 'x.com/grok', 'twitter.com/i/grok'],
};

const AI_TYPES = ['claude', 'chatgpt', 'gemini', 'grok'];
const MESSAGE_TIMEOUT_MS = 12000;
const CONTENT_SCRIPT_PING_TTL_MS = 15000;

const tabToAIMap = new Map();
const aiToTabIdMap = new Map();
const contentScriptHealthMap = new Map();

const externalPorts = new Set();

let pairingState = {
  code: null,
  token: null,
  codeExpiry: null,
  tokenExpiry: null,
};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateToken() {
  return crypto.randomUUID();
}

let pairingStateLoaded = false;

async function loadPairingState() {
  const result = await chrome.storage.local.get('pairingState');
  if (result.pairingState) {
    pairingState = result.pairingState;
    console.log('[AI Panel] Pairing state loaded from storage');
  }
  pairingStateLoaded = true;
}

async function savePairingState() {
  await chrome.storage.local.set({ pairingState });
}

// 立即开始加载，但不阻塞模块初始化
loadPairingState();

async function getStoredResponses() {
  const result = await chrome.storage.session.get('latestResponses');
  return result.latestResponses || AI_TYPES.reduce((acc, ai) => ({ ...acc, [ai]: null }), {});
}

async function setStoredResponse(aiType, content) {
  const responses = await getStoredResponses();
  responses[aiType] = content;
  await chrome.storage.session.set({ latestResponses: responses });
}

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function initializeTabCaches() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      const aiType = getAITypeFromUrl(tab.url);
      if (!aiType) continue;
      tabToAIMap.set(tab.id, aiType);
      if (!aiToTabIdMap.has(aiType)) {
        aiToTabIdMap.set(aiType, tab.id);
      }
    }
  } catch (err) {
    console.log('[AI Panel] Failed to initialize tab caches:', err.message);
  }
}

initializeTabCaches();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleInternalMessage(message, sender).then(sendResponse);
  return true;
});

chrome.runtime.onConnectExternal.addListener((port) => {
  console.log('[AI Panel] External connection from:', port.sender?.origin, 'name:', port.name);
  console.log('[AI Panel] Port sender details:', JSON.stringify(port.sender));
  externalPorts.add(port);

  port.onMessage.addListener((msg) => {
    console.log('[AI Panel] External message received:', JSON.stringify(msg));
    handleExternalMessage(port, msg);
  });

  port.onDisconnect.addListener(() => {
    console.log('[AI Panel] External port disconnected');
    externalPorts.delete(port);
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'g4-ai-web-internal') {
    console.log('[AI Panel] Internal web app connection');
    externalPorts.add(port);

    port.onMessage.addListener((msg) => {
      console.log('[AI Panel] Internal message received:', JSON.stringify(msg));
      handleExternalMessage(port, msg, true);
    });

    port.onDisconnect.addListener(() => {
      console.log('[AI Panel] Internal port disconnected');
      externalPorts.delete(port);
    });
  }
});

async function handleExternalMessage(port, msg, isInternal = false) {
  console.log('[AI Panel] handleExternalMessage called with:', msg.kind, msg.type, 'isInternal:', isInternal);

  // 等待 pairingState 从 storage 加载完成
  if (!pairingStateLoaded) {
    console.log('[AI Panel] Waiting for pairing state to load...');
    await loadPairingState();
  }

  if (msg.kind !== 'REQ') {
    console.log('[AI Panel] Ignoring non-REQ message');
    return;
  }

  const { id, type, payload, token } = msg;

  if (type === 'GET_PAIR_CODE') {
    console.log('[AI Panel] GET_PAIR_CODE - generating new code');
    const code = generateCode();
    const newToken = generateToken();
    pairingState = {
      code,
      token: newToken,
      codeExpiry: Date.now() + 5 * 60 * 1000,
      tokenExpiry: Date.now() + 30 * 60 * 1000,
    };
    await savePairingState();

    notifySidePanel('PAIRING_CODE_GENERATED', { code });

    console.log('[AI Panel] Sending code response:', code);
    port.postMessage({
      kind: 'RES',
      id,
      ok: true,
      data: { code },
    });
    return;
  }

  if (type === 'AUTO_PAIR') {
    console.log('[AI Panel] AUTO_PAIR - automatic pairing for internal web app');

    const autoToken = generateToken();
    pairingState = {
      code: null,
      token: autoToken,
      codeExpiry: null,
      tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
    };
    await savePairingState();

    console.log('[AI Panel] AUTO_PAIR success, returning token');
    port.postMessage({
      kind: 'RES',
      id,
      ok: true,
      data: { token: autoToken },
    });
    return;
  }

  if (type === 'PAIR_CONFIRM') {
    const { code: inputCode } = payload || {};
    console.log('[AI Panel] PAIR_CONFIRM - input:', inputCode, 'expected:', pairingState.code);

    if (!pairingState.code || !pairingState.codeExpiry) {
      console.log('[AI Panel] PAIR_CONFIRM failed: No pairing in progress');
      port.postMessage({ kind: 'RES', id, ok: false, error: 'No pairing in progress' });
      return;
    }

    if (Date.now() > pairingState.codeExpiry) {
      console.log('[AI Panel] PAIR_CONFIRM failed: Code expired');
      port.postMessage({ kind: 'RES', id, ok: false, error: 'Pairing code expired' });
      return;
    }

    if (inputCode !== pairingState.code) {
      console.log('[AI Panel] PAIR_CONFIRM failed: Code mismatch');
      port.postMessage({ kind: 'RES', id, ok: false, error: 'Invalid pairing code' });
      return;
    }

    pairingState.code = null;
    pairingState.codeExpiry = null;
    pairingState.tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
    await savePairingState();

    console.log('[AI Panel] PAIR_CONFIRM success, returning token');
    port.postMessage({
      kind: 'RES',
      id,
      ok: true,
      data: { token: pairingState.token },
    });
    return;
  }

  if (!isInternal && (!token || token !== pairingState.token)) {
    port.postMessage({ kind: 'RES', id, ok: false, error: 'Unauthorized' });
    return;
  }

  if (!isInternal && pairingState.tokenExpiry && Date.now() > pairingState.tokenExpiry) {
    port.postMessage({ kind: 'RES', id, ok: false, error: 'Token expired' });
    return;
  }

  try {
    let result;
    switch (type) {
      case 'SEND_MESSAGE':
        result = await sendMessageToAI(payload.aiType, payload.message);
        break;
      case 'GET_RESPONSE':
        result = await getResponseFromContentScript(payload.aiType);
        break;
      case 'GET_STATUS':
        result = await getAllStatuses();
        break;
      case 'NEW_CONVERSATION':
        result = await startNewConversation(payload.aiTypes);
        break;
      default:
        result = { error: 'Unknown message type' };
    }
    port.postMessage({ kind: 'RES', id, ok: true, data: result });
  } catch (err) {
    port.postMessage({ kind: 'RES', id, ok: false, error: err.message });
  }
}

async function getAllStatuses() {
  const statuses = {};
  const tabCounts = {};
  const tabs = await chrome.tabs.query({});

  for (const ai of AI_TYPES) {
    statuses[ai] = false;
    tabCounts[ai] = 0;
  }

  for (const tab of tabs) {
    if (tab.url) {
      const aiType = getAITypeFromUrl(tab.url);
      if (aiType) {
        statuses[aiType] = true;
        tabCounts[aiType] = (tabCounts[aiType] || 0) + 1;
      }
    }
  }

  return { statuses, tabCounts };
}

function notifyExternalPorts(type, data) {
  const event = { kind: 'EVT', type, data };
  for (const port of externalPorts) {
    try {
      port.postMessage(event);
    } catch (err) {
      console.log('[AI Panel] Failed to notify external port:', err.message);
    }
  }
}

async function handleInternalMessage(message, sender) {
  switch (message.type) {
    case 'SEND_MESSAGE':
      return await sendMessageToAI(message.aiType, message.message);

    case 'GET_RESPONSE':
      return await getResponseFromContentScript(message.aiType);

    case 'RESPONSE_CAPTURED':
      await setStoredResponse(message.aiType, message.content);
      notifySidePanel('RESPONSE_CAPTURED', { aiType: message.aiType, content: message.content });
      notifyExternalPorts('RESPONSE_CAPTURED', { aiType: message.aiType, content: message.content });
      return { success: true };

    case 'CONTENT_SCRIPT_READY':
      const aiType = getAITypeFromUrl(sender.tab?.url);
      if (aiType) {
        notifySidePanel('TAB_STATUS_UPDATE', { aiType, connected: true });
        notifyExternalPorts('TAB_STATUS_UPDATE', { aiType, connected: true });
      }
      return { success: true };

    case 'NEW_CONVERSATION':
      return await startNewConversation(message.aiTypes);

    case 'GET_PAIRING_CODE':
      return { code: pairingState.code };

    case 'GENERATE_PAIR_CODE':
      const newCode = generateCode();
      const newToken = generateToken();
      pairingState = {
        code: newCode,
        token: newToken,
        codeExpiry: Date.now() + 5 * 60 * 1000,
        tokenExpiry: Date.now() + 30 * 60 * 1000,
      };
      await savePairingState();
      return { code: newCode };

    default:
      return { error: 'Unknown message type' };
  }
}

async function getResponseFromContentScript(aiType) {
  try {
    const tab = await findAITab(aiType);
    if (!tab) {
      const responses = await getStoredResponses();
      return { content: responses[aiType] };
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_LATEST_RESPONSE'
    });

    return { content: response?.content || null };
  } catch (err) {
    console.log('[AI Panel] Failed to get response from content script:', err.message);
    const responses = await getStoredResponses();
    return { content: responses[aiType] };
  }
}

async function ensureContentScriptAlive(aiType, tab, forcePing = false) {
  if (!forcePing) {
    const lastHealthy = contentScriptHealthMap.get(aiType);
    if (lastHealthy && Date.now() - lastHealthy < CONTENT_SCRIPT_PING_TTL_MS) {
      return true;
    }
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, { timeoutMs: 2000 });
    contentScriptHealthMap.set(aiType, Date.now());
    return true;
  } catch (err) {
    console.log('[AI Panel] Content script ping failed for', aiType, ':', err.message);
    // Don't automatically reload - this might interrupt an ongoing conversation
    // Only reload if we're sure the script is not responding
    const responses = await getStoredResponses();
    if (responses[aiType]) {
      console.log('[AI Panel] Script may be busy, has previous response, not reloading');
      return true; // Assume it's alive if we have previous responses
    }

    console.log('[AI Panel] Content script appears dead for', aiType, ', reloading...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [`content/${aiType}.js`]
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('[AI Panel] Content script reloaded for', aiType);
      contentScriptHealthMap.set(aiType, Date.now());
      return true;
    } catch (reloadErr) {
      console.log('[AI Panel] Failed to reload content script:', reloadErr.message);
      return false;
    }
  }
}

async function sendMessageToAI(aiType, message, retryCount = 0) {
  const maxRetries = 2;

  try {
    const tab = await findAITab(aiType);

    if (!tab) {
      return { success: false, error: `No ${aiType} tab found` };
    }

    const isAlive = await ensureContentScriptAlive(aiType, tab, retryCount > 0);
    if (!isAlive) {
      return { success: false, error: `Failed to connect to ${aiType}` };
    }

    const response = await Promise.race([
      chrome.tabs.sendMessage(tab.id, {
        type: 'INJECT_MESSAGE',
        message
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${MESSAGE_TIMEOUT_MS}ms`)), MESSAGE_TIMEOUT_MS)
      )
    ]);

    const result = {
      aiType,
      success: response?.success,
      error: response?.error
    };

    notifySidePanel('SEND_RESULT', result);
    notifyExternalPorts('SEND_RESULT', result);
    contentScriptHealthMap.set(aiType, Date.now());

    return response;
  } catch (err) {
    console.log('[AI Panel] Send error for', aiType, ':', err.message);

    if (retryCount < maxRetries && err.message.includes('Receiving end does not exist')) {
      const waitTime = Math.min(500 * Math.pow(2, retryCount), 1500);
      console.log('[AI Panel] Retrying send to', aiType, `attempt ${retryCount + 1}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return sendMessageToAI(aiType, message, retryCount + 1);
    }

    return { success: false, error: err.message };
  }
}

async function findAITab(aiType) {
  const patterns = AI_URL_PATTERNS[aiType];
  if (!patterns) {
    console.log('[AI Panel] No patterns found for aiType:', aiType);
    return null;
  }

  const cachedTabId = aiToTabIdMap.get(aiType);
  if (cachedTabId) {
    try {
      const cachedTab = await chrome.tabs.get(cachedTabId);
      if (cachedTab?.url && patterns.some(p => cachedTab.url.includes(p))) {
        return cachedTab;
      }
    } catch (err) {
      // ignored
    }
    aiToTabIdMap.delete(aiType);
  }

  console.log('[AI Panel] Looking for', aiType, 'with patterns:', patterns);

  const tabs = await chrome.tabs.query({});
  console.log('[AI Panel] Found', tabs.length, 'tabs');

  for (const tab of tabs) {
    console.log('[AI Panel] Checking tab:', tab.id, 'URL:', tab.url);
    if (tab.url && patterns.some(p => tab.url.includes(p))) {
      console.log('[AI Panel] Found matching tab for', aiType, ':', tab.id);
      if (tab.id) {
        tabToAIMap.set(tab.id, aiType);
        aiToTabIdMap.set(aiType, tab.id);
      }
      return tab;
    }
  }

  console.log('[AI Panel] No matching tab found for', aiType);
  return null;
}

function getAITypeFromUrl(url) {
  if (!url) return null;
  for (const [aiType, patterns] of Object.entries(AI_URL_PATTERNS)) {
    if (patterns.some(p => url.includes(p))) {
      return aiType;
    }
  }
  return null;
}

async function notifySidePanel(type, data) {
  try {
    await chrome.runtime.sendMessage({ type, ...data });
  } catch (err) {
    // Side panel might not be open, ignore
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const aiType = getAITypeFromUrl(tab.url);
    if (aiType) {
      tabToAIMap.set(tabId, aiType);
      aiToTabIdMap.set(aiType, tabId);
      notifySidePanel('TAB_STATUS_UPDATE', { aiType, connected: true });
      notifyExternalPorts('TAB_STATUS_UPDATE', { aiType, connected: true });
    } else if (tabToAIMap.has(tabId)) {
      const oldAIType = tabToAIMap.get(tabId);
      tabToAIMap.delete(tabId);
      if (aiToTabIdMap.get(oldAIType) === tabId) {
        aiToTabIdMap.delete(oldAIType);
      }

      const tabs = await chrome.tabs.query({});
      const hasOtherTab = tabs.some(t => t.url && getAITypeFromUrl(t.url) === oldAIType);

      if (!hasOtherTab) {
        notifySidePanel('TAB_STATUS_UPDATE', { aiType: oldAIType, connected: false });
        notifyExternalPorts('TAB_STATUS_UPDATE', { aiType: oldAIType, connected: false });
      }
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabToAIMap.has(tabId)) {
    const aiType = tabToAIMap.get(tabId);
    tabToAIMap.delete(tabId);
    contentScriptHealthMap.delete(aiType);
    if (aiToTabIdMap.get(aiType) === tabId) {
      aiToTabIdMap.delete(aiType);
    }

    try {
      const tabs = await chrome.tabs.query({});
      const hasOtherTab = tabs.some(t => t.url && getAITypeFromUrl(t.url) === aiType);

      if (!hasOtherTab) {
        notifySidePanel('TAB_STATUS_UPDATE', { aiType, connected: false });
        notifyExternalPorts('TAB_STATUS_UPDATE', { aiType, connected: false });
      }
    } catch (err) {
      console.log('[AI Panel] Error checking for other tabs:', err.message);
    }
  }
});

setInterval(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.active) { // Only check active tabs to reduce overhead
        const aiType = getAITypeFromUrl(tab.url);
        if (aiType) {
          chrome.tabs.sendMessage(tab.id, { type: 'HEARTBEAT' }).catch(() => {
            // Silently ignore heartbeat failures - don't spam console
          });
        }
      }
    }
  } catch (err) {
    // Ignore errors during heartbeat
  }
}, 30000); // Increased from 10s to 30s

async function startNewConversation(aiTypes) {
  const results = {};

  await Promise.all(aiTypes.map(async (aiType) => {
    try {
      const tab = await findAITab(aiType);
      if (!tab) {
        results[aiType] = { success: false, error: `No ${aiType} tab found` };
        return;
      }

      // Try to capture current response before starting new conversation
      // This ensures we don't lose any in-progress responses
      try {
        const currentResponse = await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_LATEST_RESPONSE'
        });
        if (currentResponse && currentResponse.content) {
          console.log('[AI Panel] Captured response before new conversation for', aiType);
          // Notify about the captured response
          notifySidePanel('RESPONSE_CAPTURED', {
            aiType,
            content: currentResponse.content
          });
          notifyExternalPorts('RESPONSE_CAPTURED', {
            aiType,
            content: currentResponse.content
          });
        }
      } catch (err) {
        // Ignore errors when trying to capture response
        console.log('[AI Panel] Could not capture response before new conversation:', err.message);
      }

      // Small delay to ensure response capture message is sent
      await new Promise(resolve => setTimeout(resolve, 200));

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'NEW_CONVERSATION'
      });

      results[aiType] = response || { success: true };
    } catch (err) {
      console.log('[AI Panel] New conversation error for', aiType, ':', err.message);
      results[aiType] = { success: false, error: err.message };
    }
  }));

  notifySidePanel('NEW_CONVERSATION_RESULTS', { results });
  notifyExternalPorts('NEW_CONVERSATION_RESULTS', { results });

  return { success: true, results };
}
