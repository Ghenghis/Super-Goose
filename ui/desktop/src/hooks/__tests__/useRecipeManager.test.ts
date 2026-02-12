import { renderHook, act } from '@testing-library/react';

vi.mock('../../recipe', () => ({
  scanRecipe: vi.fn(() => Promise.resolve({ has_security_warnings: false })),
}));
vi.mock('../../types/message', () => ({
  createUserMessage: (text: string) => ({ role: 'user', content: text }),
}));
vi.mock('../../api', () => ({
  updateSessionUserRecipeValues: vi.fn(() =>
    Promise.resolve({ data: { recipe: { title: 'Test', prompt: 'Do it' } } })
  ),
}));
vi.mock('../../contexts/ChatContext', () => ({
  useChatContext: () => ({
    chat: {
      recipe: null,
      resolvedRecipe: null,
      recipeParameterValues: null,
      messages: [],
      sessionId: 'sess-1',
    },
    setChat: vi.fn(),
  }),
}));
vi.mock('../../utils/providerUtils', () => ({
  substituteParameters: (text: string, params: Record<string, string>) => {
    let result = text;
    for (const [key, val] of Object.entries(params)) {
      result = result.replace(`{{${key}}}`, val);
    }
    return result;
  },
}));
vi.mock('../../toasts', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

// Mock window.electron and window.appConfig
Object.defineProperty(window, 'appConfig', {
  value: { get: vi.fn(() => null) },
  writable: true,
});
(window as any).electron = {
  ...((window as any).electron || {}),
  hasAcceptedRecipeBefore: vi.fn(() => Promise.resolve(true)),
  recordRecipeHash: vi.fn(() => Promise.resolve()),
  closeWindow: vi.fn(),
};
(window as any).isCreatingRecipe = false;

import { useRecipeManager } from '../useRecipeManager';

const baseChatType = {
  messages: [],
  recipe: null,
  resolvedRecipe: null,
  recipeParameterValues: null,
  sessionId: 'sess-1',
  name: 'Test',
};

describe('useRecipeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state (no recipe)', () => {
    const { result } = renderHook(() => useRecipeManager(baseChatType as any));
    expect(result.current.recipe).toBeNull();
    expect(result.current.isParameterModalOpen).toBe(false);
    expect(result.current.isRecipeWarningModalOpen).toBe(false);
    expect(result.current.recipeAccepted).toBe(false);
  });

  it('returns recipeId from appConfig', () => {
    (window as any).appConfig.get = vi.fn((key: string) =>
      key === 'recipeId' ? 'recipe-123' : null
    );
    const { result } = renderHook(() => useRecipeManager(baseChatType as any));
    expect(result.current.recipeId).toBe('recipe-123');
  });

  it('provides handleRecipeAccept function', () => {
    const { result } = renderHook(() => useRecipeManager(baseChatType as any));
    expect(typeof result.current.handleRecipeAccept).toBe('function');
  });

  it('provides handleRecipeCancel function', () => {
    const { result } = renderHook(() => useRecipeManager(baseChatType as any));
    expect(typeof result.current.handleRecipeCancel).toBe('function');
  });

  it('returns empty initialPrompt when no recipe', () => {
    const { result } = renderHook(() => useRecipeManager(baseChatType as any));
    expect(result.current.initialPrompt).toBe('');
  });

  it('readyForAutoUserPrompt becomes true after mount', async () => {
    const { result } = renderHook(() => useRecipeManager(baseChatType as any));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.readyForAutoUserPrompt).toBe(true);
  });
});
