'use client';

import {
  AlertCircle,
  ArrowUp,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FilePlus2,
  FolderOpen,
  Github,
  Info,
  ListTree,
  Mail,
  Moon,
  RefreshCw,
  Sun,
  X
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileTreeView } from '@/features/file-tree/components/file-tree-view';
import { collectMarkdownFilesFromDirectory } from '@/features/file-tree/lib/file-system-reader';
import { buildMarkdownTreeFromEntries } from '@/features/file-tree/lib/tree-builder';
import type { MarkdownTreeNode } from '@/features/file-tree/types';
import { DocumentOutlineView } from '@/features/markdown-renderer/components/document-outline-view';
import { MarkdownViewer } from '@/features/markdown-renderer/components/markdown-viewer';
import type { DocumentOutlineItem } from '@/features/markdown-renderer/lib/document-outline';
import {
  createLocalAssetResolver,
  type LocalAssetResolver
} from '@/features/markdown-renderer/lib/local-asset-resolver';
import type { PermissionAwareFileSystemHandle } from '@/shared/browser/file-system-types';
import { getParentSegments, pathSegmentsToId } from '@/shared/path/path-utils';
import {
  consumeExtensionLaunchPayload,
  type ExtensionDirectoryLaunchPayload
} from '../lib/extension-launch';
import {
  createWorkspaceRecord,
  getWorkspacePermission,
  isFileSystemAccessSupported,
  loadReaderSession,
  pickMarkdownFile,
  pickWorkspaceDirectory,
  requestWorkspacePermission,
  saveReaderSession
} from '../lib/workspace-adapter';
import { sampleDirectory, sampleMarkdownByPath } from '../lib/sample-workspace';
import type { ReaderSession, ReaderTheme, SidebarMode, WorkspaceRecord } from '../types';

type FileSystemHandleEntry = {
  handle: FileSystemFileHandle;
  parentHandle: FileSystemDirectoryHandle;
};

type FileUrlHandleEntry = {
  fileUrl: string;
  size: number;
  lastModified: number;
};

type FileHandleEntry = FileSystemHandleEntry | FileUrlHandleEntry;
type FileUrlDirectoryStateEntry = ExtensionDirectoryLaunchPayload['entries'][number] & {
  size?: number;
  lastModified?: number;
};
type FileUrlDirectoryStatePayload = Omit<ExtensionDirectoryLaunchPayload, 'entries'> & {
  entries: FileUrlDirectoryStateEntry[];
};

type ReaderStatus = 'idle' | 'loading' | 'ready' | 'error';
type DirectoryRestoreSession = Extract<ReaderSession, { mode: 'directory' }>;

