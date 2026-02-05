// AI Panel - Grok Content Script

(function () {
  'use strict';

  const AI_TYPE = 'grok';

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
    const inputSelectors = [
      'textarea[data-testid*="grok"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      'textarea[aria-label*="Ask"]',
      'textarea[aria-label*="Message"]',
      'div[contenteditable="true"]',
      'textarea'
    ];

    let inputEl = null;
    for (const selector of inputSelectors) {
      const candidate = document.querySelector(selector);
      if (candidate && isVisible(candidate)) {
        inputEl = candidate;
        break;
      }
    }

    if (!inputEl) {
      throw new Error('Could not find input field (please make sure Grok chat is open and logged in)');
    }

    inputEl.focus();

    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      inputEl.textContent = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await sleep(150);

    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error('Could not find send button');
    }

    await waitForButtonEnabled(sendButton);
    sendButton.click();

    console.log('[AI Panel] Grok message sent, starting response capture...');
    waitForStreamingComplete();

    return true;
  }

  function findSendButton() {
    const selectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="Submit"]',
      'button[type="submit"]',
      'button[data-testid*="send"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        return el.closest('button') || el;
      }
    }

    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').toLowerCase();
      if (label.includes('send') || label.includes('submit') || text.includes('send')) {
        return btn;
      }
      if (btn.querySelector('svg') && (label.includes('grok') || text.includes('grok'))) {
        return btn;
      }
    }

    return null;
  }

  async function waitForButtonEnabled(button, maxWait = 2000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const isDisabled = !!button.disabled ||
        button.getAttribute('aria-disabled') === 'true' ||
        button.classList.contains('disabled') ||
        button.style.opacity === '0' ||
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
      const mainContent = document.querySelector('main') || document.body;
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
      '[data-testid*="assistant"]',
      '[class*="assistant"]',
      '[class*="response"]'
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
          document.querySelector('button[aria-label*="Stop"]');

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
    const containerSelectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="assistant"]',
      'main article',
      'main [class*="assistant"]',
      'main [class*="message"]',
      'main .prose',
      '.prose'
    ];

    let bestContent = null;
    let maxLength = 0;

    for (const selector of containerSelectors) {
      try {
        const containers = document.querySelectorAll(selector);
        if (containers.length > 0) {
          const lastContainer = containers[containers.length - 1];
          const content = htmlToMarkdown(lastContainer);
          if (content.length > maxLength) {
            maxLength = content.length;
            bestContent = content;
          }
        }
      } catch (e) {
        console.log('[AI Panel] Grok selector error:', e.message);
      }
    }

    if (bestContent) {
      return bestContent;
    }

    const fallback = document.querySelector('main');
    return fallback ? fallback.innerText : null;
  }

  async function newConversation() {
    const candidates = Array.from(document.querySelectorAll('button, a'));
    const target = candidates.find(el => {
      const text = (el.textContent || '').toLowerCase();
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      return text.includes('new') || label.includes('new') || text.includes('new chat') || label.includes('new chat');
    });

    if (target) {
      target.click();
      return true;
    }

    window.location.href = 'https://grok.com/';
    return true;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  console.log('[AI Panel] Grok content script loaded');
})();
