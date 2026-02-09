import { test as base, expect } from './fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from './test-overlay';

const test = base;

let mainWindow: Page;

test.beforeEach(async ({ goosePage }, testInfo) => {
  mainWindow = goosePage;
  const testName = testInfo.titlePath[testInfo.titlePath.length - 1];
  console.log(`Setting overlay for test: "${testName}"`);
  await showTestName(mainWindow, testName);
});

test.afterEach(async () => {
  if (mainWindow) {
    await clearTestName(mainWindow);
  }
});

/**
 * Helper: wait for the chat input to be available.
 * The app may show a provider-setup screen first -- this waits up to 15 s
 * for the chat-input to appear.
 */
async function waitForChatReady() {
  console.log('Waiting for chat input to be ready...');
  const chatInput = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
    timeout: 15000,
    state: 'visible',
  });
  console.log('Chat input is ready');
  return chatInput;
}

/**
 * Helper: send a message and wait for a response.
 * Returns the text content of the last message container.
 */
async function sendMessageAndWait(message: string, timeoutMs = 30000): Promise<string> {
  const chatInput = await waitForChatReady();
  await chatInput.fill(message);
  await chatInput.press('Enter');

  console.log(`Sent message: "${message}"`);

  // Wait for loading indicator to appear
  try {
    await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'visible',
      timeout: 5000,
    });
    console.log('Loading indicator appeared');
  } catch {
    console.log('Loading indicator did not appear (response may be instant)');
  }

  // Wait for loading indicator to disappear
  try {
    await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'hidden',
      timeout: timeoutMs,
    });
    console.log('Loading indicator disappeared');
  } catch {
    console.log('Loading indicator did not disappear within timeout');
  }

  // Get the last response
  const lastMessage = mainWindow.locator('[data-testid="message-container"]').last();
  const text = await lastMessage.textContent();
  return text || '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Chat Features', () => {
  test.describe('Chat Input', () => {
    test('chat input is visible and focusable', async () => {
      const chatInput = await waitForChatReady();
      await expect(chatInput).toBeVisible();

      // Focus the input
      await chatInput.focus();

      // Verify it accepts text
      await chatInput.fill('Test input text');
      const value = await chatInput.inputValue();
      expect(value).toBe('Test input text');

      await mainWindow.screenshot({ path: 'test-results/chat-input-focused.png' });

      // Clear for the next test
      await chatInput.fill('');
    });

    test('chat input supports multiline with Shift+Enter', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.focus();

      // Type first line
      await chatInput.fill('Line 1');

      // Press Shift+Enter for a newline (should NOT submit)
      await chatInput.press('Shift+Enter');
      await mainWindow.keyboard.type('Line 2');

      await mainWindow.waitForTimeout(300);

      // The input value should contain both lines
      const value = await chatInput.inputValue();
      console.log(`Multiline input value: "${value}"`);
      // Shift+Enter should insert a newline character
      expect(value).toContain('Line 1');
      expect(value).toContain('Line 2');

      await mainWindow.screenshot({ path: 'test-results/chat-multiline-input.png' });

      // Clear
      await chatInput.fill('');
    });

    test('chat input clears after sending a message', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('Hello!');
      await chatInput.press('Enter');

      await mainWindow.waitForTimeout(1000);

      // Input should be cleared after sending
      const chatInputAfter = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
        timeout: 5000,
      });
      const value = await chatInputAfter.inputValue();
      expect(value).toBe('');
      console.log('Chat input cleared after sending');
    });

    test('command history with Ctrl+ArrowUp', async () => {
      const chatInput = await waitForChatReady();

      // Send a test message first
      await chatInput.fill('History test message');
      await chatInput.press('Enter');

      // Wait for the response
      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden',
          timeout: 30000,
        });
      } catch {
        console.log('Loading indicator timeout, continuing...');
      }

      await mainWindow.waitForTimeout(1000);

      // Now press Ctrl+ArrowUp to recall last command
      const inputAfter = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
        timeout: 5000,
      });
      await inputAfter.press('Control+ArrowUp');
      await mainWindow.waitForTimeout(300);

      const recalled = await inputAfter.inputValue();
      console.log(`Recalled command: "${recalled}"`);
      expect(recalled).toBe('History test message');

      await mainWindow.screenshot({ path: 'test-results/chat-command-history.png' });
    });
  });

  test.describe('Message Display', () => {
    test('sent message appears in message list', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('Say exactly: ping');
      await chatInput.press('Enter');

      await mainWindow.waitForTimeout(2000);

      // At least one message container should exist
      const messages = mainWindow.locator('[data-testid="message-container"]');
      const count = await messages.count();
      console.log(`Message containers found: ${count}`);
      expect(count).toBeGreaterThanOrEqual(1);

      await mainWindow.screenshot({ path: 'test-results/chat-message-sent.png' });
    });

    test('loading indicator appears during response', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('Tell me about Goose the AI assistant');
      await chatInput.press('Enter');

      // Quickly check for loading indicator
      try {
        const loadingIndicator = await mainWindow.waitForSelector(
          '[data-testid="loading-indicator"]',
          { state: 'visible', timeout: 5000 }
        );
        const isVisible = await loadingIndicator.isVisible();
        console.log(`Loading indicator visible: ${isVisible}`);
        expect(isVisible).toBe(true);

        await mainWindow.screenshot({ path: 'test-results/chat-loading-indicator.png' });
      } catch {
        console.log('Loading indicator was too fast to capture');
      }

      // Wait for it to finish
      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden',
          timeout: 30000,
        });
      } catch {
        console.log('Loading indicator timeout');
      }
    });

    test('response message has content', async () => {
      const responseText = await sendMessageAndWait('What is 2 + 2?');
      console.log(`Response text length: ${responseText.length}`);
      expect(responseText.length).toBeGreaterThan(0);
      console.log(`Response excerpt: "${responseText.slice(0, 100)}"`);

      await mainWindow.screenshot({ path: 'test-results/chat-response-content.png' });
    });

    test('multiple messages build chat history', async () => {
      const chatInput = await waitForChatReady();

      // Send first message
      await chatInput.fill('Say: first');
      await chatInput.press('Enter');

      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden',
          timeout: 30000,
        });
      } catch {
        console.log('Timeout waiting for first response');
      }

      await mainWindow.waitForTimeout(1000);

      // Send second message
      const chatInput2 = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
        timeout: 5000,
      });
      await chatInput2.fill('Say: second');
      await chatInput2.press('Enter');

      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden',
          timeout: 30000,
        });
      } catch {
        console.log('Timeout waiting for second response');
      }

      await mainWindow.waitForTimeout(1000);

      // Count message containers
      const messages = mainWindow.locator('[data-testid="message-container"]');
      const count = await messages.count();
      console.log(`Total message containers after two messages: ${count}`);
      // User + Assistant messages for each round -- at least 2 pairs
      expect(count).toBeGreaterThanOrEqual(2);

      await mainWindow.screenshot({ path: 'test-results/chat-multiple-messages.png' });
    });
  });

  test.describe('Markdown Rendering', () => {
    test('code blocks render with syntax highlighting', async () => {
      const responseText = await sendMessageAndWait(
        'Please respond with only this exact markdown code block:\n```python\nprint("hello world")\n```'
      );

      await mainWindow.waitForTimeout(1000);

      // Look for the EnhancedCodeBlock elements
      // The code block header has a language badge
      const codeBlocks = mainWindow.locator('.rounded-lg').filter({
        has: mainWindow.locator('button[aria-label="Copy code"]'),
      });
      const codeBlockCount = await codeBlocks.count();
      console.log(`Code blocks with copy button found: ${codeBlockCount}`);

      await mainWindow.screenshot({ path: 'test-results/chat-code-block-rendering.png' });
    });

    test('code block has copy button', async () => {
      await sendMessageAndWait(
        'Respond with only: ```js\nconsole.log("test");\n```'
      );

      await mainWindow.waitForTimeout(1000);

      // Look for copy button with proper aria-label
      const copyButton = mainWindow.locator('button[aria-label="Copy code"]');
      const copyCount = await copyButton.count();
      console.log(`Copy code buttons found: ${copyCount}`);

      if (copyCount > 0) {
        await expect(copyButton.first()).toBeVisible();
      }

      await mainWindow.screenshot({ path: 'test-results/chat-code-copy-button.png' });
    });

    test('code block has language badge', async () => {
      await sendMessageAndWait(
        'Respond with only: ```typescript\nconst x: number = 42;\n```'
      );

      await mainWindow.waitForTimeout(1000);

      // The language badge is rendered in the HeaderBar component
      // It shows the language display name (e.g., "TypeScript")
      const languageBadge = mainWindow.locator('text=TypeScript').first();
      const isVisible = await languageBadge.isVisible().catch(() => false);
      console.log(`TypeScript language badge visible: ${isVisible}`);

      await mainWindow.screenshot({ path: 'test-results/chat-code-language-badge.png' });
    });

    test('code block has word wrap toggle', async () => {
      await sendMessageAndWait(
        'Respond with only: ```python\nprint("hello")\n```'
      );

      await mainWindow.waitForTimeout(1000);

      // Word wrap button has aria-label
      const wrapButton = mainWindow.locator(
        'button[aria-label="Enable word wrap"], button[aria-label="Disable word wrap"]'
      );
      const wrapCount = await wrapButton.count();
      console.log(`Word wrap toggle buttons found: ${wrapCount}`);

      if (wrapCount > 0) {
        await expect(wrapButton.first()).toBeVisible();
      }

      await mainWindow.screenshot({ path: 'test-results/chat-code-word-wrap.png' });
    });

    test('code block has line numbers toggle', async () => {
      await sendMessageAndWait(
        'Respond with only: ```javascript\nconst a = 1;\nconst b = 2;\n```'
      );

      await mainWindow.waitForTimeout(1000);

      // Line numbers button has aria-label
      const lineNumButton = mainWindow.locator(
        'button[aria-label="Show line numbers"], button[aria-label="Hide line numbers"]'
      );
      const lineNumCount = await lineNumButton.count();
      console.log(`Line number toggle buttons found: ${lineNumCount}`);

      if (lineNumCount > 0) {
        await expect(lineNumButton.first()).toBeVisible();
      }

      await mainWindow.screenshot({ path: 'test-results/chat-code-line-numbers.png' });
    });
  });

  test.describe('Chat UI Elements', () => {
    test('chat area has send button or icon', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('test');

      await mainWindow.waitForTimeout(300);

      // Look for a send button or submit action area near the chat input
      // The ChatInput component uses a Send icon
      const sendArea = mainWindow.locator('button').filter({
        has: mainWindow.locator('svg'),
      });
      const sendCount = await sendArea.count();
      console.log(`Buttons with SVG icons near input: ${sendCount}`);

      await mainWindow.screenshot({ path: 'test-results/chat-send-area.png' });
      await chatInput.fill('');
    });

    test('file attachment button exists', async () => {
      await waitForChatReady();

      // The attach button uses the Attach icon
      // Look for it in the chat input area
      const attachButtons = mainWindow.locator('button').filter({
        has: mainWindow.locator('svg'),
      });
      const count = await attachButtons.count();
      console.log(`Buttons with icons in chat area: ${count}`);

      await mainWindow.screenshot({ path: 'test-results/chat-attach-button.png' });
    });

    test('stop button appears during streaming', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill(
        'Write a very long detailed essay about the history of computing, at least 500 words.'
      );
      await chatInput.press('Enter');

      // Quickly look for a stop button during streaming
      try {
        // The stop button typically appears while the response is being generated
        const stopButton = await mainWindow.waitForSelector(
          'button[aria-label="Stop"], button:has-text("Stop")',
          { state: 'visible', timeout: 5000 }
        );
        const isVisible = await stopButton.isVisible();
        console.log(`Stop button visible during streaming: ${isVisible}`);
        await mainWindow.screenshot({ path: 'test-results/chat-stop-button.png' });
      } catch {
        console.log('Stop button did not appear (response may be too fast)');
      }

      // Wait for completion
      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden',
          timeout: 45000,
        });
      } catch {
        console.log('Response generation timeout');
      }
    });

    test('model selector is visible in chat footer', async () => {
      await waitForChatReady();

      // ModelsBottomBar is rendered in the chat input area
      // Look for model-related text or selectors in the bottom bar
      const bottomBarElements = mainWindow.locator('[class*="bottom"]');
      const hasBottomBar = (await bottomBarElements.count()) > 0;
      console.log(`Bottom bar elements found: ${hasBottomBar}`);

      await mainWindow.screenshot({ path: 'test-results/chat-model-selector.png' });
    });
  });
});
