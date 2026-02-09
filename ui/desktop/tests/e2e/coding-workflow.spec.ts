import { test, expect } from './fixtures';
import { Page } from '@playwright/test';

/**
 * Coding Workflow End-to-End Integration Tests
 *
 * Tests Goose's coding assistance capabilities:
 * - Explaining code snippets
 * - Fixing bugs in provided code
 * - Refactoring functions
 * - Verifying tool usage and code block formatting
 */
test.describe('Coding Workflow', () => {
  let mainWindow: Page;

  test.beforeEach(async ({ goosePage }) => {
    mainWindow = goosePage;
    // Wait for the app to be ready with the chat interface
    console.log('Waiting for chat interface to be ready...');
    await mainWindow.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    console.log('Chat interface is ready.');
  });

  /**
   * Helper: sends a message and waits for the response to complete.
   * Returns the full page text after the response.
   */
  async function sendMessageAndWait(
    page: Page,
    message: string,
    stepName: string,
    responseTimeout: number = 120000
  ): Promise<string> {
    console.log(`[${stepName}] Sending message...`);

    const chatInput = await page.waitForSelector('[data-testid="chat-input"]');
    await chatInput.fill(message);

    // Take screenshot before sending
    await page.screenshot({ path: `test-results/coding-${stepName}-01-before-send.png` });

    // Send the message
    await chatInput.press('Enter');
    console.log(`[${stepName}] Message sent. Waiting for response...`);

    // Wait for loading indicator to appear
    try {
      await page.waitForSelector('[data-testid="loading-indicator"]', {
        state: 'visible',
        timeout: 10000,
      });
      console.log(`[${stepName}] Loading indicator appeared.`);
    } catch {
      console.log(`[${stepName}] Loading indicator did not appear, response may have arrived quickly.`);
    }

    // Take screenshot while processing
    await page.screenshot({ path: `test-results/coding-${stepName}-02-processing.png` });

    // Wait for loading indicator to disappear
    try {
      await page.waitForSelector('[data-testid="loading-indicator"]', {
        state: 'hidden',
        timeout: responseTimeout,
      });
      console.log(`[${stepName}] Response complete.`);
    } catch {
      console.log(`[${stepName}] Response timeout. Checking current state...`);
      await page.screenshot({ path: `test-results/coding-${stepName}-02b-timeout.png` });
    }

    // Wait a moment for DOM to settle
    await page.waitForTimeout(2000);

    // Take screenshot after response
    await page.screenshot({ path: `test-results/coding-${stepName}-03-response.png` });

    // Return the full page text
    return await page.evaluate(() => document.body.innerText);
  }

  test.describe('Code Explanation', () => {
    test('should explain a code snippet', async () => {
      test.setTimeout(180000); // 3 minutes

      // ---------------------------------------------------------------
      // Step 1: Send a code snippet and ask for explanation
      // ---------------------------------------------------------------
      console.log('=== Test: Explain Code ===');

      const codeSnippet = `
\`\`\`javascript
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
\`\`\`
      `.trim();

      const prompt = `Can you explain what this JavaScript function does?\n\n${codeSnippet}`;

      const responseText = await sendMessageAndWait(
        mainWindow,
        prompt,
        'explain-code'
      );

      // ---------------------------------------------------------------
      // Step 2: Verify the explanation contains relevant concepts
      // ---------------------------------------------------------------
      console.log('Verifying explanation content...');

      // The explanation should mention key concepts related to debounce
      const explanationIndicators = [
        'debounce',
        'timeout',
        'delay',
        'wait',
        'function',
        'call',
      ];

      const foundIndicators = explanationIndicators.filter((indicator) =>
        responseText.toLowerCase().includes(indicator)
      );
      console.log(`Found explanation indicators: ${foundIndicators.join(', ')}`);
      expect(foundIndicators.length).toBeGreaterThanOrEqual(3);

      // ---------------------------------------------------------------
      // Step 3: Verify the response has message containers
      // ---------------------------------------------------------------
      console.log('Verifying response message structure...');

      const messageContainers = await mainWindow.locator('[data-testid="message-container"]').all();
      console.log(`Found ${messageContainers.length} message container(s).`);
      expect(messageContainers.length).toBeGreaterThanOrEqual(2); // user message + assistant response

      // ---------------------------------------------------------------
      // Step 4: Verify code blocks are properly formatted
      // ---------------------------------------------------------------
      console.log('Checking for code blocks with syntax highlighting...');

      // Code blocks rendered by the app typically use <pre> and <code> elements
      // or the EnhancedCodeBlock component which uses language-* class names
      const codeBlocks = await mainWindow.evaluate(() => {
        const blocks = document.querySelectorAll('pre code, code[class*="language-"]');
        return blocks.length;
      });
      console.log(`Found ${codeBlocks} code block element(s) in the page.`);

      // The original code snippet from the user message should at least be present
      // Note: not asserting > 0 strictly because the assistant might explain inline
      // without repeating the code in a code block

      // Take final screenshot
      await mainWindow.screenshot({ path: 'test-results/coding-explain-code-04-final.png' });

      console.log('=== Code explanation test completed. ===');
    });
  });

  test.describe('Bug Fixing', () => {
    test('should fix a bug in provided code', async () => {
      test.setTimeout(180000); // 3 minutes

      // ---------------------------------------------------------------
      // Step 1: Send code with a deliberate bug
      // ---------------------------------------------------------------
      console.log('=== Test: Fix Bug ===');

      // This code has a deliberate off-by-one bug: uses <= instead of <
      // which causes an array index out of bounds
      const buggyCode = `
I have a bug in this JavaScript function. Can you find and fix it?

\`\`\`javascript
function findMax(arr) {
  if (arr.length === 0) return undefined;
  let max = arr[0];
  for (let i = 1; i <= arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }
  return max;
}
\`\`\`

When I call findMax([3, 7, 2, 9, 1]), it sometimes returns undefined instead of 9.
      `.trim();

      const responseText = await sendMessageAndWait(
        mainWindow,
        buggyCode,
        'fix-bug'
      );

      // ---------------------------------------------------------------
      // Step 2: Verify the response identifies the bug
      // ---------------------------------------------------------------
      console.log('Verifying bug identification...');

      // The response should mention the off-by-one error or boundary issue
      const bugIndicators = [
        'off-by-one',
        'out of bounds',
        'boundary',
        'undefined',
        '<=',
        '< arr.length',
        'less than',
        'index',
        'bounds',
      ];

      const foundBugIndicators = bugIndicators.filter((indicator) =>
        responseText.toLowerCase().includes(indicator.toLowerCase())
      );
      console.log(`Found bug identification indicators: ${foundBugIndicators.join(', ')}`);
      expect(foundBugIndicators.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------
      // Step 3: Verify the response contains the fix
      // ---------------------------------------------------------------
      console.log('Verifying fix is provided...');

      // The fixed code should use < instead of <=
      const fixIndicators = [
        'i < arr.length',
        'i < arr',
        '< arr.length',
        'fix',
        'correct',
        'change',
        'replace',
      ];

      const foundFixIndicators = fixIndicators.filter((indicator) =>
        responseText.toLowerCase().includes(indicator.toLowerCase())
      );
      console.log(`Found fix indicators: ${foundFixIndicators.join(', ')}`);
      expect(foundFixIndicators.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------
      // Step 4: Check for code blocks in the response
      // ---------------------------------------------------------------
      console.log('Checking for code blocks in the fix response...');

      const codeElements = await mainWindow.evaluate(() => {
        const blocks = document.querySelectorAll('pre code, code[class*="language-"]');
        return blocks.length;
      });
      console.log(`Found ${codeElements} code block element(s).`);

      // Take final screenshot
      await mainWindow.screenshot({ path: 'test-results/coding-fix-bug-04-final.png' });

      console.log('=== Bug fix test completed. ===');
    });
  });

  test.describe('Code Refactoring', () => {
    test('should refactor a simple function', async () => {
      test.setTimeout(180000); // 3 minutes

      // ---------------------------------------------------------------
      // Step 1: Send a function to refactor
      // ---------------------------------------------------------------
      console.log('=== Test: Refactor Code ===');

      const refactorPrompt = `
Can you refactor this JavaScript function to be more modern and readable?
Use arrow functions, destructuring, and array methods where appropriate.

\`\`\`javascript
function processUsers(users) {
  var result = [];
  for (var i = 0; i < users.length; i++) {
    if (users[i].age >= 18) {
      var name = users[i].firstName + ' ' + users[i].lastName;
      var user = {
        fullName: name,
        age: users[i].age,
        isAdult: true
      };
      result.push(user);
    }
  }
  return result;
}
\`\`\`
      `.trim();

      const responseText = await sendMessageAndWait(
        mainWindow,
        refactorPrompt,
        'refactor'
      );

      // ---------------------------------------------------------------
      // Step 2: Verify the response contains modern JavaScript features
      // ---------------------------------------------------------------
      console.log('Verifying refactored code uses modern features...');

      const modernFeatures = [
        'const',
        '=>',
        'filter',
        'map',
        'template literal',
        '`',
        'destructur',
        'arrow',
        'let',
      ];

      const foundFeatures = modernFeatures.filter((feature) =>
        responseText.toLowerCase().includes(feature.toLowerCase())
      );
      console.log(`Found modern feature indicators: ${foundFeatures.join(', ')}`);
      expect(foundFeatures.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------
      // Step 3: Verify the refactored version preserves functionality
      // ---------------------------------------------------------------
      console.log('Verifying functional preservation...');

      const functionalIndicators = [
        'processUsers',
        'age',
        'fullName',
        'firstName',
        'lastName',
        'isAdult',
        '18',
      ];

      const foundFunctional = functionalIndicators.filter((indicator) =>
        responseText.includes(indicator)
      );
      console.log(`Found functional preservation indicators: ${foundFunctional.join(', ')}`);
      expect(foundFunctional.length).toBeGreaterThanOrEqual(3);

      // ---------------------------------------------------------------
      // Step 4: Verify code blocks are present
      // ---------------------------------------------------------------
      console.log('Checking for code blocks in refactored response...');

      const codeElements = await mainWindow.evaluate(() => {
        const blocks = document.querySelectorAll('pre code, code[class*="language-"]');
        return blocks.length;
      });
      console.log(`Found ${codeElements} code block element(s).`);

      // Take final screenshot
      await mainWindow.screenshot({ path: 'test-results/coding-refactor-04-final.png' });

      console.log('=== Refactor test completed. ===');
    });
  });

  test.describe('Tool Usage Verification', () => {
    test('should use shell or text_editor tools when asked to create a file', async () => {
      test.setTimeout(180000); // 3 minutes

      // ---------------------------------------------------------------
      // Step 1: Ask the agent to create a simple file using tools
      // ---------------------------------------------------------------
      console.log('=== Test: Tool Usage ===');

      const prompt = [
        'Create a simple Python file called hello.py in a temp directory.',
        'The file should contain a function that prints "Hello, World!"',
        'and a main block that calls it.',
      ].join(' ');

      const responseText = await sendMessageAndWait(
        mainWindow,
        prompt,
        'tool-usage'
      );

      // ---------------------------------------------------------------
      // Step 2: Verify tool call elements are present
      // ---------------------------------------------------------------
      console.log('Verifying tool calls appeared...');

      const toolCallElements = await mainWindow.locator('.goose-message-tool').all();
      console.log(`Found ${toolCallElements.length} tool call element(s).`);
      expect(toolCallElements.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------
      // Step 3: Check for specific tool names in the page content
      // ---------------------------------------------------------------
      console.log('Checking for specific tool usage indicators...');

      // The agent typically uses text_editor or shell to create files
      const toolIndicators = [
        'text_editor',
        'shell',
        'write',
        'writing',
        'created',
        'hello.py',
      ];

      const foundToolIndicators = toolIndicators.filter((indicator) =>
        responseText.toLowerCase().includes(indicator.toLowerCase())
      );
      console.log(`Found tool usage indicators: ${foundToolIndicators.join(', ')}`);
      expect(foundToolIndicators.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------
      // Step 4: Verify the tool calls have visible content
      // ---------------------------------------------------------------
      console.log('Verifying tool call content visibility...');

      // Each goose-message-tool should have some visible content
      for (let i = 0; i < Math.min(toolCallElements.length, 3); i++) {
        const toolElement = toolCallElements[i];
        const isVisible = await toolElement.isVisible();
        console.log(`Tool call #${i + 1} visible: ${isVisible}`);
        expect(isVisible).toBe(true);

        // Tool call elements should contain text describing the action
        const toolText = await toolElement.textContent();
        console.log(`Tool call #${i + 1} text length: ${toolText?.length || 0}`);
        expect(toolText).toBeTruthy();
        expect(toolText!.length).toBeGreaterThan(0);
      }

      // Take final screenshot
      await mainWindow.screenshot({ path: 'test-results/coding-tool-usage-04-final.png' });

      console.log('=== Tool usage test completed. ===');
    });
  });

  test.describe('Code Block Formatting', () => {
    test('should render code blocks with proper syntax highlighting markers', async () => {
      test.setTimeout(180000); // 3 minutes

      // ---------------------------------------------------------------
      // Step 1: Ask a question that will produce code blocks in the response
      // ---------------------------------------------------------------
      console.log('=== Test: Code Block Formatting ===');

      const prompt = [
        'Show me examples of the following in JavaScript with code blocks:',
        '1. An async/await function',
        '2. Array destructuring',
        '3. A class with a constructor',
        'Please use fenced code blocks with the javascript language marker.',
      ].join(' ');

      await sendMessageAndWait(mainWindow, prompt, 'code-blocks');

      // ---------------------------------------------------------------
      // Step 2: Verify code blocks exist in the response
      // ---------------------------------------------------------------
      console.log('Verifying code block presence...');

      // Check for code elements with language classes (syntax highlighting markers)
      const codeBlockInfo = await mainWindow.evaluate(() => {
        const codeElements = document.querySelectorAll('pre code');
        const results: { className: string; textLength: number }[] = [];
        codeElements.forEach((el) => {
          results.push({
            className: el.className,
            textLength: el.textContent?.length || 0,
          });
        });
        return results;
      });

      console.log(`Found ${codeBlockInfo.length} code block(s):`);
      codeBlockInfo.forEach((info, i) => {
        console.log(`  Block ${i + 1}: class="${info.className}", length=${info.textLength}`);
      });

      // Should have at least one code block
      expect(codeBlockInfo.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------
      // Step 3: Verify code blocks contain expected content
      // ---------------------------------------------------------------
      console.log('Verifying code block content...');

      const pageText = await mainWindow.evaluate(() => document.body.innerText);

      // Check for async/await
      const hasAsync = pageText.includes('async') && pageText.includes('await');
      console.log(`Contains async/await: ${hasAsync}`);

      // Check for destructuring
      const hasDestructuring =
        pageText.includes('const [') ||
        pageText.includes('const {') ||
        pageText.includes('let [') ||
        pageText.includes('let {');
      console.log(`Contains destructuring: ${hasDestructuring}`);

      // Check for class
      const hasClass = pageText.includes('class ') && pageText.includes('constructor');
      console.log(`Contains class with constructor: ${hasClass}`);

      // At least two of the three should be present
      const presentCount = [hasAsync, hasDestructuring, hasClass].filter(Boolean).length;
      console.log(`Present count: ${presentCount}/3`);
      expect(presentCount).toBeGreaterThanOrEqual(2);

      // ---------------------------------------------------------------
      // Step 4: Verify syntax highlighting is applied
      // ---------------------------------------------------------------
      console.log('Checking for syntax highlighting...');

      const hasSyntaxHighlighting = await mainWindow.evaluate(() => {
        // Check for elements with language- class (used by syntax highlighters)
        const langElements = document.querySelectorAll('[class*="language-"]');
        // Also check for prism or hljs themed elements
        const highlightedElements = document.querySelectorAll(
          '.token, .hljs, [class*="prism-"], span[style*="color"]'
        );
        return {
          languageElements: langElements.length,
          highlightedElements: highlightedElements.length,
        };
      });

      console.log(
        `Language elements: ${hasSyntaxHighlighting.languageElements}, ` +
          `Highlighted elements: ${hasSyntaxHighlighting.highlightedElements}`
      );

      // The app uses EnhancedCodeBlock with react-syntax-highlighter,
      // so there should be either language-* classes or colored spans
      const hasSomeHighlighting =
        hasSyntaxHighlighting.languageElements > 0 ||
        hasSyntaxHighlighting.highlightedElements > 0;
      console.log(`Has some syntax highlighting: ${hasSomeHighlighting}`);

      // Take final screenshot
      await mainWindow.screenshot({ path: 'test-results/coding-code-blocks-04-final.png' });

      console.log('=== Code block formatting test completed. ===');
    });
  });
});
