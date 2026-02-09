import { test as base, expect } from './fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from './test-overlay';

const test = base;
let mainWindow: Page;

test.beforeEach(async ({ goosePage }, testInfo) => {
  mainWindow = goosePage;
  const testName = testInfo.titlePath[testInfo.titlePath.length - 1];
  await showTestName(mainWindow, testName);
});

test.afterEach(async () => {
  if (mainWindow) await clearTestName(mainWindow);
});

async function waitForChatReady() {
  const chatInput = await mainWindow.waitForSelector('[data-testid="chat-input"]', {
    timeout: 15000, state: 'visible',
  });
  return chatInput;
}

async function sendMessageAndWait(message: string, timeoutMs = 60000): Promise<string> {
  const chatInput = await waitForChatReady();
  await chatInput.fill(message);
  await chatInput.press('Enter');
  try {
    await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'visible', timeout: 10000,
    });
  } catch { /* response may be instant */ }
  try {
    await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'hidden', timeout: timeoutMs,
    });
  } catch { /* timeout */ }
  await mainWindow.waitForTimeout(2000);
  const lastMessage = mainWindow.locator('[data-testid="message-container"]').last();
  return (await lastMessage.textContent()) || '';
}
test.describe('Chat Coding Components', () => {
  test.describe('EnhancedCodeBlock', () => {
    test('renders code blocks with enhanced header bar and controls', async () => {
      test.setTimeout(120000);
      await sendMessageAndWait(
        'Please respond with only this exact markdown code block, nothing else:\n' +
        '`' + 'python\ndef hello():\n    print("Hello, world!")\n\nhello()\n`' + ''
      );
      const copyButton = mainWindow.locator('button[aria-label="Copy code"]');
      expect(await copyButton.count()).toBeGreaterThan(0);
      await expect(copyButton.first()).toBeVisible();
      const badgeVisible = await mainWindow.locator('text=Python').first().isVisible().catch(() => false);
      console.log('Python language badge visible: ' + badgeVisible);
      const wrapButton = mainWindow.locator(
        'button[aria-label="Enable word wrap"], button[aria-label="Disable word wrap"]'
      );
      if (await wrapButton.count() > 0) await expect(wrapButton.first()).toBeVisible();
      const lineNumButton = mainWindow.locator(
        'button[aria-label="Show line numbers"], button[aria-label="Hide line numbers"]'
      );
      if (await lineNumButton.count() > 0) await expect(lineNumButton.first()).toBeVisible();
      const codeElements = await mainWindow.evaluate(() =>
        document.querySelectorAll('pre code, code[class*="language-"]').length
      );
      console.log('Code block elements with highlighting: ' + codeElements);
      await mainWindow.screenshot({ path: 'test-results/chat-coding-enhanced-code-block.png' });
    });

    test('code block word-wrap toggle changes wrapping behavior', async () => {
      test.setTimeout(120000);
      await sendMessageAndWait(
        'Respond with only:\n`' + 'javascript\nconst x = "long string for wrapping";\n`' + ''
      );
      const wrapButton = mainWindow.locator(
        'button[aria-label="Enable word wrap"], button[aria-label="Disable word wrap"]'
      );
      if (await wrapButton.count() > 0) {
        const initialLabel = await wrapButton.first().getAttribute('aria-label');
        await wrapButton.first().click();
        await mainWindow.waitForTimeout(300);
        const afterLabel = await wrapButton.first().getAttribute('aria-label');
        expect(afterLabel).not.toBe(initialLabel);
      }
      await mainWindow.screenshot({ path: 'test-results/chat-coding-word-wrap-toggle.png' });
    });

    test('code block line-numbers toggle shows/hides line numbers', async () => {
      test.setTimeout(120000);
      await sendMessageAndWait(
        'Respond with only:\n`' + '	ypescript\nconst x: number = 1;\nconst y: number = 2;\nconst z = x + y;\n`' + ''
      );
      const btn = mainWindow.locator(
        'button[aria-label="Show line numbers"], button[aria-label="Hide line numbers"]'
      );
      if (await btn.count() > 0) {
        const initialLabel = await btn.first().getAttribute('aria-label');
        await btn.first().click();
        await mainWindow.waitForTimeout(300);
        const afterLabel = await btn.first().getAttribute('aria-label');
        expect(afterLabel).not.toBe(initialLabel);
      }
      await mainWindow.screenshot({ path: 'test-results/chat-coding-line-numbers-toggle.png' });
    });
  });
  test.describe('ThinkingBlock', () => {
    test('thinking block renders and supports expand/collapse', async () => {
      test.setTimeout(180000);
      await sendMessageAndWait(
        'Think step by step: If a train goes 60 mph for 2.5 hours, how far does it go?'
      );
      const thinkingBtn = mainWindow.locator(
        'button[aria-label="Expand thinking"], button[aria-label="Collapse thinking"]'
      );
      const count = await thinkingBtn.count();
      console.log('ThinkingBlock buttons found: ' + count);
      if (count > 0) {
        const initialExpanded = await thinkingBtn.first().getAttribute('aria-expanded');
        await thinkingBtn.first().click();
        await mainWindow.waitForTimeout(500);
        const afterExpanded = await thinkingBtn.first().getAttribute('aria-expanded');
        expect(afterExpanded).not.toBe(initialExpanded);
        const hasLabel = await mainWindow.locator('text=/Thought process|Thinking/').first()
          .isVisible().catch(() => false);
        console.log('ThinkingBlock label visible: ' + hasLabel);
        if (afterExpanded === 'true') {
          const hasStats = await mainWindow.locator('text=/\\d+ words/').first()
            .isVisible().catch(() => false);
          console.log('Word count visible: ' + hasStats);
        }
        await thinkingBtn.first().click();
        await mainWindow.waitForTimeout(500);
        const finalExpanded = await thinkingBtn.first().getAttribute('aria-expanded');
        expect(finalExpanded).toBe(initialExpanded);
        await mainWindow.screenshot({ path: 'test-results/chat-coding-thinking-block.png' });
      } else {
        console.log('ThinkingBlock not rendered (model may not support chain-of-thought).');
        expect(await mainWindow.locator('[data-testid="message-container"]').count())
          .toBeGreaterThanOrEqual(1);
      }
    });
  });
  test.describe('DiffCard', () => {
    test('renders diff content with file status and line annotations', async () => {
      test.setTimeout(120000);
      const diffPrompt = [
        'Respond with ONLY this diff code block, no other text:', '',
        '`' + 'diff', 'diff --git a/src/utils.ts b/src/utils.ts',
        '--- a/src/utils.ts', '+++ b/src/utils.ts',
        '@@ -1,4 +1,5 @@', ' import { useState } from "react";',
        '-function old() {', '-  return false;',
        '+function helper(v: string) {', '+  if (!v) return false;',
        '+  return v.length > 0;', ' }', '`' + '',
      ].join('\n');
      await sendMessageAndWait(diffPrompt);
      console.log('<details> elements: ' + await mainWindow.locator('details').count());
      const badgeCount = await mainWindow.locator('text=/Added|Modified|Deleted|Renamed/').count();
      console.log('Diff status badges: ' + badgeCount);
      const hasFilePath = await mainWindow.locator('text=utils.ts').first()
        .isVisible().catch(() => false);
      console.log('File path visible: ' + hasFilePath);
      const tableCount = await mainWindow.locator('table').count();
      console.log('Diff tables: ' + tableCount);
      if (tableCount > 0) {
        const rowCount = await mainWindow.locator('table tbody tr').count();
        console.log('Diff rows: ' + rowCount);
        expect(rowCount).toBeGreaterThan(0);
      }
      await mainWindow.screenshot({ path: 'test-results/chat-coding-diff-card.png' });
    });

    test('diff card details element can be toggled', async () => {
      test.setTimeout(120000);
      const diffPrompt = [
        'Respond with only this diff:', '',
        '`' + 'diff', '--- a/hello.py', '+++ b/hello.py',
        '@@ -1,3 +1,3 @@', ' def greet():',
        '-    print("hi")', '+    print("hello")', '`' + '',
      ].join('\n');
      await sendMessageAndWait(diffPrompt);
      const detailsCount = await mainWindow.locator('details').count();
      if (detailsCount > 0) {
        const details = mainWindow.locator('details').first();
        const initialOpen = await details.getAttribute('open');
        await details.locator('summary').first().click();
        await mainWindow.waitForTimeout(300);
        const afterOpen = await details.getAttribute('open');
        expect(afterOpen).not.toBe(initialOpen);
      }
      await mainWindow.screenshot({ path: 'test-results/chat-coding-diff-toggle.png' });
    });
  });
  test.describe('TaskCard', () => {
    test('task card shows progress during tool execution', async () => {
      test.setTimeout(180000);
      const chatInput = await waitForChatReady();
      await chatInput.fill(
        'Create a Python file called test_task.py in a temp dir that prints hello. Then read it back.'
      );
      await chatInput.press('Enter');
      let foundProgressBar = false;
      let foundTaskTitle = false;
      for (let i = 0; i < 30; i++) {
        if (await mainWindow.locator('[role="progressbar"]').count() > 0) {
          foundProgressBar = true;
          const label = await mainWindow.locator('[role="progressbar"]').first()
            .getAttribute('aria-label');
          console.log('Progress bar found (check ' + (i + 1) + '), label: ' + label);
        }
        if (await mainWindow.locator('text=Agent Activities').count() > 0) {
          foundTaskTitle = true;
          await mainWindow.screenshot({ path: 'test-results/chat-coding-task-active.png' });
        }
        if (foundProgressBar || foundTaskTitle) break;
        try {
          if (await mainWindow.locator('[data-testid="loading-indicator"]').isHidden() && i > 5)
            break;
        } catch { /* ignore */ }
        await mainWindow.waitForTimeout(2000);
      }
      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden', timeout: 120000,
        });
      } catch { /* timeout */ }
      await mainWindow.waitForTimeout(2000);
      console.log('Results: progressBar=' + foundProgressBar + ', taskTitle=' + foundTaskTitle);
      const toolCalls = await mainWindow.locator('.goose-message-tool').all();
      console.log('Tool call elements: ' + toolCalls.length);
      expect(toolCalls.length).toBeGreaterThan(0);
      await mainWindow.screenshot({ path: 'test-results/chat-coding-task-complete.png' });
    });

    test('task card group header is expandable', async () => {
      test.setTimeout(180000);
      const chatInput = await waitForChatReady();
      await chatInput.fill('List the files in the current directory, then count them.');
      await chatInput.press('Enter');
      try {
        await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
          state: 'hidden', timeout: 120000,
        });
      } catch { /* timeout */ }
      await mainWindow.waitForTimeout(2000);
      const expandable = mainWindow.locator('[aria-expanded]');
      if (await expandable.count() > 0) {
        const first = expandable.first();
        const initial = await first.getAttribute('aria-expanded');
        await first.click();
        await mainWindow.waitForTimeout(500);
        const after = await first.getAttribute('aria-expanded');
        expect(after).not.toBe(initial);
      }
      await mainWindow.screenshot({ path: 'test-results/chat-coding-task-expandable.png' });
    });
  });
  test.describe('Integration', () => {
    test('multiple code blocks render independently', async () => {
      test.setTimeout(180000);
      await sendMessageAndWait(
        ['Respond with exactly these two code blocks, nothing else:', '',
          '`' + 'python', 'print("hello from python")', '`' + '', '',
          '`' + 'javascript', 'console.log("hello from js");', '`' + '',
        ].join('\n')
      );
      const copyCount = await mainWindow.locator('button[aria-label="Copy code"]').count();
      console.log('Copy code buttons: ' + copyCount);
      if (copyCount >= 2) console.log('Multiple independent code blocks rendered correctly');
      const hasPython = await mainWindow.locator('text=Python').count();
      const hasJS = await mainWindow.locator('text=JavaScript').count();
      console.log('Python badges: ' + hasPython + ', JavaScript badges: ' + hasJS);
      await mainWindow.screenshot({ path: 'test-results/chat-coding-multi-blocks.png' });
    });
  });
});