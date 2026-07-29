'use client';

import {
  AlertCircle,
  ArrowUp,
  Code2,
  FolderOpen,
  Github,
  Info,
  ListTree,
  Mail,
  Maximize2,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Settings,
  Sun,
  X
} from 'lucide-react';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { FileTreeView } from '@/features/file-tree/components/file-tree-view';
import type { MarkdownTreeNode } from '@/features/file-tree/types';
import { DocumentOutlineView } from '@/features/markdown-renderer/components/document-outline-view';
import { MarkdownViewer } from '@/features/markdown-renderer/components/markdown-viewer';
import type { DocumentOutlineItem } from '@/features/markdown-renderer/lib/document-outline';
import type { AssetUrlResolver } from '@/features/markdown-renderer/types';
import { getParentSegments, pathSegmentsToId } from '@/shared/path/path-utils';
import { sampleMarkdownByPath } from '../lib/sample-workspace';
import { readFileUrlTextFromBackground } from '../lib/file-url-background-client';
import { navigateToFileUrl } from '../lib/navigate-to-file-url';
import type {
  FileUrlDirectoryLaunchPayload,
  FileUrlDirectoryMarkdownEntry,
  FileUrlLaunchPayload
} from '../lib/file-url-launch';
import type { ReaderTheme, SidebarMode, WorkspaceRecord } from '../types';

type FileUrlHandleEntry = {
  fileUrl: string;
  size: number;
  lastModified: number;
};

type ReaderStatus = 'loading' | 'ready' | 'error';

const authorGithubUrl = 'https://github.com/AIAgentAndy/MarkNest';
const issueFeedbackUrl = 'https://github.com/AIAgentAndy/MarkNest/issues';
const authorEmail = 'AIAgentAndy001@gmail.com';
const defaultSidebarWidth = 320;
const minimumSidebarWidth = 240;
const collapseSidebarPointerX = 132;

