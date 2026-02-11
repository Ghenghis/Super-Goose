import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileDrop } from '../useFileDrop';

// Mock conversionUtils
vi.mock('../../utils/conversionUtils', () => ({
  compressImageDataUrl: vi.fn((dataUrl: string) => Promise.resolve(dataUrl + '-compressed')),
  errorMessage: vi.fn((err: unknown, fallback?: string) => {
    if (err instanceof Error) return err.message;
    return fallback || 'Unknown error';
  }),
}));

describe('useFileDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure window.electron.getPathForFile is available
    (window.electron as Record<string, unknown>).getPathForFile = vi.fn(
      (file: File) => `/path/to/${file.name}`
    );
  });

  it('returns initial empty droppedFiles array', () => {
    const { result } = renderHook(() => useFileDrop());

    expect(result.current.droppedFiles).toEqual([]);
  });

  it('returns setDroppedFiles function', () => {
    const { result } = renderHook(() => useFileDrop());

    expect(typeof result.current.setDroppedFiles).toBe('function');
  });

  it('returns handleDrop function', () => {
    const { result } = renderHook(() => useFileDrop());

    expect(typeof result.current.handleDrop).toBe('function');
  });

  it('returns handleDragOver function', () => {
    const { result } = renderHook(() => useFileDrop());

    expect(typeof result.current.handleDragOver).toBe('function');
  });

  it('handleDragOver calls preventDefault on the event', () => {
    const { result } = renderHook(() => useFileDrop());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.DragEvent<HTMLDivElement>;

    act(() => {
      result.current.handleDragOver(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('handleDrop processes a non-image file', async () => {
    const { result } = renderHook(() => useFileDrop());

    const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    const mockEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [mockFile] as unknown as FileList,
      },
    } as unknown as React.DragEvent<HTMLDivElement>;

    // Fix length property for our mock FileList
    Object.defineProperty(mockEvent.dataTransfer.files, 'length', { value: 1 });

    await act(async () => {
      await result.current.handleDrop(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.droppedFiles).toHaveLength(1);
    expect(result.current.droppedFiles[0].name).toBe('test.txt');
    expect(result.current.droppedFiles[0].type).toBe('text/plain');
    expect(result.current.droppedFiles[0].isImage).toBe(false);
    expect(result.current.droppedFiles[0].path).toBe('/path/to/test.txt');
  });

  it('handleDrop does nothing when no files are dropped', async () => {
    const { result } = renderHook(() => useFileDrop());

    const mockEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [] as unknown as FileList,
      },
    } as unknown as React.DragEvent<HTMLDivElement>;

    Object.defineProperty(mockEvent.dataTransfer.files, 'length', { value: 0 });

    await act(async () => {
      await result.current.handleDrop(mockEvent);
    });

    expect(result.current.droppedFiles).toEqual([]);
  });

  it('handleDrop handles getPathForFile throwing an error', async () => {
    (window.electron as Record<string, unknown>).getPathForFile = vi.fn(() => {
      throw new Error('No path available');
    });

    const { result } = renderHook(() => useFileDrop());

    const mockFile = new File(['content'], 'broken.txt', { type: 'text/plain' });
    const mockEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [mockFile] as unknown as FileList,
      },
    } as unknown as React.DragEvent<HTMLDivElement>;

    Object.defineProperty(mockEvent.dataTransfer.files, 'length', { value: 1 });

    await act(async () => {
      await result.current.handleDrop(mockEvent);
    });

    expect(result.current.droppedFiles).toHaveLength(1);
    expect(result.current.droppedFiles[0].error).toContain('Failed to get file path');
    expect(result.current.droppedFiles[0].path).toBe('');
  });

  it('setDroppedFiles can clear the file list', () => {
    const { result } = renderHook(() => useFileDrop());

    act(() => {
      result.current.setDroppedFiles([
        {
          id: 'test-1',
          path: '/test/file.txt',
          name: 'file.txt',
          type: 'text/plain',
          isImage: false,
        },
      ]);
    });

    expect(result.current.droppedFiles).toHaveLength(1);

    act(() => {
      result.current.setDroppedFiles([]);
    });

    expect(result.current.droppedFiles).toEqual([]);
  });
});
