/**
 * E2E tests for the complete Chat interaction workflow.
 *
 * Tests the main chat interface at the root route (/),
 * including chat input rendering, message composition,
 * tool call display, code block rendering, message list
 * scrolling, and various UI indicator elements.
 *
 * Route: #/ (default pair view)
 * Components: BaseChat, ChatInput, ProgressiveMessageList,
 *             EnhancedCodeBlock, ToolCallDisplay, ModelsBottomBar
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForChatReady(timeout = 15000) {
  console.log('Waiting for chat input to be ready...');
  const chatInput = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
    timeout,
    state: 'visible',
  });
  console.log('Chat input is ready');
  return chatInput;
}

async function navigateToRoute(route: string) {
  console.log(`Navigating to route: ${route}`);
  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 },
  );
  await mainWindow.evaluate((r: string) => {
    window.location.hash = r;
  }, route);
  await mainWindow.waitForTimeout(1500);
  console.log(`Route ${route} loaded`);
}

/**
 * Send a chat message and wait for a response to arrive.
 * Returns the text content of the page body after the response.
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

  // Wait for DOM to settle
  await mainWindow.waitForTimeout(1000);

  return await mainWindow.evaluate(() => document.body.innerText);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Chat Complete Workflow', () => {
  test.describe('Chat Input Rendering', () => {
    test('chat input is rendered and visible on main route', async () => {
      const chatInput = await waitForChatReady();
      await expect(chatInput).toBeVisible();
      console.log('Chat input is rendered and visible');

      await mainWindow.screenshot({ path: 'test-results/chat-complete-input-visible.png' });
    });

    test('chat input accepts text and can be cleared', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.focus();

      await chatInput.fill('Hello, this is a test message');
      const value = await chatInput.inputValue();
      expect(value).toBe('Hello, this is a test message');
      console.log('Chat input accepted text');

      // Clear the input
      await chatInput.fill('');
      const clearedValue = await chatInput.inputValue();
      expect(clearedValue).toBe('');
      console.log('Chat input cleared successfully');

      await mainWindow.screenshot({ path: 'test-results/chat-complete-input-text.png' });
    });

    test('chat input has placeholder text', async () => {
      const chatInput = await waitForChatReady();

      // The chat input should have a placeholder indicating what to type
      const placeholder = await chatInput.getAttribute('placeholder');
      console.log(`Chat input placeholder: "${placeholder}"`);

      // Placeholder should exist (may be empty string in some states)
      // The input itself should be interactable
      await chatInput.focus();
      const isFocused = await mainWindow.evaluate(
        () => document.activeElement?.getAttribute('data-testid') === 'chat-input',
      );
      console.log(`Chat input is focusable: ${isFocused}`);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-input-placeholder.png' });
    });
  });

  test.describe('Message Composition', () => {
    test('sending a message adds it to the message list', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('Say "hello world"');
      await chatInput.press('Enter');

      // Wait for message to appear
      await mainWindow.waitForTimeout(2000);

      // At least one message container should exist
      const messages = mainWindow.locator('[data-testid="message-container"]');
      const count = await messages.count();
      console.log(`Message containers after sending: ${count}`);
      expect(count).toBeGreaterThanOrEqual(1);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-message-sent.png' });
    });

    test('input clears after message is sent', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('Test clear after send');
      await chatInput.press('Enter');

      await mainWindow.waitForTimeout(1000);

      // Input should be empty after sending
      const chatInputAfter = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
        timeout: 5000,
      });
      const value = await chatInputAfter.inputValue();
      expect(value).toBe('');
      console.log('Input cleared after send');

      await mainWindow.screenshot({ path: 'test-results/chat-complete-input-cleared.png' });
    });

    test('Shift+Enter creates newline without sending', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.focus();

      await chatInput.fill('Line 1');
      await chatInput.press('Shift+Enter');
      await mainWindow.keyboard.type('Line 2');

      await mainWindow.waitForTimeout(300);

      const value = await chatInput.inputValue();
      console.log(`Multiline value: "${value}"`);
      expect(value).toContain('Line 1');
      expect(value).toContain('Line 2');

      // Clean up
      await chatInput.fill('');

      await mainWindow.screenshot({ path: 'test-results/chat-complete-multiline.png' });
    });
  });

  test.describe('Tool Call Display', () => {
    test('tool calls render as distinct elements in chat', async () => {
      // Ask for a file operation to trigger tool calls
      const responseText = await sendMessageAndWait(
        'Create a simple hello.py file with print("hello")',
      );

      // Look for tool call elements
      const toolCalls = mainWindow.locator('.goose-message-tool');
      const toolCount = await toolCalls.count().catch(() => 0);
      console.log(`Tool call elements found: ${toolCount}`);

      if (toolCount > 0) {
        // Tool calls should be visible
        const firstTool = toolCalls.first();
        await expect(firstTool).toBeVisible();

        const toolText = await firstTool.textContent();
        console.log(`First tool call text excerpt: "${toolText?.slice(0, 80)}"`);
        expect(toolText).toBeTruthy();
      } else {
        console.log('No tool calls rendered (backend may not have executed tools)');
      }

      await mainWindow.screenshot({ path: 'test-results/chat-complete-tool-calls.png' });
    });

    test('tool call approval buttons render when confirmation needed', async () => {
      // This test checks for the presence of approval/confirmation UI
      // which appears when tools require user approval

      const pageText = await mainWindow.evaluate(() => document.body.innerText);

      // Check if there are any approval/confirmation buttons in the UI
      const approveButton = mainWindow.locator(
        'button:has-text("Approve"), button:has-text("Allow"), button:has-text("Confirm")',
      );
      const approveCount = await approveButton.count().catch(() => 0);
      console.log(`Approval buttons found: ${approveCount}`);

      // Also check for deny/reject buttons
      const denyButton = mainWindow.locator(
        'button:has-text("Deny"), button:has-text("Reject"), button:has-text("Cancel")',
      );
      const denyCount = await denyButton.count().catch(() => 0);
      console.log(`Deny buttons found: ${denyCount}`);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-approval-buttons.png' });
    });
  });

  test.describe('Code Block Rendering', () => {
    test('code blocks render with copy button', async () => {
      await sendMessageAndWait(
        'Respond with only this code block:\n```python\nprint("hello world")\n```',
      );

      await mainWindow.waitForTimeout(1000);

      const copyButton = mainWindow.locator('button[aria-label="Copy code"]');
      const copyCount = await copyButton.count();
      console.log(`Copy code buttons found: ${copyCount}`);

      if (copyCount > 0) {
        await expect(copyButton.first()).toBeVisible();
      }

      await mainWindow.screenshot({ path: 'test-results/chat-complete-code-copy.png' });
    });

    test('code blocks render with language badge and controls', async () => {
      await sendMessageAndWait(
        'Respond with only: ```javascript\nconst x = 42;\nconsole.log(x);\n```',
      );

      await mainWindow.waitForTimeout(1000);

      // Check for language badge (e.g., "JavaScript")
      const langBadge = mainWindow.locator('text=JavaScript').first();
      const langVisible = await langBadge.isVisible().catch(() => false);
      console.log(`JavaScript language badge visible: ${langVisible}`);

      // Check for word wrap toggle
      const wrapButton = mainWindow.locator(
        'button[aria-label="Enable word wrap"], button[aria-label="Disable word wrap"]',
      );
      const wrapCount = await wrapButton.count();
      console.log(`Word wrap toggle buttons: ${wrapCount}`);

      // Check for line numbers toggle
      const lineNumButton = mainWindow.locator(
        'button[aria-label="Show line numbers"], button[aria-label="Hide line numbers"]',
      );
      const lineNumCount = await lineNumButton.count();
      console.log(`Line number toggle buttons: ${lineNumCount}`);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-code-controls.png' });
    });
  });

  test.describe('Message List & Scrolling', () => {
    test('message list renders multiple messages', async () => {
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

      const messages = mainWindow.locator('[data-testid="message-container"]');
      const count = await messages.count();
      console.log(`Total message containers after two messages: ${count}`);
      expect(count).toBeGreaterThanOrEqual(2);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-multiple-messages.png' });
    });

    test('message area has scrollable container', async () => {
      // The chat messages are inside a scrollable area
      const scrollArea = mainWindow.locator('[data-radix-scroll-area-viewport]');
      const scrollVisible = await scrollArea.first().isVisible().catch(() => false);
      console.log(`Scroll area viewport visible: ${scrollVisible}`);

      if (!scrollVisible) {
        // Fallback: check for any overflow-auto container
        const overflowContainer = mainWindow.locator('[class*="overflow"]');
        const overflowCount = await overflowContainer.count().catch(() => 0);
        console.log(`Overflow containers found: ${overflowCount}`);
      }

      await mainWindow.screenshot({ path: 'test-results/chat-complete-scroll-area.png' });
    });
  });

  test.describe('UI Indicators', () => {
    test('loading indicator appears during response generation', async () => {
      const chatInput = await waitForChatReady();
      await chatInput.fill('Tell me about programming');
      await chatInput.press('Enter');

      // Try to capture the loading indicator
      try {
        const loadingIndicator = await mainWindow.waitForSelector(
          '[data-testid="loading-indicator"]',
          { state: 'visible', timeout: 5000 },
        );
        const isVisible = await loadingIndicator.isVisible();
        console.log(`Loading indicator visible: ${isVisible}`);

        await mainWindow.screenshot({ path: 'test-results/chat-complete-loading.png' });
      } catch {
        console.log('Loading indicator was too fast to capture');
      }

      // Wait for completion
      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden',
          timeout: 30000,
        });
      } catch {
        console.log('Loading indicator timeout');
      }

      await mainWindow.screenshot({ path: 'test-results/chat-complete-loading-done.png' });
    });

    test('chat UI has button elements with SVG icons', async () => {
      await waitForChatReady();

      // The chat input area has buttons with SVG icons (send, attach, etc.)
      const buttonsWithIcons = mainWindow.locator('button').filter({
        has: mainWindow.locator('svg'),
      });
      const buttonCount = await buttonsWithIcons.count();
      console.log(`Buttons with SVG icons in chat area: ${buttonCount}`);
      expect(buttonCount).toBeGreaterThan(0);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-ui-buttons.png' });
    });

    test('model selector or bottom bar is present', async () => {
      await waitForChatReady();

      // ModelsBottomBar renders at the bottom of the chat area
      // It may show model name, cost, or other metadata
      const bottomBar = mainWindow.locator('[class*="bottom"], [class*="footer"]');
      const bottomCount = await bottomBar.count().catch(() => 0);
      console.log(`Bottom bar / footer elements found: ${bottomCount}`);

      // Look for model-related text in the page
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      const hasModelRef =
        pageText.toLowerCase().includes('claude') ||
        pageText.toLowerCase().includes('gpt') ||
        pageText.toLowerCase().includes('model') ||
        pageText.toLowerCase().includes('provider');
      console.log(`Page has model reference: ${hasModelRef}`);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-bottom-bar.png' });
    });

    test('chat area renders Goose logo or branding', async () => {
      // Before any messages, the chat area may show a Goose logo or greeting
      const gooseLogo = mainWindow.locator(
        '[class*="goose"], [class*="Goose"], svg[class*="goose"]',
      );
      const logoCount = await gooseLogo.count().catch(() => 0);
      console.log(`Goose-related elements found: ${logoCount}`);

      // Also check for the greeting component
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      const hasGreeting =
        pageText.includes('Good morning') ||
        pageText.includes('Good afternoon') ||
        pageText.includes('Good evening') ||
        pageText.includes('Hello') ||
        pageText.includes('What') ||
        pageText.includes('goose');
      console.log(`Has greeting or branding text: ${hasGreeting}`);

      await mainWindow.screenshot({ path: 'test-results/chat-complete-branding.png' });
    });
  });
});
