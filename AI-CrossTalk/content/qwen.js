// AI Panel - Qwen Content Script

(function () {
  'use strict';

  const AI_TYPE = 'qwen';

  function isContextValid() {
    return chrome.runtime && chrome.runtime.id;
  }

  function safeSendMessage(message, callback) {
    if (!isContextValid()) {
      console.log('[AI Panel] Extension context invalidated, skipping message');
      return;
    }
    try {
      chrome.runtime.sendMessage(message, callback);
    } catch (e) {
      console.log('[AI Panel] Failed to send message:', e.message);
    }
  }

  safeSendMessage({ type: 'CONTENT_SCRIPT_READY', aiType: AI_TYPE });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HEARTBEAT' || message.type === 'PING') {
      sendResponse({ alive: true, aiType: AI_TYPE });
      return true;
    }

    if (message.type === 'INJECT_MESSAGE') {
      injectMessage(message.message)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'GET_LATEST_RESPONSE') {
      const response = getLatestResponse();
      sendResponse({ content: response });
      return true;
    }

    if (message.type === 'NEW_CONVERSATION') {
      newConversation()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });

  setupResponseObserver();

  async function injectMessage(text) {
    if (isLoginVisible()) {
      throw new Error('未登录，请先在 Qwen 页面登录');
    }

    const inputEl = findInput();
    if (!inputEl) {
      throw new Error('Could not find input field');
    }

    inputEl.focus();

    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Slate editor
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      inputEl.textContent = '';
      document.execCommand('insertText', false, text);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await sleep(150);

    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error('Could not find send button');
    }

    await waitForButtonEnabled(sendButton);
    sendButton.click();

    console.log('[AI Panel] Qwen message sent, starting response capture...');
    waitForStreamingComplete();

    return true;
  }

  function findInput() {
    const selectors = [
      '[contenteditable="true"][data-slate-editor="true"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="千问"]',
      'textarea'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return el;
    }

    return null;
  }

  function findSendButton() {
    const icon = document.querySelector('[data-icon-type="qwpcicon-sendChat"]');
    if (icon) {
      const container = icon.closest('div');
      if (container && isVisible(container)) return container;
    }

    const candidates = document.querySelectorAll('[class*="operateBtn"], [class*="send"], button');
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const text = (el.textContent || '').toLowerCase();
      if (label.includes('发送') || label.includes('send') || text.includes('发送') || text.includes('send')) {
        return el;
      }
    }

    return null;
  }

  async function waitForButtonEnabled(button, maxWait = 2000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const isDisabled = button.classList?.contains('disabled-ZaDDJC') ||
        button.getAttribute('aria-disabled') === 'true' ||
        button.style.pointerEvents === 'none';
      if (!isDisabled) return;
      await sleep(50);
    }
  }

  function setupResponseObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!isContextValid()) {
        observer.disconnect();
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              checkForResponse(node);
            }
          }
        }
      }
    });

    const startObserving = () => {
      if (!isContextValid()) return;
      const mainContent = document.querySelector('#qianwen-main-area') || document.body;
      observer.observe(mainContent, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving);
    } else {
      startObserving();
    }
  }

  let lastCapturedContent = '';
  let isCapturing = false;
  let captureStartTime = 0;

  function checkForResponse(node) {
    if (isCapturing) return;

    const responseSelectors = [
      '[data-message-author-role="assistant"]',
      '[data-role="assistant"]',
      '[class*="assistant"]',
      '[class*="message"]',
      '[class*="markdown"]',
      '[class*="answer"]'
    ];

    for (const selector of responseSelectors) {
      if (node.matches?.(selector) || node.querySelector?.(selector)) {
        waitForStreamingComplete();
        break;
      }
    }
  }

  async function waitForStreamingComplete() {
    if (isCapturing) {
      if (Date.now() - captureStartTime > 300000) {
        isCapturing = false;
      } else {
        return;
      }
    }

    isCapturing = true;
    captureStartTime = Date.now();

    let previousContent = '';
    let stableCount = 0;
    const maxWait = 600000;
    const checkInterval = 500;
    const stableThreshold = 4;
    const startTime = Date.now();

    try {
      while (Date.now() - startTime < maxWait) {
        if (!isContextValid()) return;

        await sleep(checkInterval);

        const isStreaming = document.querySelector('[class*="loading"]') ||
          document.querySelector('[class*="streaming"]') ||
          document.querySelector('[data-icon-type="qwpcicon-stop"]');

        const currentContent = getLatestResponse() || '';

        if (!isStreaming && currentContent === previousContent && currentContent.length > 0) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            if (currentContent !== lastCapturedContent) {
              lastCapturedContent = currentContent;
              safeSendMessage({
                type: 'RESPONSE_CAPTURED',
                aiType: AI_TYPE,
                content: currentContent
              });
            }
            return;
          }
        } else {
          stableCount = 0;
        }

        previousContent = currentContent;
      }
    } finally {
      isCapturing = false;
    }
  }

  function htmlToMarkdown(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);

    clone.querySelectorAll('button, .copy-btn, .sr-only').forEach(el => el.remove());

    clone.querySelectorAll('pre').forEach(pre => {
      const code = pre.querySelector('code');
      const langClass = code ? code.className : '';
      const langMatch = langClass.match(/language-(\w+)/) || pre.className.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : '';
      const content = code ? code.textContent : pre.textContent;
      pre.textContent = `\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
    });

    clone.querySelectorAll('code').forEach(el => {
      if (el.parentElement.tagName !== 'PRE') {
        el.textContent = `\`${el.textContent}\``;
      }
    });

    clone.querySelectorAll('p, div').forEach(el => {
      el.appendChild(document.createTextNode('\n\n'));
    });

    clone.querySelectorAll('strong, b').forEach(el => el.textContent = `**${el.textContent}**`);
    clone.querySelectorAll('em, i').forEach(el => el.textContent = `*${el.textContent}*`);
    clone.querySelectorAll('li').forEach(el => el.textContent = `- ${el.textContent}\n`);

    clone.querySelectorAll('a').forEach(el => {
      const href = el.getAttribute('href');
      if (href) el.textContent = `[${el.textContent}](${href})`;
    });

    return clone.textContent.trim().replace(/\n{3,}/g, '\n\n');
  }

  function getLatestResponse() {
    const root = document.querySelector('#qianwen-main-area') || document.body;

    const candidates = Array.from(root.querySelectorAll('div, section, article'))
      .filter(el => {
        if (!el || !el.innerText) return false;
        if (el.closest('.inputContainer-SHGMBo') || el.closest('.chatInput-dXdYNh')) return false;
        const text = el.innerText.trim();
        return text.length > 0;
      });

    let best = null;
    let maxLength = 0;

    for (const el of candidates) {
      const text = (el.innerText || '').trim();
      if (text.length > maxLength) {
        maxLength = text.length;
        best = el;
      }
    }

    if (best) {
      return htmlToMarkdown(best);
    }

    return null;
  }

  async function newConversation() {
    const candidates = Array.from(document.querySelectorAll('button'));
    const target = candidates.find(el => (el.textContent || '').includes('新对话'));
    if (target) {
      target.click();
      return true;
    }
    window.location.href = 'https://www.qianwen.com/';
    return true;
  }

  function isLoginVisible() {
    const loginButton = Array.from(document.querySelectorAll('button, a'))
      .find(el => (el.textContent || '').includes('登录'));
    return !!loginButton;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  console.log('[AI Panel] Qwen content script loaded');
})();