const topbarCollapsedStorageKey = 'md-view-topbar-collapsed';
const authorGithubUrl = 'https://github.com/AIAgentAndy/MarkNest';
const authorEmail = 'AIAgentAndy001@gmail.com';
const brandSlogan = '让 Markdown 文档优雅归巢';
export function ReaderApp() {
  const contentPaneRef = useRef<HTMLElement | null>(null);
  const emailCopyTimeoutRef = useRef<number | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  const [tree, setTree] = useState<MarkdownTreeNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [selectedFileMeta, setSelectedFileMeta] = useState<{ size: number; lastModified: number } | null>(null);
  const [fileHandles, setFileHandles] = useState<Map<string, FileHandleEntry>>(new Map());
  const [fileUrlDirectoryUrl, setFileUrlDirectoryUrl] = useState<string | null>(null);
  const [assetResolver, setAssetResolver] = useState<LocalAssetResolver | undefined>();
  const [status, setStatus] = useState<ReaderStatus>('idle');
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<ReaderTheme>('system');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files');
  const [outlineItems, setOutlineItems] = useState<DocumentOutlineItem[]>([]);
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(new Set());
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [topbarCollapsed, setTopbarCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [emailCopyFeedbackVisible, setEmailCopyFeedbackVisible] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [scrollTopVisible, setScrollTopVisible] = useState(false);
  const [refreshingDirectory, setRefreshingDirectory] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [sessionAwaitingPermission, setSessionAwaitingPermission] =
    useState<DirectoryRestoreSession | null>(null);

  const resolvedTheme = useResolvedTheme(theme);
  const supportsFileSystem = isFileSystemAccessSupported();
  const controlsCollapsed = topbarCollapsed && status !== 'idle';
  const canRefreshDirectory =
    sidebarMode === 'files' &&
    Boolean(workspace) &&
    status !== 'loading' &&
    typeof (workspace?.rootHandle as { values?: unknown } | undefined)?.values === 'function';

  const copyAuthorEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(authorEmail);
      setEmailCopyFeedbackVisible(true);
      if (emailCopyTimeoutRef.current !== null) {
        window.clearTimeout(emailCopyTimeoutRef.current);
      }
      emailCopyTimeoutRef.current = window.setTimeout(() => {
        setEmailCopyFeedbackVisible(false);
        emailCopyTimeoutRef.current = null;
      }, 1800);
    } catch {
      setMessage(`复制失败，请手动复制：${authorEmail}`);
    }
  }, []);

  const toggleAbout = useCallback(() => {
    setAboutVisible((current) => !current);
    setMessage('');
    setEmailCopyFeedbackVisible(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const stored = window.localStorage.getItem(topbarCollapsedStorageKey);
    setTopbarCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem(topbarCollapsedStorageKey, String(topbarCollapsed));
  }, [topbarCollapsed]);

  useEffect(() => {
    if (message) {
      setAboutVisible(false);
      setNoticeDismissed(false);
    }
  }, [message]);

  useEffect(() => {
    return () => {
      if (emailCopyTimeoutRef.current !== null) {
        window.clearTimeout(emailCopyTimeoutRef.current);
      }
    };
  }, []);

  const loadExtensionLaunchFile = useCallback((payload: Awaited<ReturnType<typeof consumePendingExtensionLaunch>>) => {
    if (!payload || payload.type !== 'file-url') {
      return;
    }

    const pathSegments = [payload.fileName];
    const record = createWorkspaceRecord(createVirtualDirectoryHandle('当前文件'));
    const size = new Blob([payload.markdown]).size;
    setWorkspace(record);
    setTree(
      createSingleFileTree(record, payload.fileName, {
        size,
        lastModified: payload.createdAt
      })
    );
    setFileHandles(new Map());
    setFileUrlDirectoryUrl(null);
    setExpandedIds(new Set([pathSegmentsToId(record.id, [])]));
    setSelectedPath(pathSegments);
    setMarkdown(payload.markdown);
    setSelectedFileMeta({ size, lastModified: payload.createdAt });
    setAssetResolver((previous: LocalAssetResolver | undefined) => {
      previous?.revoke();
      return undefined;
    });
    setStatus('ready');
    setMessage('已从本地文件打开 Markdown；如需完整目录树，请使用“打开目录”。');
  }, []);

  const loadFileUrlEntryByPath = useCallback(
    async (
      nextWorkspace: WorkspaceRecord,
      nextFileHandles: Map<string, FileHandleEntry>,
      pathSegments: string[]
    ): Promise<boolean> => {
      const entry = nextFileHandles.get(pathSegments.join('/'));
      if (!entry || !('fileUrl' in entry)) {
        setMessage('未找到该文件 URL，请重新从本地目录页打开。');
        setStatus('error');
        return false;
      }

      try {
        const response = await fetch(entry.fileUrl);
        if (!response.ok) {
          throw new Error(`读取本地 Markdown 失败：${response.status}`);
        }

        const nextMarkdown = await response.text();
        setWorkspace(nextWorkspace);
        setFileHandles(nextFileHandles);
        setSelectedPath(pathSegments);
        setMarkdown(nextMarkdown);
        setSelectedFileMeta({ size: entry.size, lastModified: entry.lastModified });
        setAssetResolver((previous: LocalAssetResolver | undefined) => {
          previous?.revoke();
          return undefined;
        });
        setStatus('ready');
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取本地 Markdown 文件失败。');
        setStatus('error');
        return false;
      }
    },
    []
  );

  const loadExtensionLaunchDirectory = useCallback(
    async (payload: ExtensionDirectoryLaunchPayload) => {
      const record = createWorkspaceRecord(createVirtualDirectoryHandle(payload.directoryName));
      const { nextTree, nextHandles } = createFileUrlDirectoryState(record, payload);
      setWorkspace(record);
      setTree(nextTree);
      setFileHandles(nextHandles);
      setFileUrlDirectoryUrl(payload.directoryUrl);
      setExpandedIds(collectDirectoryIds(nextTree));
      setSidebarMode('files');
      setAssetResolver((previous: LocalAssetResolver | undefined) => {
        previous?.revoke();
        return undefined;
      });
      setMessage('已从本地文件自动识别同级和子目录 Markdown；无需再次授权该目录。');

      const selectedPathSegments = payload.selectedPathSegments && nextHandles.has(payload.selectedPathSegments.join('/'))
        ? payload.selectedPathSegments
        : findPreferredFile(nextTree)?.pathSegments;
      if (selectedPathSegments && payload.selectedMarkdown && pathsEqual(selectedPathSegments, payload.selectedPathSegments ?? [])) {
        const selectedEntry = nextHandles.get(selectedPathSegments.join('/'));
        const selectedSize = new Blob([payload.selectedMarkdown]).size;
        if (selectedEntry && 'fileUrl' in selectedEntry) {
          nextHandles.set(selectedPathSegments.join('/'), {
            ...selectedEntry,
            size: selectedSize
          });
        }
        setSelectedPath(selectedPathSegments);
        setMarkdown(payload.selectedMarkdown);
        setSelectedFileMeta({
          size: selectedSize,
          lastModified: selectedEntry && 'fileUrl' in selectedEntry ? selectedEntry.lastModified : payload.createdAt
        });
        setStatus('ready');
      } else if (selectedPathSegments) {
        await loadFileUrlEntryByPath(record, nextHandles, selectedPathSegments);
      } else {
        setSelectedPath([]);
        setMarkdown('');
        setSelectedFileMeta(null);
        setStatus('ready');
      }
    },
    [loadFileUrlEntryByPath]
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreLastSession() {
      const launchPayload = await consumePendingExtensionLaunch();
      if (launchPayload && !cancelled) {
        if (launchPayload.type === 'file-directory') {
          await loadExtensionLaunchDirectory(launchPayload);
        } else {
          loadExtensionLaunchFile(launchPayload);
        }
        setSessionAwaitingPermission(null);
        setRestoringSession(false);
        return;
      }

      const session = await loadReaderSession();
      if (!session || cancelled) {
        return;
      }

      if (
        typeof window !== 'undefined' &&
        window.location.search.includes('sample=1') &&
        session.mode !== 'sample'
      ) {
        return;
      }

      setRestoringSession(true);
      setStatus('loading');
      setMessage('正在恢复上次打开的 Markdown 阅读状态。');
      try {
        await restoreReaderSession(session);
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setMessage(error instanceof Error ? error.message : '恢复上次打开的 Markdown 失败，请重新打开文件或目录。');
        }
      } finally {
        if (!cancelled) {
          setRestoringSession(false);
        }
      }
    }

    void restoreLastSession();

    return () => {
      cancelled = true;
    };
  }, [loadExtensionLaunchDirectory, loadExtensionLaunchFile]);

  useEffect(() => {
    if (!workspace || status !== 'ready') {
      return;
    }

    const session = createCurrentReaderSession({
      workspace,
      selectedPath,
      expandedIds,
      sidebarMode,
      sidebarCollapsed,
      topbarCollapsed,
      fileHandles,
      markdown,
      selectedFileMeta,
      fileUrlDirectoryUrl
    });

    if (session) {
      void saveReaderSession(session);
    }
  }, [
    expandedIds,
    fileHandles,
    fileUrlDirectoryUrl,
    markdown,
    selectedPath,
    selectedFileMeta,
    sidebarCollapsed,
    sidebarMode,
    status,
    topbarCollapsed,
    workspace
  ]);

  const expandPath = useCallback((workspaceId: string, pathSegments: string[]) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      next.add(pathSegmentsToId(workspaceId, []));

      for (let index = 1; index <= pathSegments.length; index += 1) {
        next.add(pathSegmentsToId(workspaceId, pathSegments.slice(0, index)));
      }

      return next;
    });
  }, []);

  const loadFileByPath = useCallback(
    async (pathSegments: string[]) => {
      const key = pathSegments.join('/');
      const entry = fileHandles.get(key);

      if (!entry) {
        const sample = sampleMarkdownByPath.get(key);
        if (sample) {
          setSelectedPath(pathSegments);
          setMarkdown(sample);
          setSelectedFileMeta(null);
          return;
        }

        setMessage('未找到该文件句柄，请刷新工作区后重试。');
        setStatus('error');
        return;
      }

      try {
        if ('fileUrl' in entry) {
          const record = workspace ?? createWorkspaceRecord(createVirtualDirectoryHandle('本地目录'));
          await loadFileUrlEntryByPath(record, fileHandles, pathSegments);
          return;
        }

        const file = await entry.handle.getFile();
        setSelectedPath(pathSegments);
        setMarkdown(await file.text());
        setSelectedFileMeta({ size: file.size, lastModified: file.lastModified });
        setAssetResolver((previous: LocalAssetResolver | undefined) => {
          previous?.revoke();
          return createLocalAssetResolver({
            rootHandle: workspace?.rootHandle ?? entry.parentHandle,
            markdownPathSegments: pathSegments
          });
        });
        setStatus('ready');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取 Markdown 文件失败。');
        setStatus('error');
      }
    },
    [fileHandles, loadFileUrlEntryByPath, workspace]
  );

  const restoreDirectorySession = useCallback(async (session: DirectoryRestoreSession) => {
    const record = createWorkspaceRecord(session.rootHandle);
    const { nextTree, nextHandles } = await buildTreeFromHandle(record, session.rootHandle);
    const targetFile = nextHandles.get(session.selectedPath.join('/'));

    setWorkspace(record);
    setTree(nextTree);
    setFileHandles(nextHandles);
    setFileUrlDirectoryUrl(null);
    setSelectedPath(session.selectedPath);

    if (isFileSystemHandleEntry(targetFile)) {
      const file = await targetFile.handle.getFile();
      setMarkdown(await file.text());
      setSelectedFileMeta({ size: file.size, lastModified: file.lastModified });
    } else {
      setMarkdown('');
      setSelectedFileMeta(null);
    }

    setAssetResolver((previous: LocalAssetResolver | undefined) => {
      previous?.revoke();
      return createLocalAssetResolver({
        rootHandle: session.rootHandle,
        markdownPathSegments: session.selectedPath
      });
    });
    setStatus('ready');
    setMessage(isFileSystemHandleEntry(targetFile) ? '已恢复上次打开的目录。' : '已恢复目录，但上次文件未找到。');
    setSessionAwaitingPermission(null);
  }, []);

  const restoreReaderSession = useCallback(
    async (session: ReaderSession) => {
      setTopbarCollapsed(session.topbarCollapsed);
      setSidebarMode(session.sidebarMode);
      setSidebarCollapsed(session.sidebarCollapsed);
      setExpandedIds(new Set(session.expandedIds));
      setSelectedPath(session.selectedPath);

      if (session.mode === 'sample') {
        const sampleState = createSampleWorkspaceState();
        const selectedSamplePath = sampleMarkdownByPath.has(session.selectedPath.join('/'))
          ? session.selectedPath
          : sampleState.selectedPath;
        setWorkspace(sampleState.record);
        setTree(sampleState.tree);
        setFileHandles(sampleState.fileHandles);
        setFileUrlDirectoryUrl(null);
        setExpandedIds(sampleState.expandedIds);
        setSelectedPath(selectedSamplePath);
        setMarkdown(sampleMarkdownByPath.get(selectedSamplePath.join('/')) ?? sampleState.markdown);
        setSelectedFileMeta(null);
        setAssetResolver((previous: LocalAssetResolver | undefined) => {
          previous?.revoke();
          return undefined;
        });
        setStatus('ready');
        setMessage('已恢复示例数据模式。');
        setSidebarMode(session.sidebarMode);
        setSidebarCollapsed(session.sidebarCollapsed);
        setTopbarCollapsed(session.topbarCollapsed);
        setExpandedIds(new Set(session.expandedIds));
        setSessionAwaitingPermission(null);
        return;
      }

      if (session.mode === 'file-url-directory') {
        const record = createWorkspaceRecord(createVirtualDirectoryHandle(session.workspaceName));
        const { nextTree, nextHandles } = createFileUrlDirectoryState(record, {
          type: 'file-directory',
          directoryName: session.workspaceName,
          directoryUrl: session.directoryUrl,
          entries: session.entries,
          selectedPathSegments: session.selectedPath,
          selectedMarkdown: session.cachedMarkdown,
          createdAt: session.savedAt
        });
        const selectedPathSegments = session.selectedPath.length > 0 && nextHandles.has(session.selectedPath.join('/'))
          ? session.selectedPath
          : findPreferredFile(nextTree)?.pathSegments;

        setWorkspace(record);
        setTree(nextTree);
        setFileHandles(nextHandles);
        setFileUrlDirectoryUrl(session.directoryUrl);
        setExpandedIds(session.expandedIds.length > 0 ? new Set(session.expandedIds) : collectDirectoryIds(nextTree));
        setAssetResolver((previous: LocalAssetResolver | undefined) => {
          previous?.revoke();
          return undefined;
        });

        if (!selectedPathSegments) {
          setSelectedPath([]);
          setMarkdown('');
          setSelectedFileMeta(null);
          setStatus('ready');
          setMessage('已恢复本地文件目录，但目录内没有可阅读的 Markdown。');
          setSessionAwaitingPermission(null);
          return;
        }

        if (pathsEqual(selectedPathSegments, session.selectedPath)) {
          const selectedEntry = nextHandles.get(selectedPathSegments.join('/'));
          const cachedSize = new Blob([session.cachedMarkdown]).size;
          setSelectedPath(selectedPathSegments);
          setMarkdown(session.cachedMarkdown);
          setSelectedFileMeta({
            size: session.size ?? (selectedEntry && 'fileUrl' in selectedEntry ? selectedEntry.size : cachedSize),
            lastModified: session.lastModified ?? (
              selectedEntry && 'fileUrl' in selectedEntry ? selectedEntry.lastModified : session.savedAt
            )
          });
          setStatus('ready');
          setMessage('已恢复本地文件目录阅读状态。');
          setSessionAwaitingPermission(null);
          return;
        }

        const restored = await loadFileUrlEntryByPath(record, nextHandles, selectedPathSegments);
        if (restored) {
          setMessage('已恢复本地文件目录阅读状态。');
        }
        setSessionAwaitingPermission(null);
        return;
      }

      if (session.mode === 'file') {
        if (session.fileHandle) {
          const permission = await getWorkspacePermission(session.fileHandle);
          if (permission === 'denied') {
            setStatus('error');
            setMessage('上次打开的文件权限已失效，请重新打开文件。');
            setSessionAwaitingPermission(null);
            return;
          }

          if (permission === 'prompt') {
            const pathSegments = [session.fileName];
            const record = createWorkspaceRecord(createVirtualDirectoryHandle('当前文件'));
            setWorkspace(record);
            setTree(
              createSingleFileTree(record, session.fileName, {
                size: session.size ?? session.cachedMarkdown.length,
                lastModified: session.lastModified ?? session.savedAt
              })
            );
            setFileHandles(
              new Map([[pathSegments.join('/'), { handle: session.fileHandle, parentHandle: record.rootHandle }]])
            );
            setFileUrlDirectoryUrl(null);
            setSelectedPath(pathSegments);
            setMarkdown(session.cachedMarkdown);
            setSelectedFileMeta({
              size: session.size ?? session.cachedMarkdown.length,
              lastModified: session.lastModified ?? session.savedAt
            });
            setAssetResolver((previous: LocalAssetResolver | undefined) => {
              previous?.revoke();
              return undefined;
            });
            setStatus('ready');
            setMessage('已恢复上次打开的 Markdown 缓存；如需读取最新内容，请重新打开文件。');
            setSessionAwaitingPermission(null);
            return;
          }
        }

        const file = session.fileHandle ? await session.fileHandle.getFile() : null;
        const pathSegments = [session.fileName];
        const record = createWorkspaceRecord(createVirtualDirectoryHandle('当前文件'));
        setWorkspace(record);
        setTree(
          createSingleFileTree(record, session.fileName, {
            size: file?.size ?? session.size ?? session.cachedMarkdown.length,
            lastModified: file?.lastModified ?? session.lastModified ?? session.savedAt
          })
        );
        setFileHandles(
          session.fileHandle
            ? new Map([[pathSegments.join('/'), { handle: session.fileHandle, parentHandle: record.rootHandle }]])
            : new Map()
        );
        setFileUrlDirectoryUrl(null);
        setSelectedPath(pathSegments);
        setMarkdown(file ? await file.text() : session.cachedMarkdown);
        setSelectedFileMeta({
          size: file?.size ?? session.size ?? session.cachedMarkdown.length,
          lastModified: file?.lastModified ?? session.lastModified ?? session.savedAt
        });
        setAssetResolver((previous: LocalAssetResolver | undefined) => {
          previous?.revoke();
          return undefined;
        });
        setStatus('ready');
        setMessage('已恢复上次打开的 Markdown 文件。');
        setSessionAwaitingPermission(null);
        return;
      }

      const permission = await getWorkspacePermission(session.rootHandle);
      if (permission === 'denied') {
        setStatus('error');
        setMessage('上次打开的目录权限已失效，请重新打开目录。');
        setSessionAwaitingPermission(null);
        return;
      }

      if (permission === 'prompt') {
        setSessionAwaitingPermission(session);
        setStatus('idle');
        setMessage('需要授权后才能恢复上次打开的目录。');
        return;
      }

      await restoreDirectorySession(session);
    },
    [loadFileUrlEntryByPath, restoreDirectorySession]
  );

  const continueSessionRestore = useCallback(async () => {
    if (!sessionAwaitingPermission) {
      return;
    }

    setRestoringSession(true);
    setStatus('loading');
    setMessage('正在请求目录权限...');

    try {
      const requested = await requestWorkspacePermission(sessionAwaitingPermission.rootHandle);
      if (requested !== 'granted') {
        setStatus('error');
        setMessage('目录读取权限未授予。');
        return;
      }

      await restoreDirectorySession(sessionAwaitingPermission);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '恢复上次打开的目录失败。');
    } finally {
      setRestoringSession(false);
    }
  }, [restoreDirectorySession, sessionAwaitingPermission]);

  const openDirectory = useCallback(async () => {
    const previousStatus = status;

    try {
      setStatus('loading');
      setMessage('正在请求目录权限...');
      setSessionAwaitingPermission(null);
      const rootHandle = await pickWorkspaceDirectory();

      if (!rootHandle) {
        setStatus(previousStatus);
        setMessage(supportsFileSystem ? '' : '当前浏览器不支持 File System Access API。');
        return;
      }

      const permission = await requestWorkspacePermission(rootHandle);
      if (permission !== 'granted') {
        setStatus('error');
        setMessage('目录读取权限未授予。');
        return;
      }

      const record = createWorkspaceRecord(rootHandle);
      const { nextTree, nextHandles } = await buildTreeFromHandle(record, rootHandle);
      setWorkspace(record);
      setTree(nextTree);
      setFileHandles(nextHandles);
      setFileUrlDirectoryUrl(null);
      setStatus('ready');
      setMessage('');
      expandPath(record.id, []);

      const firstFile = findPreferredFile(nextTree);
      if (firstFile) {
        expandPath(record.id, getParentSegments(firstFile.pathSegments));
        const file = nextHandles.get(firstFile.pathSegments.join('/'));
        setSelectedPath(firstFile.pathSegments);
        if (isFileSystemHandleEntry(file)) {
          const markdownFile = await file.handle.getFile();
          setMarkdown(await markdownFile.text());
          setSelectedFileMeta({ size: markdownFile.size, lastModified: markdownFile.lastModified });
        } else {
          setMarkdown('');
          setSelectedFileMeta(null);
        }
        setAssetResolver((previous: LocalAssetResolver | undefined) => {
          previous?.revoke();
          return createLocalAssetResolver({
            rootHandle,
            markdownPathSegments: firstFile.pathSegments
          });
        });
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '打开目录失败。');
    }
  }, [expandPath, status, supportsFileSystem]);

  const openFile = useCallback(async () => {
    const previousStatus = status;

    try {
      setStatus('loading');
      setMessage('正在选择 Markdown 文件...');
      const fileHandle = await pickMarkdownFile();
      setSessionAwaitingPermission(null);

      if (!fileHandle) {
        setStatus(previousStatus);
        setMessage(supportsFileSystem ? '' : '当前浏览器不支持 File System Access API。');
        return;
      }

      const file = await fileHandle.getFile();
      const pathSegments = [fileHandle.name];
      const record = createWorkspaceRecord(createVirtualDirectoryHandle('当前文件'));

      setWorkspace(record);
      setTree(createSingleFileTree(record, fileHandle.name, file));
      setFileHandles(new Map([[pathSegments.join('/'), { handle: fileHandle, parentHandle: record.rootHandle }]]));
      setFileUrlDirectoryUrl(null);
      setExpandedIds(new Set([pathSegmentsToId(record.id, [])]));
      setSelectedPath(pathSegments);
      setMarkdown(await file.text());
      setSelectedFileMeta({ size: file.size, lastModified: file.lastModified });
      setAssetResolver((previous: LocalAssetResolver | undefined) => {
        previous?.revoke();
        return undefined;
      });
      setStatus('ready');
      setMessage('单文件模式：如需完整目录树，请使用“打开目录”授权所在目录。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '打开文件失败。');
    }
  }, [status, supportsFileSystem]);

  const loadSample = useCallback(() => {
    const sampleState = createSampleWorkspaceState();
    setSessionAwaitingPermission(null);
    setWorkspace(sampleState.record);
    setTree(sampleState.tree);
    setFileHandles(sampleState.fileHandles);
    setFileUrlDirectoryUrl(null);
    setExpandedIds(sampleState.expandedIds);
    setSelectedPath(sampleState.selectedPath);
    setMarkdown(sampleState.markdown);
    setSelectedFileMeta(null);
    setAssetResolver((previous: LocalAssetResolver | undefined) => {
      previous?.revoke();
      return undefined;
    });
    setStatus('ready');
    setMessage('当前为示例数据模式。');
  }, []);

  const refreshDirectory = useCallback(async () => {
    if (!workspace) {
      return;
    }

    setRefreshingDirectory(true);
    setMessage('正在刷新目录...');

    try {
      const permission = await getWorkspacePermission(workspace.rootHandle);
      if (permission === 'denied') {
        setStatus('error');
        setMessage('目录读取权限已失效，请重新打开目录。');
        return;
      }

      if (permission === 'prompt') {
        const requested = await requestWorkspacePermission(workspace.rootHandle);
        if (requested !== 'granted') {
          setStatus('error');
          setMessage('目录读取权限未授予。');
          return;
        }
      }

      const { nextTree, nextHandles } = await buildTreeFromHandle(workspace, workspace.rootHandle);
      const selectedKey = selectedPath.join('/');
      const selectedStillExists = Boolean(selectedKey) && nextHandles.has(selectedKey);

      setTree(nextTree);
      setFileHandles(nextHandles);
      setExpandedIds((previous) => {
        const validDirectoryIds = collectDirectoryIds(nextTree);
        const next = new Set<string>();
        for (const id of previous) {
          if (validDirectoryIds.has(id)) {
            next.add(id);
          }
        }
        next.add(pathSegmentsToId(workspace.id, []));

        if (selectedStillExists) {
          for (let index = 1; index < selectedPath.length; index += 1) {
            next.add(pathSegmentsToId(workspace.id, selectedPath.slice(0, index)));
          }
        }

        return next;
      });

      if (selectedStillExists) {
        const selectedEntry = nextHandles.get(selectedKey);
        if (isFileSystemHandleEntry(selectedEntry)) {
          const file = await selectedEntry.handle.getFile();
          setMarkdown(await file.text());
          setSelectedFileMeta({ size: file.size, lastModified: file.lastModified });
          setAssetResolver((previous: LocalAssetResolver | undefined) => {
            previous?.revoke();
            return createLocalAssetResolver({
              rootHandle: workspace.rootHandle,
              markdownPathSegments: selectedPath
            });
          });
        }
        setStatus('ready');
        setMessage('目录已刷新。');
        return;
      }

      setSelectedPath([]);
      setMarkdown('');
      setSelectedFileMeta(null);
      setOutlineItems([]);
      setExpandedOutlineIds(new Set());
      setActiveOutlineId(null);
      setAssetResolver((previous: LocalAssetResolver | undefined) => {
        previous?.revoke();
        return undefined;
      });
      setStatus('ready');
      setMessage(selectedKey ? '目录已刷新，原选中文件已不存在。' : '目录已刷新。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '刷新目录失败。');
    } finally {
      setRefreshingDirectory(false);
    }
  }, [selectedPath, workspace]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('sample=1')) {
      loadSample();
    }
  }, [loadSample]);

  const handleSelectOutline = useCallback((id: string) => {
    setActiveOutlineId(id);
    const contentPane = contentPaneRef.current;
    const heading = contentPane?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!contentPane || !heading) {
      return;
    }

    const contentRect = contentPane.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const targetTop = Math.max(0, contentPane.scrollTop + headingRect.top - contentRect.top - 16);

    if (typeof contentPane.scrollTo === 'function') {
      contentPane.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      contentPane.scrollTop = targetTop;
    }
  }, []);

  const scrollContentToTop = useCallback(() => {
    const contentPane = contentPaneRef.current;
    if (!contentPane) {
      return;
    }

    if (typeof contentPane.scrollTo === 'function') {
      contentPane.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      contentPane.scrollTop = 0;
    }
    setScrollTopVisible(false);
  }, []);

  const handleOutlineChange = useCallback((items: DocumentOutlineItem[]) => {
    setOutlineItems(items);
    setExpandedOutlineIds(new Set(items.map((item) => item.id)));
    setActiveOutlineId(items[0]?.id ?? null);
  }, []);

  const toggleOutlineHeading = useCallback((id: string) => {
    setExpandedOutlineIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const contentPane = contentPaneRef.current;
    if (!contentPane || outlineItems.length === 0) {
      return;
    }

    let syncTimeout = 0;

    const syncActiveHeading = () => {
      const contentTop = contentPane.getBoundingClientRect().top;
      const readingOffset = 96;
      let nextActiveId = outlineItems[0]?.id ?? null;
      const headings = new Map(
        Array.from(contentPane.querySelectorAll<HTMLElement>('[id]')).map((heading) => [heading.id, heading])
      );

      for (const item of outlineItems) {
        const heading = headings.get(item.id);
        if (!heading) {
          continue;
        }

        if (heading.getBoundingClientRect().top - contentTop <= readingOffset) {
          nextActiveId = item.id;
        } else {
          break;
        }
      }

      if (nextActiveId) {
        markActiveOutlineRow(nextActiveId);
      }
    };

    const scheduleSync = () => {
      window.clearTimeout(syncTimeout);
      syncTimeout = window.setTimeout(syncActiveHeading, 140);
    };

    syncActiveHeading();
    contentPane.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync);

    return () => {
      window.clearTimeout(syncTimeout);
      contentPane.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
    };
  }, [outlineItems]);

  useEffect(() => {
    const contentPane = contentPaneRef.current;
    if (!contentPane) {
      return;
    }

    const updateScrollTopVisibility = () => {
      const nextVisible = contentPane.scrollTop > contentPane.clientHeight;
      setScrollTopVisible((current) => (current === nextVisible ? current : nextVisible));
    };

    updateScrollTopVisibility();
    contentPane.addEventListener('scroll', updateScrollTopVisibility, { passive: true });
    window.addEventListener('resize', updateScrollTopVisibility);

    return () => {
      contentPane.removeEventListener('scroll', updateScrollTopVisibility);
      window.removeEventListener('resize', updateScrollTopVisibility);
    };
  }, []);

  return (
    <main className="app-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
      <section className={`app-controls ${controlsCollapsed ? 'app-controls-collapsed' : ''}`}>
        <header className="topbar">
          <div className="brand">
            <svg className="brand-logo" viewBox="0 0 128 128" aria-hidden focusable="false">
              <path
                className="brand-logo-primary"
                d="M12 96V32L39 80L66 32V96"
                fill="none"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                className="brand-logo-bright"
                d="M74 96V32L116 96V32"
                fill="none"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="brand-copy">
              <div className="brand-line">
                <strong>MarkNest</strong>
                <span className="brand-divider" aria-hidden />
                <span className="brand-slogan">{brandSlogan}</span>
              </div>
              <small>{workspace?.name ?? '本地 Markdown 文档工作区'}</small>
            </div>
          </div>

          <div className="toolbar" aria-label="主操作">
            <IconButton label="打开目录" onClick={openDirectory} icon={<FolderOpen size={17} />} />
            <IconButton label="打开文件" onClick={openFile} icon={<FilePlus2 size={17} />} />
            <IconButton label="示例" onClick={loadSample} icon={<RefreshCw size={17} />} />
            <IconButton
              label={theme === 'dark' ? '亮色' : '暗色'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              icon={resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            />
            <IconButton
              label="关于"
              onClick={toggleAbout}
              icon={<Info size={17} />}
            />
          </div>
        </header>

        {message && !noticeDismissed ? (
          <div className={`notice ${status === 'error' ? 'notice-error' : ''}`} role="status">
            <AlertCircle size={16} aria-hidden />
            <span>{message}</span>
            {sessionAwaitingPermission ? (
              <button
                type="button"
                className="notice-action-button"
                onClick={continueSessionRestore}
              >
                继续恢复上次目录
              </button>
            ) : null}
            <button
              type="button"
              className="notice-close-button"
              aria-label="关闭提示"
              title="关闭提示"
              onClick={() => setNoticeDismissed(true)}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : aboutVisible ? (
          <AboutPanel onCopyEmail={copyAuthorEmail} emailCopyFeedbackVisible={emailCopyFeedbackVisible} />
        ) : null}
      </section>

      <div className="topbar-toggle-strip">
        <button
          type="button"
          className="topbar-toggle-button"
          aria-label={controlsCollapsed ? '展开顶部操作区域' : '折叠顶部操作区域'}
          title={controlsCollapsed ? '展开顶部操作区域' : '折叠顶部操作区域'}
          onClick={() => setTopbarCollapsed((current) => !current)}
        >
          {controlsCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
      </div>

      <section className="reader-layout">
        <aside className="sidebar" aria-hidden={sidebarCollapsed}>
          <div className="sidebar-tabs" role="tablist" aria-label="侧栏视图">
            <button
              type="button"
              className="sidebar-tab"
              role="tab"
              aria-selected={sidebarMode === 'files'}
              aria-label="显示文件目录"
              onClick={() => setSidebarMode('files')}
            >
              <FolderOpen size={18} />
              <span>目录</span>
            </button>
            <button
              type="button"
              className="sidebar-tab"
              role="tab"
              aria-selected={sidebarMode === 'outline'}
              aria-label="显示文档大纲"
              onClick={() => setSidebarMode('outline')}
            >
              <ListTree size={18} />
              <span>大纲</span>
            </button>
          </div>
          <div className="sidebar-heading">
            <div className="sidebar-heading-main">
              <span>{sidebarMode === 'files' ? '目录' : '大纲'}</span>
              {canRefreshDirectory ? (
                <button
                  type="button"
                  className="sidebar-refresh-button"
                  aria-label="刷新目录"
                  title="刷新目录"
                  disabled={refreshingDirectory}
                  onClick={refreshDirectory}
                >
                  <RefreshCw size={14} aria-hidden />
                </button>
              ) : null}
            </div>
            <small>
              {sidebarMode === 'files'
                ? tree?.kind === 'directory'
                  ? `${tree.markdownCount} 个 Markdown`
                  : '未打开'
                : `${outlineItems.length} 个标题`}
            </small>
          </div>
          {sidebarMode === 'files' ? (
            <FileTreeView
              tree={tree}
              selectedPath={selectedPath}
              expandedIds={expandedIds}
              onToggleDirectory={(id) =>
                setExpandedIds((previous) => {
                  const next = new Set(previous);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  return next;
                })
              }
              onSelectFile={(path) => {
                if (workspace) {
                  expandPath(workspace.id, getParentSegments(path));
                }
                void loadFileByPath(path);
              }}
            />
          ) : (
            <DocumentOutlineView
              items={outlineItems}
              activeId={activeOutlineId}
              expandedIds={expandedOutlineIds}
              onToggleHeading={toggleOutlineHeading}
              onSelectHeading={handleSelectOutline}
            />
          )}
        </aside>

        <button
          type="button"
          className="sidebar-toggle-button"
          aria-label={sidebarCollapsed ? '显示左侧目录或大纲' : '隐藏左侧目录或大纲'}
          title={sidebarCollapsed ? '显示左侧目录或大纲' : '隐藏左侧目录或大纲'}
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>

        <section ref={contentPaneRef} className="content-pane">
          {status === 'loading' ? (
            <section className="markdown-empty">
              <h2>{restoringSession ? '正在恢复...' : '正在加载...'}</h2>
              <p>{restoringSession ? '恢复上次打开的 Markdown 阅读状态。' : '读取本地目录和 Markdown 文件中。'}</p>
            </section>
          ) : (
            <MarkdownViewer
              markdown={markdown}
              resolveAssetUrl={assetResolver}
              theme={resolvedTheme}
              onOutlineChange={handleOutlineChange}
            />
          )}

          {scrollTopVisible ? (
            <button
              type="button"
              className="scroll-top-button"
              aria-label="返回顶部"
              title="返回顶部"
              onClick={scrollContentToTop}
            >
              <ArrowUp size={20} aria-hidden />
            </button>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function createVirtualDirectoryHandle(name: string): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted'
  } as unknown as FileSystemDirectoryHandle & PermissionAwareFileSystemHandle;
}

function createSingleFileTree(
  workspace: WorkspaceRecord,
  fileName: string,
  file: Pick<File, 'size' | 'lastModified'>
): MarkdownTreeNode {
  const pathSegments = [fileName];
  return {
    kind: 'directory',
    id: pathSegmentsToId(workspace.id, []),
    name: '当前文件',
    pathSegments: [],
    markdownCount: 1,
    children: [
      {
        kind: 'file',
        id: pathSegmentsToId(workspace.id, pathSegments),
        name: fileName,
        pathSegments,
        size: file.size,
        lastModified: file.lastModified
      }
    ]
  };
}

function createFileUrlDirectoryState(
  workspace: WorkspaceRecord,
  payload: FileUrlDirectoryStatePayload
): {
  nextTree: MarkdownTreeNode;
  nextHandles: Map<string, FileHandleEntry>;
} {
  const now = payload.createdAt;
  const nextHandles = new Map<string, FileHandleEntry>();
  const root: Extract<MarkdownTreeNode, { kind: 'directory' }> = {
    kind: 'directory',
    id: pathSegmentsToId(workspace.id, []),
    name: payload.directoryName,
    pathSegments: [],
    children: [],
    markdownCount: 0
  };

  for (const entry of payload.entries) {
    const pathSegments = normalizeFileUrlEntryPath(entry);
    if (pathSegments.length === 0) {
      continue;
    }

    nextHandles.set(pathSegments.join('/'), {
      fileUrl: entry.fileUrl,
      size: entry.size ?? 0,
      lastModified: entry.lastModified ?? now
    });

    insertFileUrlTreeNode(root, workspace.id, pathSegments, {
      size: entry.size ?? 0,
      lastModified: entry.lastModified ?? now
    });
  }

  sortVirtualTree(root);
  root.markdownCount = countMarkdownTreeFiles(root);

  return {
    nextTree: root,
    nextHandles
  };
}

function normalizeFileUrlEntryPath(entry: FileUrlDirectoryStateEntry): string[] {
  if (entry.pathSegments && entry.pathSegments.length > 0) {
    return entry.pathSegments;
  }

  return [entry.name];
}

function insertFileUrlTreeNode(
  root: Extract<MarkdownTreeNode, { kind: 'directory' }>,
  workspaceId: string,
  pathSegments: string[],
  fileMeta: { size: number; lastModified: number }
) {
  let current = root;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const directoryPath = pathSegments.slice(0, index + 1);
    const directoryName = pathSegments[index];
    let nextDirectory = current.children.find((child): child is Extract<MarkdownTreeNode, { kind: 'directory' }> => {
      return child.kind === 'directory' && child.name === directoryName;
    });

    if (!nextDirectory) {
      nextDirectory = {
        kind: 'directory',
        id: pathSegmentsToId(workspaceId, directoryPath),
        name: directoryName,
        pathSegments: directoryPath,
        children: [],
        markdownCount: 0
      };
      current.children.push(nextDirectory);
    }

    current = nextDirectory;
  }

  const fileName = pathSegments.at(-1);
  if (!fileName) {
    return;
  }

  current.children.push({
    kind: 'file',
    id: pathSegmentsToId(workspaceId, pathSegments),
    name: fileName,
    pathSegments,
    size: fileMeta.size,
    lastModified: fileMeta.lastModified
  });
}

function sortVirtualTree(node: MarkdownTreeNode) {
  if (node.kind !== 'directory') {
    return;
  }

  node.children.sort(compareTreeNodes);
  node.children.forEach(sortVirtualTree);
}

function countMarkdownTreeFiles(node: MarkdownTreeNode): number {
  if (node.kind === 'file') {
    return 1;
  }

  const count = node.children.reduce((total, child) => total + countMarkdownTreeFiles(child), 0);
  node.markdownCount = count;
  return count;
}

const treeNodeCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base'
});

function compareTreeNodes(left: MarkdownTreeNode, right: MarkdownTreeNode): number {
  if (left.kind !== right.kind) {
    return left.kind === 'directory' ? -1 : 1;
  }

  return treeNodeCollator.compare(left.name, right.name);
}

function createSampleWorkspaceState(): {
  record: WorkspaceRecord;
  tree: MarkdownTreeNode;
  fileHandles: Map<string, FileHandleEntry>;
  expandedIds: Set<string>;
  selectedPath: string[];
  markdown: string;
} {
  const record = createWorkspaceRecord(createVirtualDirectoryHandle(sampleDirectory.name));
  return {
    record,
    tree: buildMarkdownTreeFromEntries(sampleDirectory, record.id),
    fileHandles: new Map(),
    expandedIds: new Set([pathSegmentsToId(record.id, []), pathSegmentsToId(record.id, ['docs'])]),
    selectedPath: ['README.md'],
    markdown: sampleMarkdownByPath.get('README.md') ?? ''
  };
}

function isFileSystemHandleEntry(entry: FileHandleEntry | undefined): entry is FileSystemHandleEntry {
  return Boolean(entry && 'handle' in entry);
}

function createCurrentReaderSession({
  workspace,
  selectedPath,
  expandedIds,
  sidebarMode,
  sidebarCollapsed,
  topbarCollapsed,
  fileHandles,
  markdown,
  selectedFileMeta,
  fileUrlDirectoryUrl
}: {
  workspace: WorkspaceRecord;
  selectedPath: string[];
  expandedIds: Set<string>;
  sidebarMode: SidebarMode;
  sidebarCollapsed: boolean;
  topbarCollapsed: boolean;
  fileHandles: Map<string, FileHandleEntry>;
  markdown: string;
  selectedFileMeta: { size: number; lastModified: number } | null;
  fileUrlDirectoryUrl: string | null;
}): ReaderSession | null {
  const base = {
    workspaceName: workspace.name,
    selectedPath,
    expandedIds: Array.from(expandedIds),
    sidebarMode,
    sidebarCollapsed,
    topbarCollapsed,
    savedAt: Date.now()
  };

  if (workspace.id === `workspace:${sampleDirectory.name}`) {
    return {
      ...base,
      mode: 'sample'
    };
  }

  if (workspace.name === '当前文件') {
    const selectedEntry = fileHandles.get(selectedPath.join('/'));
    const selectedHandle = isFileSystemHandleEntry(selectedEntry) ? selectedEntry.handle : undefined;
    if (!selectedHandle && !markdown.trim()) {
      return null;
    }

    return {
      ...base,
      mode: 'file',
      fileName: selectedPath.at(-1) ?? '未命名.md',
      fileHandle: selectedHandle,
      cachedMarkdown: markdown,
      size: selectedFileMeta?.size,
      lastModified: selectedFileMeta?.lastModified
    };
  }

  const fileUrlEntries = Array.from(fileHandles.entries()).filter((entry): entry is [string, FileUrlHandleEntry] => {
    return 'fileUrl' in entry[1];
  });
  if (fileUrlEntries.length > 0) {
    if (!fileUrlDirectoryUrl) {
      return null;
    }

    return {
      ...base,
      mode: 'file-url-directory',
      directoryUrl: fileUrlDirectoryUrl,
      entries: fileUrlEntries.map(([pathKey, entry]) => {
        const pathSegments = pathKey.split('/').filter(Boolean);
        return {
          name: pathSegments.at(-1) ?? '未命名.md',
          fileUrl: entry.fileUrl,
          pathSegments,
          size: entry.size,
          lastModified: entry.lastModified
        };
      }),
      cachedMarkdown: markdown,
      size: selectedFileMeta?.size,
      lastModified: selectedFileMeta?.lastModified
    };
  }

  return {
    ...base,
    mode: 'directory',
    rootHandle: workspace.rootHandle
  };
}

function AboutPanel({
  onCopyEmail,
  emailCopyFeedbackVisible
}: {
  onCopyEmail: () => void;
  emailCopyFeedbackVisible: boolean;
}) {
  return (
    <section className="about-panel" aria-label="关于 MarkNest">
      <div className="about-links">
        <a
          className="about-link"
          href={authorGithubUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          title="GitHub"
        >
          <Github size={100} strokeWidth={1.7} aria-hidden />
        </a>
        <span className="about-email-action">
          <button
            type="button"
            className="about-link"
            aria-label="Email"
            title={`点击复制作者邮箱地址（${authorEmail}）`}
            onClick={onCopyEmail}
          >
            <Mail size={100} strokeWidth={1.7} aria-hidden />
          </button>
          {emailCopyFeedbackVisible ? (
            <span className="about-copy-feedback" role="status">
              已复制作者邮箱地址
            </span>
          ) : null}
        </span>
        <Image
          className="about-qr"
          src="/about/wx.png"
          alt="微信二维码"
          width={124}
          height={124}
          title="扫码加我微信（备注：MarkNest）"
        />
        <Image
          className="about-qr"
          src="/about/coffee.png"
          alt="微信赞赏二维码"
          width={124}
          height={124}
          title="扫码请作者喝杯饮料，感谢~"
        />
      </div>
    </section>
  );
}

function IconButton({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function useResolvedTheme(theme: ReaderTheme): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemTheme(media.matches ? 'dark' : 'light');
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return theme === 'system' ? systemTheme : theme;
}

async function consumePendingExtensionLaunch() {
  const params = new URLSearchParams(window.location.search);
  const launchType = params.get('launch');
  if (launchType !== 'file-url' && launchType !== 'file-directory') {
    return null;
  }

  const launchId = params.get('id');
  if (!launchId) {
    return null;
  }

  return consumeExtensionLaunchPayload(launchId);
}

async function buildTreeFromHandle(
  workspace: WorkspaceRecord,
  rootHandle: FileSystemDirectoryHandle
): Promise<{
  nextTree: MarkdownTreeNode;
  nextHandles: Map<string, FileHandleEntry>;
}> {
  const { directoryInput, fileHandles } = await collectMarkdownFilesFromDirectory(rootHandle);
  const nextTree = buildMarkdownTreeFromEntries(directoryInput, workspace.id);
  return { nextTree, nextHandles: new Map(fileHandles) };
}

function findPreferredFile(tree: MarkdownTreeNode): Extract<MarkdownTreeNode, { kind: 'file' }> | null {
  if (tree.kind === 'file') {
    return tree;
  }

  const readme = tree.children.find(
    (child) => child.kind === 'file' && /^(readme|index)\.md$/i.test(child.name)
  );
  if (readme?.kind === 'file') {
    return readme;
  }

  for (const child of tree.children) {
    const found = findPreferredFile(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function collectDirectoryIds(tree: MarkdownTreeNode): Set<string> {
  const ids = new Set<string>();

  const collect = (node: MarkdownTreeNode) => {
    if (node.kind !== 'directory') {
      return;
    }

    ids.add(node.id);
    node.children.forEach(collect);
  };

  collect(tree);
  return ids;
}

function pathsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function markActiveOutlineRow(id: string) {
  document.querySelectorAll<HTMLElement>('.outline-row[aria-current="location"]').forEach((row) => {
    if (row.dataset.outlineId !== id) {
      row.removeAttribute('aria-current');
    }
  });

  const nextActiveRow = Array.from(
    document.querySelectorAll<HTMLElement>('.outline-row[data-outline-id]')
  ).find((row) => row.dataset.outlineId === id);
  nextActiveRow?.setAttribute('aria-current', 'location');
}
