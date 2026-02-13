import { test, expect } from './fixtures';
import { skipWithoutBackend } from './skip-utils';
import { Page } from '@playwright/test';

/**
 * Tic-Tac-Toe End-to-End Integration Test
 *
 * Tests Goose's ability to create a complete tic-tac-toe game project.
 * This is a full integration test that:
 * 1. Sends a prompt asking Goose to create a tic-tac-toe game
 * 2. Waits for the agent to write code using tools (text_editor, shell)
 * 3. Verifies that tool calls appeared in the response
 * 4. Asks the agent to show the file contents
 * 5. Verifies the generated code contains expected game elements
 */
// This test requires a running goose-server backend with LLM provider.
// It sends a prompt asking Goose to create a tic-tac-toe game and waits for
// AI-generated code. Run with: GOOSE_BACKEND=1 npx playwright test
test.describe('Tic-Tac-Toe Game Creation', () => {
  let mainWindow: Page;

  test.beforeEach(async ({ goosePage }) => {
    skipWithoutBackend(test);
    mainWindow = goosePage;
    // Wait for the app to be ready with the chat interface
    console.log('Waiting for chat interface to be ready...');
    await mainWindow.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    console.log('Chat interface is ready.');
  });

  test('should create a tic-tac-toe game end-to-end', async () => {
    // Set a long timeout since the agent needs time to generate and write code
    test.setTimeout(300000); // 5 minutes

    // ---------------------------------------------------------------
    // Step 1: Send the prompt asking Goose to create a tic-tac-toe game
    // ---------------------------------------------------------------
    console.log('Step 1: Sending tic-tac-toe creation prompt...');

    const chatInput = await mainWindow.waitForSelector('[data-testid="chat-input"]');
    expect(await chatInput.isVisible()).toBe(true);

    const prompt = [
      'Create a simple tic-tac-toe game in HTML/CSS/JavaScript.',
      'Create it as a single index.html file in a temp directory.',
      'The game should have a 3x3 grid, take turns between X and O,',
      'detect wins and draws, and have a reset button.',
    ].join(' ');

    await chatInput.fill(prompt);

    // Take screenshot before sending
    await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-01-before-send.png' });
    console.log('Screenshot taken: before-send');

    // Send the message
    await chatInput.press('Enter');
    console.log('Prompt sent. Waiting for agent response...');

    // ---------------------------------------------------------------
    // Step 2: Wait for the agent response
    // ---------------------------------------------------------------
    console.log('Step 2: Waiting for agent to process and respond...');

    // Wait for loading indicator to appear
    try {
      await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
        state: 'visible',
        timeout: 10000,
      });
      console.log('Loading indicator appeared.');
    } catch {
      console.log('Loading indicator did not appear within timeout, checking if response already arrived...');
    }

    // Take screenshot while processing
    await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-02-processing.png' });
    console.log('Screenshot taken: processing');

    // Wait for loading indicator to disappear (agent finished responding)
    try {
      await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
        state: 'hidden',
        timeout: 180000, // 3 minutes for the agent to finish
      });
      console.log('Loading indicator disappeared. Agent has finished responding.');
    } catch {
      console.log('Loading indicator timeout. Taking screenshot of current state...');
      await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-02b-timeout.png' });
      // Continue anyway to check what we got
    }

    // Take screenshot after response
    await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-03-response-received.png' });
    console.log('Screenshot taken: response-received');

    // ---------------------------------------------------------------
    // Step 3: Verify tool calls appeared in the response
    // ---------------------------------------------------------------
    console.log('Step 3: Verifying tool calls appeared...');

    // Wait a moment for the DOM to settle
    await mainWindow.waitForTimeout(2000);

    // Check for tool call elements (the goose-message-tool class is used for tool invocations)
    const toolCallElements = await mainWindow.locator('.goose-message-tool').all();
    console.log(`Found ${toolCallElements.length} tool call element(s) in the response.`);

    // Verify that at least one tool call was made
    expect(toolCallElements.length).toBeGreaterThan(0);

    // Take screenshot showing tool calls
    await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-04-tool-calls.png' });
    console.log('Screenshot taken: tool-calls');

    // ---------------------------------------------------------------
    // Step 4: Check that the response mentions file creation
    // ---------------------------------------------------------------
    console.log('Step 4: Checking response content for file creation indicators...');

    // Get the full page text content to check for file creation evidence
    const pageText = await mainWindow.evaluate(() => document.body.innerText);

    // Look for indicators that a file was created
    const fileCreationIndicators = [
      'index.html',
      'created',
      'writing',
      'wrote',
      'file',
    ];

    const foundIndicators = fileCreationIndicators.filter((indicator) =>
      pageText.toLowerCase().includes(indicator.toLowerCase())
    );
    console.log(`Found file creation indicators: ${foundIndicators.join(', ')}`);
    expect(foundIndicators.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------
    // Step 5: Ask the agent to show the file contents
    // ---------------------------------------------------------------
    console.log('Step 5: Asking agent to show the file contents...');

    // Re-query chat input since the DOM may have changed
    const chatInputForFollowUp = await mainWindow.waitForSelector('[data-testid="chat-input"]');
    await chatInputForFollowUp.fill(
      'Can you show me the contents of the index.html file you just created?'
    );

    // Take screenshot before sending follow-up
    await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-05-before-followup.png' });
    console.log('Screenshot taken: before-followup');

    // Send the follow-up message
    await chatInputForFollowUp.press('Enter');
    console.log('Follow-up prompt sent. Waiting for response...');

    // Wait for loading indicator
    try {
      await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
        state: 'visible',
        timeout: 10000,
      });
      console.log('Loading indicator appeared for follow-up.');
    } catch {
      console.log('Loading indicator did not appear for follow-up, response may have arrived quickly.');
    }

    // Wait for response to complete
    try {
      await mainWindow.waitForSelector('[data-testid="loading-indicator"]', {
        state: 'hidden',
        timeout: 120000, // 2 minutes for follow-up
      });
      console.log('Follow-up response complete.');
    } catch {
      console.log('Follow-up response timeout. Checking what we have...');
      await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-05b-followup-timeout.png' });
    }

    // Take screenshot after follow-up response
    await mainWindow.screenshot({ path: 'test-results/tic-tac-toe-06-followup-response.png' });
    console.log('Screenshot taken: followup-response');

    // ---------------------------------------------------------------
    // Step 6: Verify the response contains HTML code with tic-tac-toe elements
    // ---------------------------------------------------------------
    console.log('Step 6: Verifying response contains tic-tac-toe game elements...');

    // Wait a moment for DOM to settle
    await mainWindow.waitForTimeout(2000);

    // Get the updated page text
    const updatedPageText = await mainWindow.evaluate(() => document.body.innerText);

    // Check for HTML structure indicators
    const htmlIndicators = ['<html', '<body', '<div', '<table', '<button', '<td', '<script'];
    const foundHtmlIndicators = htmlIndicators.filter((indicator) =>
      updatedPageText.includes(indicator)
    );
    console.log(`Found HTML indicators: ${foundHtmlIndicators.join(', ')}`);

    // At least some HTML structure should be present
    expect(foundHtmlIndicators.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------
    // Step 7: Verify game board structure
    // ---------------------------------------------------------------
    console.log('Step 7: Verifying game board structure...');

    // Check for grid/table/board-related CSS or HTML
    const boardIndicators = ['grid', 'board', 'cell', 'square', 'table', 'td', 'tr'];
    const foundBoardIndicators = boardIndicators.filter((indicator) =>
      updatedPageText.toLowerCase().includes(indicator)
    );
    console.log(`Found board structure indicators: ${foundBoardIndicators.join(', ')}`);
    expect(foundBoardIndicators.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------
    // Step 8: Verify JavaScript game logic
    // ---------------------------------------------------------------
    console.log('Step 8: Verifying JavaScript game logic...');

    // Check for game logic indicators
    const gameLogicIndicators = [
      'function',
      'click',
      'win',
      'draw',
      'turn',
      'player',
      'addEventListener',
      'onclick',
    ];
    const foundLogicIndicators = gameLogicIndicators.filter((indicator) =>
      updatedPageText.toLowerCase().includes(indicator)
    );
    console.log(`Found game logic indicators: ${foundLogicIndicators.join(', ')}`);
    expect(foundLogicIndicators.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------
    // Step 9: Verify reset/restart button
    // ---------------------------------------------------------------
    console.log('Step 9: Verifying reset/restart button...');

    const resetIndicators = ['reset', 'restart', 'new game', 'play again'];
    const foundResetIndicators = resetIndicators.filter((indicator) =>
      updatedPageText.toLowerCase().includes(indicator)
    );
    console.log(`Found reset button indicators: ${foundResetIndicators.join(', ')}`);
    expect(foundResetIndicators.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------
    // Step 10: Verify X and O turn handling
    // ---------------------------------------------------------------
    console.log('Step 10: Verifying X and O turn handling...');

    // The page text should contain references to X and O
    const hasXReference = updatedPageText.includes("'X'") || updatedPageText.includes('"X"');
    const hasOReference = updatedPageText.includes("'O'") || updatedPageText.includes('"O"');
    console.log(`Contains X reference: ${hasXReference}, Contains O reference: ${hasOReference}`);

    // At minimum, X and O should be referenced in the game logic
    expect(hasXReference || hasOReference).toBe(true);

    // ---------------------------------------------------------------
    // Step 11: Verify win detection logic
    // ---------------------------------------------------------------
    console.log('Step 11: Verifying win detection logic...');

    // Win detection typically involves checking combinations or patterns
    const winDetectionIndicators = [
      'win',
      'winner',
      'combinations',
      'check',
      'victory',
      'won',
      'winning',
    ];
    const foundWinIndicators = winDetectionIndicators.filter((indicator) =>
      updatedPageText.toLowerCase().includes(indicator)
    );
    console.log(`Found win detection indicators: ${foundWinIndicators.join(', ')}`);
    expect(foundWinIndicators.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------
    // Final screenshot
    // ---------------------------------------------------------------
    // Scroll to bottom to see the latest content
    await mainWindow.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mainWindow.waitForTimeout(500);

    await mainWindow.screenshot({
      path: 'test-results/tic-tac-toe-07-final.png',
      fullPage: true,
    });
    console.log('Screenshot taken: final');

    console.log('=== Tic-Tac-Toe creation test completed successfully! ===');
  });
});