export function FileUrlReaderApp({ payload }: { payload: FileUrlLaunchPayload }) {
  const contentPaneRef = useRef<HTMLElement | null>(null);
  const menuPopoverRef = useRef<HTMLElement | null>(null);
  const menuToggleRef = useRef<HTMLButtonElement | null>(null);
  const emailCopyTimeoutRef = useRef<number | null>(null);
  const initialState = createInitialState(payload);
  const [workspace] = useState(initialState.workspace);
  const [tree] = useState(initialState.tree);
  const [fileHandles] = useState(initialState.fileHandles);
  const [expandedIds, setExpandedIds] = useState(initialState.expandedIds);
  const [selectedPath, setSelectedPath] = useState(initialState.selectedPath);
  const [markdown, setMarkdown] = useState(initialState.markdown);
  const [status, setStatus] = useState<ReaderStatus>('ready');
  const [message, setMessage] = useState(initialState.message);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [sourceVisible, setSourceVisible] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [emailCopyFeedbackVisible, setEmailCopyFeedbackVisible] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>('system');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(initialState.sidebar.mode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialState.sidebar.collapsed);
  const [sidebarWidth, setSidebarWidth] = useState(initialState.sidebar.width);
  const [outlineItems, setOutlineItems] = useState<DocumentOutlineItem[]>([]);
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(new Set());
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [scrollTopVisible, setScrollTopVisible] = useState(false);

  const resolvedTheme = useResolvedTheme(theme);
  const assetResolver = useCallback<AssetUrlResolver>(
    async (src) => resolveFileUrlAsset(src, selectedPath, fileHandles),
    [fileHandles, selectedPath]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const selectedFileName = selectedPath.at(-1);
    if (selectedFileName) {
      document.title = selectedFileName;
    }
  }, [selectedPath]);

  useEffect(() => {
    if (message) {
      setNoticeDismissed(false);
    }
  }, [message]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setFullscreenActive(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    return () => {
      if (emailCopyTimeoutRef.current !== null) {
        window.clearTimeout(emailCopyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!controlsVisible) {
      return;
    }

    const closeMenuFromOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (menuPopoverRef.current?.contains(target) || menuToggleRef.current?.contains(target)) {
        return;
      }

      setSettingsVisible(false);
      setAboutVisible(false);
      setControlsVisible(false);
    };

    document.addEventListener('pointerdown', closeMenuFromOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeMenuFromOutsidePointer);
  }, [controlsVisible]);

  const readMarkdownText = useCallback(async (fileUrl: string) => {
    const backgroundMarkdown = await readFileUrlTextFromBackground(fileUrl);
    if (backgroundMarkdown !== null) {
      return backgroundMarkdown;
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`读取本地 Markdown 失败：${response.status}`);
    }

    return response.text();
  }, []);

  const loadFileByPath = useCallback(
    async (pathSegments: string[]) => {
      const entry = fileHandles.get(pathSegments.join('/'));
      if (!entry) {
        setStatus('error');
        setMessage('未找到该文件，请重新从本地目录页打开。');
        return;
      }

      try {
        setStatus('loading');
        setSelectedPath(pathSegments);
        const sample = entry.fileUrl.startsWith('marknest://sample/')
          ? sampleMarkdownByPath.get(pathSegments.join('/'))
          : undefined;
        setMarkdown(sample ?? await readMarkdownText(entry.fileUrl));
        setSourceVisible(false);
        setStatus('ready');
        setMessage('');
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : '读取本地 Markdown 文件失败。');
      }
    },
    [fileHandles, readMarkdownText]
  );

  useEffect(() => {
    if (status !== 'ready' || markdown.trim() || selectedPath.length === 0) {
      return;
    }

    void loadFileByPath(selectedPath);
  }, [loadFileByPath, markdown, selectedPath, status]);

  const expandPath = useCallback((pathSegments: string[]) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      next.add(pathSegmentsToId(workspace.id, []));
      for (let index = 1; index <= pathSegments.length; index += 1) {
        next.add(pathSegmentsToId(workspace.id, pathSegments.slice(0, index)));
      }
      return next;
    });
  }, [workspace.id]);

  // 点击目录树中的本地文件时整页导航到该文件 URL，确保浏览器地址栏更新为完整路径。
  // 示例模式（marknest://）或未命中文件句柄时回退到应用内加载，不触发导航。
  const navigateToFile = useCallback(
    (pathSegments: string[]) => {
      const entry = fileHandles.get(pathSegments.join('/'));
      if (!entry || entry.fileUrl.startsWith('marknest://')) {
        expandPath(getParentSegments(pathSegments));
        void loadFileByPath(pathSegments);
        return;
      }

      navigateToFileUrl(entry.fileUrl);
    },
    [expandPath, fileHandles, loadFileByPath]
  );

  // 侧栏布局属于阅读偏好，整页导航后会随页面重置，因此全局持久化到 localStorage，
  // 挂载时同步恢复，避免每次切换文件都要重新展开侧栏（跨子目录导航也保持一致）。
  useEffect(() => {
    writeReaderSidebarState({
      collapsed: sidebarCollapsed,
      mode: sidebarMode,
      width: sidebarWidth
    });
  }, [sidebarCollapsed, sidebarMode, sidebarWidth]);

  const toggleSourceVisible = useCallback(() => {
    setSourceVisible((current) => !current);
    setSettingsVisible(false);
    setAboutVisible(false);
    setControlsVisible(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      setSettingsVisible(false);
      setAboutVisible(false);
      setControlsVisible(false);
      return;
    }

    void document.documentElement.requestFullscreen?.();
    setSettingsVisible(false);
    setAboutVisible(false);
    setControlsVisible(false);
  }, []);

  const printCurrentPage = useCallback(() => {
    setSettingsVisible(false);
    setAboutVisible(false);
    setControlsVisible(false);
    window.setTimeout(() => {
      window.print();
    }, 0);
  }, []);

  const chooseTheme = useCallback((nextTheme: ReaderTheme) => {
    setTheme(nextTheme);
    setSettingsVisible(false);
    setAboutVisible(false);
    setControlsVisible(false);
  }, []);

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

  const handleOutlineChange = useCallback((items: DocumentOutlineItem[]) => {
    setOutlineItems(items);
    setExpandedOutlineIds(new Set(items.map((item) => item.id)));
    setActiveOutlineId(items[0]?.id ?? null);
  }, []);

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

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);

  const handleSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSidebarCollapsed(false);

    const applyWidthFromPointer = (clientX: number) => {
      if (!Number.isFinite(clientX)) {
        return;
      }

      if (clientX <= collapseSidebarPointerX) {
        setSidebarCollapsed(true);
        return;
      }

      const pageWidth = Math.max(window.innerWidth, minimumSidebarWidth * 2);
      const maximumSidebarWidth = Math.floor(pageWidth / 2);
      const nextWidth = Math.min(Math.max(clientX, minimumSidebarWidth), maximumSidebarWidth);
      setSidebarWidth(nextWidth);
      setSidebarCollapsed(false);
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      applyWidthFromPointer(pointerEvent.clientX);
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      applyWidthFromPointer(pointerEvent.clientX);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, []);

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
    return () => contentPane.removeEventListener('scroll', updateScrollTopVisibility);
  }, []);

  useEffect(() => {
    const contentPane = contentPaneRef.current;
    if (!contentPane || outlineItems.length === 0) {
      return;
    }

    let syncTimeout = 0;
    const syncActiveHeading = () => {
      const contentTop = contentPane.getBoundingClientRect().top;
      let nextActiveId = outlineItems[0]?.id ?? null;
      const headings = new Map(
        Array.from(contentPane.querySelectorAll<HTMLElement>('[id]')).map((heading) => [heading.id, heading])
      );
      for (const item of outlineItems) {
        const heading = headings.get(item.id);
        if (!heading) {
          continue;
        }
        if (heading.getBoundingClientRect().top - contentTop <= 96) {
          nextActiveId = item.id;
        } else {
          break;
        }
      }
      setActiveOutlineId(nextActiveId);
    };
    const scheduleSync = () => {
      window.clearTimeout(syncTimeout);
      syncTimeout = window.setTimeout(syncActiveHeading, 140);
    };

    syncActiveHeading();
    contentPane.addEventListener('scroll', scheduleSync, { passive: true });
    return () => {
      window.clearTimeout(syncTimeout);
      contentPane.removeEventListener('scroll', scheduleSync);
    };
  }, [outlineItems]);

  return (
    <main
      className="app-shell file-url-app-shell"
      data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
      data-controls-visible={controlsVisible ? 'true' : 'false'}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <button
        ref={menuToggleRef}
        type="button"
        className="floating-control-toggle"
        aria-label={controlsVisible ? '隐藏阅读菜单' : '显示阅读菜单'}
        title={controlsVisible ? '隐藏阅读菜单' : '显示阅读菜单'}
        onClick={() => {
          setControlsVisible((current) => {
            const nextVisible = !current;
            if (!nextVisible) {
              setSettingsVisible(false);
              setAboutVisible(false);
            }
            return nextVisible;
          });
        }}
      >
        <Menu size={21} aria-hidden />
      </button>

      {controlsVisible ? (
        <section ref={menuPopoverRef} className="reader-menu-popover" role="menu" aria-label="阅读菜单">
          <button type="button" className="reader-menu-item" onClick={toggleSourceVisible}>
            <Code2 size={17} aria-hidden />
            <span>{sourceVisible ? '恢复渲染内容' : '切换原始内容'}</span>
          </button>
          <button type="button" className="reader-menu-item" onClick={toggleFullscreen}>
            <Maximize2 size={17} aria-hidden />
            <span>{fullscreenActive ? '退出全屏' : '切换全屏'}</span>
          </button>
          <button type="button" className="reader-menu-item" onClick={printCurrentPage}>
            <Printer size={17} aria-hidden />
            <span>打印</span>
          </button>
          <button
            type="button"
            className="reader-menu-item"
            aria-expanded={settingsVisible}
            onClick={() => {
              setSettingsVisible((current) => !current);
              setAboutVisible(false);
            }}
          >
            <Settings size={17} aria-hidden />
            <span>设置</span>
          </button>
          {settingsVisible ? (
            <div className="reader-menu-settings" aria-label="主题设置">
              <button
                type="button"
                className="reader-theme-option"
                aria-pressed={theme === 'light'}
                onClick={() => chooseTheme('light')}
              >
                <Sun size={16} aria-hidden />
                <span>亮色</span>
              </button>
              <button
                type="button"
                className="reader-theme-option"
                aria-pressed={theme === 'dark'}
                onClick={() => chooseTheme('dark')}
              >
                <Moon size={16} aria-hidden />
                <span>暗色</span>
              </button>
            </div>
          ) : null}
          <a
            className="reader-menu-item"
            href={issueFeedbackUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              setSettingsVisible(false);
              setAboutVisible(false);
              setControlsVisible(false);
            }}
          >
            <AlertCircle size={17} aria-hidden />
            <span>反馈</span>
          </a>
          <button
            type="button"
            className="reader-menu-item"
            aria-expanded={aboutVisible}
            onClick={() => {
              setAboutVisible((current) => !current);
              setSettingsVisible(false);
            }}
          >
            <Info size={17} aria-hidden />
            <span>关于</span>
          </button>
          {message && !noticeDismissed ? (
            <div className={`notice ${status === 'error' ? 'notice-error' : ''}`} role="status">
              <AlertCircle size={16} aria-hidden />
              <span>{message}</span>
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
          ) : null}
          {aboutVisible ? (
            <AboutPanel onCopyEmail={copyAuthorEmail} emailCopyFeedbackVisible={emailCopyFeedbackVisible} />
          ) : null}
        </section>
      ) : null}

      <section className="reader-layout file-url-reader-layout">
        <button
          type="button"
          className="sidebar-peek-toggle"
          aria-label={sidebarCollapsed ? '显示左侧目录或大纲' : '隐藏左侧目录或大纲'}
          title={sidebarCollapsed ? '显示左侧目录或大纲' : '隐藏左侧目录或大纲'}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={20} aria-hidden /> : <PanelLeftClose size={20} aria-hidden />}
        </button>

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
            </div>
            <small>
              {sidebarMode === 'files'
                ? `${tree.markdownCount} 个 Markdown`
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
                void navigateToFile(path);
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
          className="sidebar-resizer"
          role="separator"
          aria-label="调整目录和正文宽度"
          aria-orientation="vertical"
          title="拖动调整目录和正文宽度"
          onPointerDown={handleSidebarResizeStart}
        />

        <section ref={contentPaneRef} className="content-pane">
          {status === 'loading' ? (
            <section className="markdown-empty">
              <h2>正在加载...</h2>
              <p>读取本地 Markdown 文件中。</p>
            </section>
          ) : sourceVisible ? (
            <section className="markdown-source-view" role="region" aria-label="Markdown 原始内容">
              <pre>{markdown}</pre>
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

type ReaderSidebarState = {
  collapsed: boolean;
  width: number;
  mode: SidebarMode;
};

const defaultReaderSidebarState: ReaderSidebarState = {
  collapsed: true,
  width: defaultSidebarWidth,
  mode: 'outline'
};

// file:// 下 localStorage 跨文件共享（同属 null origin），侧栏布局作为阅读偏好全局持久化，
// 使整页导航切换文件（含跨子目录）后侧栏仍保持之前的展开状态与宽度和模式。
function readReaderSidebarState(): ReaderSidebarState {
  try {
    const raw = window.localStorage.getItem('marknest:reader-sidebar');
    if (!raw) {
      return { ...defaultReaderSidebarState };
    }

    const parsed = JSON.parse(raw) as Partial<ReaderSidebarState>;
    return {
      collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : defaultReaderSidebarState.collapsed,
      width:
        typeof parsed.width === 'number' && parsed.width >= minimumSidebarWidth
          ? parsed.width
          : defaultReaderSidebarState.width,
      mode: parsed.mode === 'files' || parsed.mode === 'outline' ? parsed.mode : defaultReaderSidebarState.mode
    };
  } catch {
    return { ...defaultReaderSidebarState };
  }
}

function writeReaderSidebarState(state: ReaderSidebarState): void {
  try {
    window.localStorage.setItem('marknest:reader-sidebar', JSON.stringify(state));
  } catch {
    // 部分浏览器对 file:// localStorage 写入有限制，忽略以保证阅读体验。
  }
}

function createInitialState(payload: FileUrlLaunchPayload): {
  workspace: WorkspaceRecord;
  tree: Extract<MarkdownTreeNode, { kind: 'directory' }>;
  fileHandles: Map<string, FileUrlHandleEntry>;
  expandedIds: Set<string>;
  selectedPath: string[];
  markdown: string;
  message: string;
  sidebar: { collapsed: boolean; width: number; mode: SidebarMode };
} {
  if (payload.type === 'file-directory') {
    const workspace = createWorkspaceRecord(payload.directoryName);
    const { tree, fileHandles } = createFileUrlTreeState(workspace, payload);
    const selectedPath = payload.selectedPathSegments && fileHandles.has(payload.selectedPathSegments.join('/'))
      ? payload.selectedPathSegments
      : findPreferredFile(tree)?.pathSegments ?? [];
    return {
      workspace,
      tree,
      fileHandles,
      expandedIds: collectVisibleDirectoryIds(workspace.id, selectedPath),
      selectedPath,
      markdown: payload.selectedMarkdown && pathsEqual(selectedPath, payload.selectedPathSegments ?? [])
        ? payload.selectedMarkdown
        : '',
      message: '',
      sidebar: readReaderSidebarState()
    };
  }

  const workspace = createWorkspaceRecord('当前文件');
  const selectedPath = [payload.fileName];
  const tree = createSingleFileTree(workspace, payload.fileName, {
    size: new Blob([payload.markdown]).size,
    lastModified: payload.createdAt
  });
  return {
    workspace,
    tree,
    fileHandles: payload.fileUrl
      ? new Map([[payload.fileName, {
        fileUrl: payload.fileUrl,
        size: new Blob([payload.markdown]).size,
        lastModified: payload.createdAt
      }]])
      : new Map(),
    expandedIds: new Set([pathSegmentsToId(workspace.id, [])]),
    selectedPath,
    markdown: payload.markdown,
    message: '',
    sidebar: readReaderSidebarState()
  };
}

function createWorkspaceRecord(name: string): WorkspaceRecord {
  const now = Date.now();
  return {
    id: `workspace:${name}`,
    name,
    rootHandle: {
      kind: 'directory',
      name
    } as unknown as FileSystemDirectoryHandle,
    createdAt: now,
    lastOpenedAt: now
  };
}

function createFileUrlTreeState(
  workspace: WorkspaceRecord,
  payload: FileUrlDirectoryLaunchPayload
): {
  tree: Extract<MarkdownTreeNode, { kind: 'directory' }>;
  fileHandles: Map<string, FileUrlHandleEntry>;
} {
  const fileHandles = new Map<string, FileUrlHandleEntry>();
  const root: Extract<MarkdownTreeNode, { kind: 'directory' }> = {
    kind: 'directory',
    id: pathSegmentsToId(workspace.id, []),
    name: payload.directoryName,
    pathSegments: [],
    children: [],
    markdownCount: 0
  };

  for (const entry of payload.entries) {
    const pathSegments = normalizeEntryPath(entry);
    if (pathSegments.length === 0) {
      continue;
    }

    fileHandles.set(pathSegments.join('/'), {
      fileUrl: entry.fileUrl,
      size: entry.size ?? 0,
      lastModified: entry.lastModified ?? payload.createdAt
    });
    insertTreeFile(root, workspace.id, pathSegments, {
      size: entry.size ?? 0,
      lastModified: entry.lastModified ?? payload.createdAt
    });
  }

  sortTree(root);
  root.markdownCount = countTreeFiles(root);
  return { tree: root, fileHandles };
}

function normalizeEntryPath(entry: FileUrlDirectoryMarkdownEntry): string[] {
  return entry.pathSegments && entry.pathSegments.length > 0 ? entry.pathSegments : [entry.name];
}

function insertTreeFile(
  root: Extract<MarkdownTreeNode, { kind: 'directory' }>,
  workspaceId: string,
  pathSegments: string[],
  meta: { size: number; lastModified: number }
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
    size: meta.size,
    lastModified: meta.lastModified
  });
}

const treeNodeCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base'
});

