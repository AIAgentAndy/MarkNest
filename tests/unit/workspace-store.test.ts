import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearReaderSession,
  createWorkspaceRecord,
  getWorkspacePermission,
  isFileSystemAccessSupported,
  isFilePickerAbortError,
  loadReaderSession,
  pickMarkdownFile,
  pickWorkspaceDirectory,
  saveReaderSession
} from '@/features/workspace/lib/workspace-adapter';

describe('workspace-adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('检测当前浏览器是否支持 File System Access API', () => {
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn(), showOpenFilePicker: vi.fn() });
    expect(isFileSystemAccessSupported()).toBe(true);

    vi.stubGlobal('window', {});
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('创建工作区记录时保留目录句柄并生成稳定元数据', () => {
    const handle = { name: 'docs', kind: 'directory' } as FileSystemDirectoryHandle;
    const record = createWorkspaceRecord(handle, 100);

    expect(record).toMatchObject({
      id: 'workspace:docs',
      name: 'docs',
      rootHandle: handle,
      createdAt: 100,
      lastOpenedAt: 100
    });
  });

  it('读取目录句柄权限状态', async () => {
    const queryPermission = vi.fn().mockResolvedValue('granted');
    const handle = { queryPermission } as unknown as FileSystemDirectoryHandle;

    await expect(getWorkspacePermission(handle)).resolves.toBe('granted');
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'read' });
  });

  it('把文件选择器取消识别为正常取消', async () => {
    const abortError = new DOMException('The user aborted a request.', 'AbortError');

    expect(isFilePickerAbortError(abortError)).toBe(true);
    expect(isFilePickerAbortError(new Error('The user aborted a request.'))).toBe(true);
    expect(isFilePickerAbortError(new Error('其他错误'))).toBe(false);
  });

  it('用户取消打开目录或文件时返回 null 而不是抛错', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn().mockRejectedValue(new DOMException('取消', 'AbortError')),
      showOpenFilePicker: vi.fn().mockRejectedValue(new DOMException('取消', 'AbortError'))
    });

    await expect(pickWorkspaceDirectory()).resolves.toBeNull();
    await expect(pickMarkdownFile()).resolves.toBeNull();
  });

  it('保存并读取最近阅读会话', async () => {
    const rootHandle = { kind: 'directory', name: 'docs' } as FileSystemDirectoryHandle;

    await saveReaderSession({
      mode: 'directory',
      workspaceName: 'docs',
      rootHandle,
      selectedPath: ['guide.md'],
      expandedIds: ['workspace:docs', 'workspace:docs/guide.md'],
      sidebarMode: 'outline',
      sidebarCollapsed: true,
      topbarCollapsed: true,
      savedAt: 100
    });

    await expect(loadReaderSession()).resolves.toMatchObject({
      mode: 'directory',
      workspaceName: 'docs',
      rootHandle,
      selectedPath: ['guide.md'],
      expandedIds: ['workspace:docs', 'workspace:docs/guide.md'],
      sidebarMode: 'outline',
      sidebarCollapsed: true,
      topbarCollapsed: true,
      savedAt: 100
    });
  });

  it('单文件句柄无法持久化时保存 Markdown 内容缓存', async () => {
    const fileHandle = {
      kind: 'file',
      name: 'guide.md',
      queryPermission: async () => 'granted',
      getFile: async () => new File(['# Guide'], 'guide.md', { type: 'text/markdown' }),
      uncloneable: async () => '触发结构化克隆失败'
    } as unknown as FileSystemFileHandle;

    await saveReaderSession({
      mode: 'file',
      workspaceName: '当前文件',
      selectedPath: ['guide.md'],
      expandedIds: ['workspace:当前文件'],
      sidebarMode: 'outline',
      sidebarCollapsed: true,
      topbarCollapsed: false,
      savedAt: 100,
      fileName: 'guide.md',
      fileHandle,
      cachedMarkdown: '# Guide',
      size: 7,
      lastModified: 88
    });

    const restored = await loadReaderSession();

    expect(restored).toMatchObject({
      mode: 'file',
      workspaceName: '当前文件',
      selectedPath: ['guide.md'],
      sidebarMode: 'outline',
      sidebarCollapsed: true,
      fileName: 'guide.md',
      cachedMarkdown: '# Guide',
      size: 7,
      lastModified: 88
    });
    expect(restored?.mode === 'file' ? restored.fileHandle : null).toBeFalsy();
  });

  it('保存并读取 file URL 虚拟目录阅读会话', async () => {
    await saveReaderSession({
      mode: 'file-url-directory',
      workspaceName: 'docs',
      selectedPath: ['sub', 'guide.md'],
      expandedIds: ['workspace:docs', 'workspace:docs/sub'],
      sidebarMode: 'files',
      sidebarCollapsed: false,
      topbarCollapsed: true,
      savedAt: 100,
      directoryUrl: 'file:///Users/example/docs/',
      cachedMarkdown: '# Guide\n\n正文',
      size: 12,
      lastModified: 90,
      entries: [
        {
          name: 'README.md',
          fileUrl: 'file:///Users/example/docs/README.md',
          pathSegments: ['README.md'],
          size: 10,
          lastModified: 80
        },
        {
          name: 'guide.md',
          fileUrl: 'file:///Users/example/docs/sub/guide.md',
          pathSegments: ['sub', 'guide.md'],
          size: 12,
          lastModified: 90
        }
      ]
    });

    await expect(loadReaderSession()).resolves.toMatchObject({
      mode: 'file-url-directory',
      workspaceName: 'docs',
      selectedPath: ['sub', 'guide.md'],
      expandedIds: ['workspace:docs', 'workspace:docs/sub'],
      directoryUrl: 'file:///Users/example/docs/',
      cachedMarkdown: '# Guide\n\n正文',
      entries: [
        {
          name: 'README.md',
          fileUrl: 'file:///Users/example/docs/README.md',
          pathSegments: ['README.md']
        },
        {
          name: 'guide.md',
          fileUrl: 'file:///Users/example/docs/sub/guide.md',
          pathSegments: ['sub', 'guide.md']
        }
      ]
    });
  });

  it('目录句柄无法持久化时清除最近阅读会话且不抛出未处理错误', async () => {
    await saveReaderSession({
      mode: 'file',
      workspaceName: '当前文件',
      selectedPath: ['guide.md'],
      expandedIds: ['workspace:当前文件'],
      sidebarMode: 'files',
      sidebarCollapsed: false,
      topbarCollapsed: false,
      savedAt: 100,
      fileName: 'guide.md',
      cachedMarkdown: '# Guide'
    });

    const rootHandle = {
      kind: 'directory',
      name: 'docs',
      values: async function* values() {
        yield { kind: 'file', name: 'README.md' };
      }
    } as unknown as FileSystemDirectoryHandle;

    await expect(
      saveReaderSession({
        mode: 'directory',
        workspaceName: 'docs',
        rootHandle,
        selectedPath: ['README.md'],
        expandedIds: ['workspace:docs'],
        sidebarMode: 'files',
        sidebarCollapsed: false,
        topbarCollapsed: false,
        savedAt: 200
      })
    ).resolves.toBeUndefined();
    await expect(loadReaderSession()).resolves.toBeNull();
  });

  it('清除最近阅读会话', async () => {
    await saveReaderSession({
      mode: 'file',
      workspaceName: '当前文件',
      selectedPath: ['guide.md'],
      expandedIds: ['workspace:当前文件'],
      sidebarMode: 'files',
      sidebarCollapsed: false,
      topbarCollapsed: false,
      savedAt: 100,
      fileName: 'guide.md',
      cachedMarkdown: '# Guide'
    });

    await clearReaderSession();

    await expect(loadReaderSession()).resolves.toBeNull();
  });
});
