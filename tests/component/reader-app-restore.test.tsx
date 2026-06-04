import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '@/features/workspace/components/reader-app';

const workspaceMocks = vi.hoisted(() => ({
  getWorkspacePermission: vi.fn(),
  isFileSystemAccessSupported: vi.fn(),
  loadReaderSession: vi.fn(),
  pickMarkdownFile: vi.fn(),
  pickWorkspaceDirectory: vi.fn(),
  requestWorkspacePermission: vi.fn(),
  saveReaderSession: vi.fn()
}));

vi.mock('@/features/workspace/lib/workspace-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/workspace/lib/workspace-adapter')>();

  return {
    ...actual,
    getWorkspacePermission: workspaceMocks.getWorkspacePermission,
    isFileSystemAccessSupported: workspaceMocks.isFileSystemAccessSupported,
    loadReaderSession: workspaceMocks.loadReaderSession,
    pickMarkdownFile: workspaceMocks.pickMarkdownFile,
    pickWorkspaceDirectory: workspaceMocks.pickWorkspaceDirectory,
    requestWorkspacePermission: workspaceMocks.requestWorkspacePermission,
    saveReaderSession: workspaceMocks.saveReaderSession
  };
});

describe('ReaderApp session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    delete (globalThis as { chrome?: unknown }).chrome;

    workspaceMocks.isFileSystemAccessSupported.mockReturnValue(true);
    workspaceMocks.loadReaderSession.mockResolvedValue(null);
    workspaceMocks.getWorkspacePermission.mockResolvedValue('granted');
    workspaceMocks.requestWorkspacePermission.mockResolvedValue('granted');
    workspaceMocks.saveReaderSession.mockResolvedValue(undefined);
  });

  it('启动恢复目录会话遇到 prompt 权限时等待用户点击后继续恢复', async () => {
    const rootHandle = {
      kind: 'directory',
      name: 'docs',
      async *values() {
        yield createMockFileHandle('README.md', '# README');
      }
    } as unknown as FileSystemDirectoryHandle;

    workspaceMocks.loadReaderSession.mockResolvedValue({
      mode: 'directory',
      workspaceName: 'docs',
      rootHandle,
      selectedPath: ['README.md'],
      expandedIds: ['workspace:docs'],
      sidebarMode: 'files',
      sidebarCollapsed: false,
      topbarCollapsed: false,
      savedAt: 100
    });
    workspaceMocks.getWorkspacePermission.mockResolvedValue('prompt');

    render(<ReaderApp />);

    await waitFor(() => {
      expect(screen.getByText('需要授权后才能恢复上次打开的目录。')).toBeInTheDocument();
    });
    expect(workspaceMocks.requestWorkspacePermission).not.toHaveBeenCalled();
    expect(screen.queryByText('正在恢复...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '继续恢复上次目录' }));

    await waitFor(() => {
      expect(workspaceMocks.requestWorkspacePermission).toHaveBeenCalledWith(rootHandle);
    });
    expect(await screen.findByRole('heading', { name: 'README' })).toBeInTheDocument();
    expect(screen.getByText('已恢复上次打开的目录。')).toBeInTheDocument();
  });

  it('启动恢复单文件会话遇到 prompt 权限时使用缓存内容', async () => {
    const fileHandle = createMockFileHandle('guide.md', '# Fresh');

    workspaceMocks.loadReaderSession.mockResolvedValue({
      mode: 'file',
      workspaceName: '当前文件',
      selectedPath: ['guide.md'],
      expandedIds: ['workspace:当前文件'],
      sidebarMode: 'files',
      sidebarCollapsed: false,
      topbarCollapsed: false,
      savedAt: 100,
      fileName: 'guide.md',
      fileHandle,
      cachedMarkdown: '# Cached',
      size: 8,
      lastModified: 90
    });
    workspaceMocks.getWorkspacePermission.mockResolvedValue('prompt');

    render(<ReaderApp />);

    expect(await screen.findByRole('heading', { name: 'Cached' })).toBeInTheDocument();
    expect(screen.getByText('已恢复上次打开的 Markdown 缓存；如需读取最新内容，请重新打开文件。')).toBeInTheDocument();
    expect(workspaceMocks.requestWorkspacePermission).not.toHaveBeenCalled();
    expect(fileHandle.getFile).not.toHaveBeenCalled();
  });
});

function createMockFileHandle(name: string, content: string): FileSystemFileHandle & {
  getFile: ReturnType<typeof vi.fn>;
} {
  const file = {
    name,
    size: content.length,
    lastModified: 1777651200000,
    text: vi.fn().mockResolvedValue(content)
  };

  return {
    kind: 'file',
    name,
    getFile: vi.fn().mockResolvedValue(file)
  } as unknown as FileSystemFileHandle & { getFile: ReturnType<typeof vi.fn> };
}