function sortTree(node: MarkdownTreeNode) {
  if (node.kind !== 'directory') {
    return;
  }
  node.children.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return treeNodeCollator.compare(left.name, right.name);
  });
  node.children.forEach(sortTree);
}

function countTreeFiles(node: MarkdownTreeNode): number {
  if (node.kind === 'file') {
    return 1;
  }
  const count = node.children.reduce((total, child) => total + countTreeFiles(child), 0);
  node.markdownCount = count;
  return count;
}

function createSingleFileTree(
  workspace: WorkspaceRecord,
  fileName: string,
  file: { size: number; lastModified: number }
): Extract<MarkdownTreeNode, { kind: 'directory' }> {
  const pathSegments = [fileName];
  return {
    kind: 'directory',
    id: pathSegmentsToId(workspace.id, []),
    name: workspace.name,
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

function collectVisibleDirectoryIds(workspaceId: string, selectedPath: string[]): Set<string> {
  const ids = new Set<string>([pathSegmentsToId(workspaceId, [])]);
  const parentSegments = getParentSegments(selectedPath);
  for (let index = 1; index <= parentSegments.length; index += 1) {
    ids.add(pathSegmentsToId(workspaceId, parentSegments.slice(0, index)));
  }
  return ids;
}

function pathsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

async function resolveFileUrlAsset(
  src: string,
  selectedPath: string[],
  fileHandles: Map<string, FileUrlHandleEntry>
): Promise<string | null> {
  if (/^(https?:|data:|blob:|chrome-extension:|file:)/i.test(src)) {
    return src;
  }
  const selectedEntry = fileHandles.get(selectedPath.join('/'));
  if (!selectedEntry?.fileUrl) {
    return null;
  }
  try {
    return new URL(src, selectedEntry.fileUrl).href;
  } catch {
    return null;
  }
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
        {/* 扩展内 file:// 直渲染页面使用 chrome-extension:// 静态资源，不能交给 Next Image 优化。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="about-qr"
          src={resolveExtensionAssetUrl('/about/wx.png')}
          alt="微信二维码"
          width={124}
          height={124}
          title="扫码加我微信（备注：MarkNest）"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="about-qr"
          src={resolveExtensionAssetUrl('/about/coffee.png')}
          alt="微信赞赏二维码"
          width={124}
          height={124}
          title="扫码请作者喝杯饮料，感谢~"
        />
      </div>
    </section>
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

function resolveExtensionAssetUrl(path: string): string {
  const chromeRuntime = globalThis.chrome?.runtime;
  if (chromeRuntime?.getURL) {
    return chromeRuntime.getURL(path.replace(/^\//, ''));
  }
  return path;
}
