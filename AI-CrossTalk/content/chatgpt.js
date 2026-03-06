// AI Panel - ChatGPT Content Script

(function () {
  'use strict';

  const AI_TYPE = 'chatgpt';

  // Check if extension context is still valid
  function isContextValid() {
    return chrome.runtime && chrome.runtime.id;
  }

  // Safe message sender that checks context first
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

  // Notify background that content script is ready
  safeSendMessage({ type: 'CONTENT_SCRIPT_READY', aiType: AI_TYPE });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle heartbeat and ping messages
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

  // Setup response observer for cross-reference feature
  setupResponseObserver();

  async function injectMessage(text) {
    // ChatGPT uses a textarea or contenteditable div
    const inputSelectors = [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'div[contenteditable="true"][data-placeholder]',
      'textarea[placeholder*="Message"]',
      'textarea'
    ];

    let inputEl = null;
    for (const selector of inputSelectors) {
      inputEl = document.querySelector(selector);
      if (inputEl) break;
    }

    if (!inputEl) {
      throw new Error('Could not find input field');
    }

    // Focus the input
    inputEl.focus();

    // Handle different input types
    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Contenteditable div
      inputEl.textContent = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Small delay to let React process
    await sleep(100);

    // Find and click the send button
    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error('Could not find send button');
    }

    // Wait for button to be enabled
    await waitForButtonEnabled(sendButton);

    sendButton.click();

    // Start capturing response after sending
    console.log('[AI Panel] ChatGPT message sent, starting response capture...');
    pendingBaselineContent = getLatestResponse() || '';
    waitForStreamingComplete();

    return true;
  }

  function findSendButton() {
    // ChatGPT's send button
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'form button[type="submit"]',
      'button svg path[d*="M15.192"]' // Arrow icon path
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el.closest('button') || el;
      }
    }

    // Fallback: find button near the input
    const form = document.querySelector('form');
    if (form) {
      const buttons = form.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.querySelector('svg') && isVisible(btn)) {
          return btn;
        }
      }
    }

    return null;
  }

  async function waitForButtonEnabled(button, maxWait = 2000) {
    const start = Date.now();
    // Wait for button to be clickable (not disabled and not aria-disabled)
    while (Date.now() - start < maxWait) {
      const isDisabled = !!button.disabled ||
        button.getAttribute('aria-disabled') === 'true' ||
        button.classList.contains('disabled') ||
        button.style.opacity === '0' ||
        button.style.pointerEvents === 'none';
      if (!isDisabled) {
        console.log('[AI Panel] ChatGPT button is enabled, proceeding with click');
        return;
      }
      await sleep(50);
    }
    console.log('[AI Panel] ChatGPT button still disabled after wait, clicking anyway');
  }

  function setupResponseObserver() {
    const observer = new MutationObserver((mutations) => {
      // Check context validity in observer callback
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
        } else if (mutation.type === 'characterData') {
          const target = mutation.target?.parentElement;
          if (target) {
            checkForResponse(target);
          }
        }
      }
    });

    const startObserving = () => {
      if (!isContextValid()) return;
      const mainContent = document.querySelector('main') || document.body;
      observer.observe(mainContent, {
        childList: true,
        characterData: true,
        subtree: true
      });
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
  let pendingBaselineContent = '';

  function checkForResponse(node) {
    if (isCapturing) return;

    const responseSelectors = [
      '[data-message-author-role="assistant"]',
      '.agent-turn',
      '[class*="assistant"]'
    ];

    for (const selector of responseSelectors) {
      if (node.matches?.(selector) || node.querySelector?.(selector)) {
        console.log('[AI Panel] ChatGPT detected new response...');
        waitForStreamingComplete();
        break;
      }
    }
  }

  async function waitForStreamingComplete() {
    console.log('[AI Panel] ChatGPT waitForStreamingComplete called, isCapturing:', isCapturing);

    if (isCapturing) {
      // Check if stuck for more than 5 minutes, reset if so
      if (Date.now() - captureStartTime > 300000) {
        console.log('[AI Panel] ChatGPT capture stuck, resetting isCapturing flag');
        isCapturing = false;
      } else {
        console.log('[AI Panel] ChatGPT already capturing, skipping...');
        return;
      }
    }
    isCapturing = true;
    captureStartTime = Date.now();
    console.log('[AI Panel] ChatGPT starting capture loop...');

    let previousContent = '';
    let stableCount = 0;
    const maxWait = 600000;  // 10 minutes - AI responses can be very long
    const checkInterval = 500;
    const stableThreshold = 3;  // 1.5 seconds stable after stream stops
    const baselineContent = pendingBaselineContent;

    const startTime = Date.now();
    let hasSeenStreaming = false;
    let hasSeenNewContent = false;

    try {
      while (Date.now() - startTime < maxWait) {
        if (!isContextValid()) {
          console.log('[AI Panel] Context invalidated, stopping capture');
          return;
        }

        await sleep(checkInterval);

        const isStreaming = isGeneratingNow();
        const currentContent = getLatestResponse() || '';

        if (isStreaming) {
          hasSeenStreaming = true;
        }
        if (currentContent.length > 0 && currentContent !== baselineContent) {
          hasSeenNewContent = true;
        }

        // Debug: log every 10 seconds
        const elapsed = Date.now() - startTime;
        if (elapsed % 10000 < checkInterval) {
          console.log(`[AI Panel] ChatGPT check: contentLen=${currentContent.length}, streaming=${isStreaming}, stableCount=${stableCount}, elapsed=${Math.round(elapsed / 1000)}s`);
        }

        if (!hasSeenNewContent && !hasSeenStreaming) {
          previousContent = currentContent;
          continue;
        }

        // Never finalize while still streaming
        if (isStreaming) {
          stableCount = 0;
          previousContent = currentContent;
          continue;
        }

        const contentStable = currentContent === previousContent && currentContent.length > 0;

        if (contentStable) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            if (currentContent !== lastCapturedContent) {
              lastCapturedContent = currentContent;
              console.log('[AI Panel] ChatGPT capturing response, length:', currentContent.length);
              safeSendMessage({
                type: 'RESPONSE_CAPTURED',
                aiType: AI_TYPE,
                content: currentContent
              });
              console.log('[AI Panel] ChatGPT response captured and sent!');
            } else {
              console.log('[AI Panel] ChatGPT content same as last capture, skipping');
            }
            return;
          }
        } else {
          stableCount = 0;
        }

        previousContent = currentContent;
      }
      console.log('[AI Panel] ChatGPT capture timeout after', maxWait / 1000, 'seconds');
    } finally {
      isCapturing = false;
      console.log('[AI Panel] ChatGPT capture loop ended');
    }
  }

  function getLatestResponse() {
    const containerSelectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="conversation-turn"]',
      '.agent-turn',
      'article'
    ];

    let containers = [];
    for (const selector of containerSelectors) {
      containers = Array.from(document.querySelectorAll(selector)).filter(el => {
        if (selector === '[data-message-author-role="assistant"]') return true;
        return !!el.querySelector?.('[data-message-author-role="assistant"]');
      });
      if (containers.length > 0) break;
    }

    if (containers.length === 0) {
      return null;
    }

    const lastContainer = containers[containers.length - 1];
    const markdownBlocks = Array.from(
      lastContainer.querySelectorAll('.markdown, [class*="markdown"]')
    );

    if (markdownBlocks.length > 0) {
      const segments = markdownBlocks
        .map(block => block.innerHTML.trim())
        .filter(Boolean)
        .map(html => htmlToMarkdown(html).trim())
        .filter(Boolean);

      if (segments.length > 0) {
        return segments.join('\n\n');
      }
    }

    const plainText = (lastContainer.innerText || '').trim();
    return plainText || null;
  }

  function isGeneratingNow() {
    const selectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[title*="Stop"]'
    ];

    return selectors.some(selector => {
      const el = document.querySelector(selector);
      return !!el && isVisible(el);
    });
  }

  // Utility functions
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function htmlToMarkdown(html) {
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    function processNode(node, context = { listDepth: 0, orderedIndex: 0 }) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const tag = node.tagName.toLowerCase();

      switch (tag) {
        case 'h1':
          return `# ${getTextContent(node)}\n\n`;
        case 'h2':
          return `## ${getTextContent(node)}\n\n`;
        case 'h3':
          return `### ${getTextContent(node)}\n\n`;
        case 'h4':
          return `#### ${getTextContent(node)}\n\n`;
        case 'h5':
          return `##### ${getTextContent(node)}\n\n`;
        case 'h6':
          return `###### ${getTextContent(node)}\n\n`;
        case 'strong':
        case 'b':
          return `**${processChildren(node, context)}**`;
        case 'em':
        case 'i':
          return `*${processChildren(node, context)}*`;
        case 'code':
          // Inline code (not inside pre)
          if (node.parentElement?.tagName.toLowerCase() !== 'pre') {
            return `\`${node.textContent}\``;
          }
          return node.textContent;
        case 'pre': {
          const codeEl = node.querySelector('code');
          const codeText = codeEl ? codeEl.textContent : node.textContent;
          // Extract language from class (e.g., language-javascript, hljs language-python)
          let lang = '';
          const langClass = (codeEl?.className || node.className || '').match(/language-(\w+)/);
          if (langClass) lang = langClass[1];
          return `\n\`\`\`${lang}\n${codeText.trim()}\n\`\`\`\n\n`;
        }
        case 'p':
          return `${processChildren(node, context)}\n\n`;
        case 'br':
          return '\n';
        case 'hr':
          return '---\n\n';
        case 'ul': {
          const items = Array.from(node.children)
            .filter(c => c.tagName.toLowerCase() === 'li')
            .map(li => processListItem(li, false, 0, context.listDepth))
            .join('');
          return items + '\n';
        }
        case 'ol': {
          const items = Array.from(node.children)
            .filter(c => c.tagName.toLowerCase() === 'li')
            .map((li, idx) => processListItem(li, true, idx + 1, context.listDepth))
            .join('');
          return items + '\n';
        }
        case 'li':
          // Handled by ul/ol
          return processChildren(node, context);
        case 'a': {
          const href = node.getAttribute('href') || '';
          return `[${processChildren(node, context)}](${href})`;
        }
        case 'blockquote': {
          const content = processChildren(node, context).trim().split('\n').map(line => `> ${line}`).join('\n');
          return `${content}\n\n`;
        }
        case 'table':
          return processTable(node) + '\n';
        case 'thead':
        case 'tbody':
        case 'tfoot':
          return processChildren(node, context);
        case 'tr':
        case 'th':
        case 'td':
          // Handled by processTable
          return processChildren(node, context);
        case 'div':
        case 'span':
        case 'section':
        case 'article':
          return processChildren(node, context);
        default:
          return processChildren(node, context);
      }
    }

    function processChildren(node, context) {
      return Array.from(node.childNodes).map(child => processNode(child, context)).join('');
    }

    function getTextContent(node) {
      return processChildren(node, { listDepth: 0, orderedIndex: 0 }).trim();
    }

    function processListItem(li, isOrdered, index, depth) {
      const indent = '  '.repeat(depth);
      const prefix = isOrdered ? `${index}. ` : '- ';
      
      // Process direct text content and nested elements
      let content = '';
      let hasNestedList = false;
      
      for (const child of li.childNodes) {
        const tag = child.tagName?.toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          hasNestedList = true;
          // Process nested list with increased depth
          const nestedItems = Array.from(child.children)
            .filter(c => c.tagName.toLowerCase() === 'li')
            .map((nestedLi, idx) => processListItem(nestedLi, tag === 'ol', idx + 1, depth + 1))
            .join('');
          content += '\n' + nestedItems;
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          content += processNode(child, { listDepth: depth, orderedIndex: 0 });
        }
      }
      
      // Clean up content
      content = content.trim().replace(/\n\n+/g, '\n');
      
      if (hasNestedList) {
        const lines = content.split('\n');
        const firstLine = lines[0];
        const rest = lines.slice(1).join('\n');
        return `${indent}${prefix}${firstLine}\n${rest}`;
      }
      
      return `${indent}${prefix}${content}\n`;
    }

    function processTable(table) {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return '';

      let result = '';
      let isFirstRow = true;

      for (const row of rows) {
        const cells = row.querySelectorAll('th, td');
        const cellContents = Array.from(cells).map(cell => 
          processChildren(cell, { listDepth: 0, orderedIndex: 0 }).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')
        );
        
        result += '| ' + cellContents.join(' | ') + ' |\n';
        
        // Add separator after header row
        if (isFirstRow) {
          result += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n';
          isFirstRow = false;
        }
      }

      return result;
    }

    // Process all child nodes
    let markdown = '';
    Array.from(temp.childNodes).forEach(node => {
      markdown += processNode(node, { listDepth: 0, orderedIndex: 0 });
    });

    // Clean up extra newlines
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown;
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  async function newConversation() {
    // Direct navigation is most reliable
    console.log('[AI Panel] ChatGPT: Starting new conversation via navigation');
    // Small delay to ensure response message is sent
    await sleep(100);
    window.location.href = 'https://chatgpt.com/';
    // Return success after triggering navigation
    return true;
  }

  console.log('[AI Panel] ChatGPT content script loaded');
})();
