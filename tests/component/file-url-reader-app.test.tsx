import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileUrlReaderApp } from '@/features/workspace/components/file-url-reader-app';
import { navigateToFileUrl } from '@/features/workspace/lib/navigate-to-file-url';
import type { FileUrlDirectoryLaunchPayload, FileUrlFileLaunchPayload } from '@/features/workspace/lib/file-url-launch';

vi.mock('@/features/workspace/lib/navigate-to-file-url', () => ({
  navigateToFileUrl: vi.fn()
}));

describe('FileUrlReaderApp', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.title = '';
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    window.localStorage.clear();
    vi.mocked(navigateToFileUrl).mockClear();
  });

  it('在 file:// Markdown 页面内直接渲染当前文件，并识别同级和子目录目录树', async () => {
    const fetchMarkdown = vi.fn(async (url: string) => {
      const markdownByUrl = new Map([
        ['file:///Users/example/docs/current.md', '# Current\n\n当前文件'],
        ['file:///Users/example/docs/README.md', '# README\n\n首页'],
        ['file:///Users/example/docs/sub/guide.markdown', '# Guide\n\n说明']
      ]);
      return new Response(markdownByUrl.get(url) ?? '', {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMarkdown);

    render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    expect(screen.getByText('当前文件')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    fireEvent.click(screen.getByRole('tab', { name: '显示文件目录' }));
    expect(screen.getByRole('button', { name: /current\.md/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /README\.md/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sub/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /guide\.markdown/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sub/ }));
    fireEvent.click(screen.getByRole('button', { name: /guide\.markdown/ }));

    // 点击本地文件触发整页导航，地址栏由新页面承载，应用内不再读取该文件正文。
    expect(navigateToFileUrl).toHaveBeenCalledWith('file:///Users/example/docs/sub/guide.markdown');
    expect(fetchMarkdown).not.toHaveBeenCalled();
  });

  it('目录树默认只展开当前文件所在路径，其他目录需要手动点击后才展示子项', async () => {
    render(<FileUrlReaderApp payload={createNestedLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current Nested' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    fireEvent.click(screen.getByRole('tab', { name: '显示文件目录' }));

    expect(screen.getByRole('button', { name: /sub/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /current\.md/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /sibling\.md/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nested/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /deep\.md/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /old\.md/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /archive/ }));
    expect(screen.getByRole('button', { name: /old\.md/ })).toBeInTheDocument();
  });

  it('渲染 file:// 正文页时，标签页 title 只显示当前文件名', async () => {
    render(<FileUrlReaderApp payload={createFileLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Standalone' })).toBeInTheDocument();
    expect(document.title).toBe('standalone.md');
  });

  it('从目录切换到其他 Markdown 时，标签页 title 同步为选中文件名', async () => {
    const fetchMarkdown = vi.fn(async (_url: string) => {
      return new Response('# Guide\n\n说明', {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMarkdown);

    render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    expect(document.title).toBe('current.md');
    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    fireEvent.click(screen.getByRole('tab', { name: '显示文件目录' }));
    fireEvent.click(screen.getByRole('button', { name: /sub/ }));
    fireEvent.click(screen.getByRole('button', { name: /guide\.markdown/ }));

    // 整页导航切换文件，标签页 title 由新页面在挂载时同步。
    expect(navigateToFileUrl).toHaveBeenCalledWith('file:///Users/example/docs/sub/guide.markdown');
  });

  it('目录载荷缺少当前正文时，自动读取选中文件并渲染正文和大纲', async () => {
    const fetchMarkdown = vi.fn(async (_url: string) => {
      return new Response('# Current\n\n## Section\n\n当前文件', {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMarkdown);

    render(
      <FileUrlReaderApp
        payload={{
          ...createLaunchPayload(),
          selectedMarkdown: undefined
        }}
      />
    );

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Section' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    expect(await screen.findByRole('button', { name: 'Current' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Section' })).toBeInTheDocument();
    expect(fetchMarkdown).toHaveBeenCalledWith('file:///Users/example/docs/current.md');
  });

  it('切换目录中的其他 file:// Markdown 时，优先通过扩展后台读取正文', async () => {
    const fetchMarkdown = vi.fn();
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({
        ok: true,
        markdown: '# Guide\n\n后台读取的子目录文件'
      });
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });
    vi.stubGlobal('fetch', fetchMarkdown);

    render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    fireEvent.click(screen.getByRole('tab', { name: '显示文件目录' }));
    fireEvent.click(screen.getByRole('button', { name: /sub/ }));
    fireEvent.click(screen.getByRole('button', { name: /guide\.markdown/ }));

    // 点击本地文件改为整页导航，不再通过后台读取正文。
    expect(navigateToFileUrl).toHaveBeenCalledWith('file:///Users/example/docs/sub/guide.markdown');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchMarkdown).not.toHaveBeenCalled();
  });

  it('右上角只保留菜单图标，点击后展示浮动下拉菜单且不再显示打开文件和打开目录', async () => {
    const { container } = render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    const shell = container.querySelector('.file-url-app-shell');
    expect(shell).toHaveAttribute('data-controls-visible', 'false');
    expect(screen.queryByRole('button', { name: '打开目录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开文件' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关于' })).not.toBeInTheDocument();
    expect(container.querySelector('.floating-control-toggle')).toHaveClass('floating-control-toggle');

    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));

    expect(shell).toHaveAttribute('data-controls-visible', 'true');
    expect(screen.getByRole('menu', { name: '阅读菜单' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开目录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开文件' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换原始内容' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换全屏' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打印' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '反馈' })).toHaveAttribute(
      'href',
      'https://github.com/AIAgentAndy/MarkNest/issues'
    );
    expect(screen.getByRole('button', { name: '关于' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/AIAgentAndy/MarkNest'
    );

    fireEvent.click(screen.getByRole('button', { name: '隐藏阅读菜单' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    expect(shell).toHaveAttribute('data-controls-visible', 'false');
    expect(screen.queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument();
  });

  it('阅读菜单支持源码切换、打印、亮暗设置和全屏切换', async () => {
    const print = vi.fn();
    const requestFullscreen = vi.fn();
    const exitFullscreen = vi.fn();
    let fullscreenElement: Element | null = null;
    vi.stubGlobal('print', print);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: async () => {
        fullscreenElement = document.documentElement;
        requestFullscreen();
        document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async () => {
        fullscreenElement = null;
        exitFullscreen();
        document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement
    });

    render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));

    fireEvent.click(screen.getByRole('button', { name: '切换原始内容' }));
    expect(screen.getByRole('region', { name: 'Markdown 原始内容' })).toHaveTextContent('# Current');
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));
    expect(screen.getByRole('button', { name: '恢复渲染内容' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复渲染内容' }));
    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));

    fireEvent.click(screen.getByRole('button', { name: '打印' }));
    await waitFor(() => {
      expect(print).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '亮色' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));

    fireEvent.click(screen.getByRole('button', { name: '切换全屏' }));
    expect(requestFullscreen).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));
    expect(await screen.findByRole('button', { name: '退出全屏' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出全屏' }));
    expect(exitFullscreen).toHaveBeenCalled();
  });

  it('阅读菜单打开后点击正文空白区域会自动隐藏菜单', async () => {
    render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));
    expect(screen.getByRole('menu', { name: '阅读菜单' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('当前文件'));

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    });
  });

  it('点击打印时先隐藏阅读菜单，再调用浏览器打印', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);

    render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示阅读菜单' }));
    expect(screen.getByRole('menu', { name: '阅读菜单' })).toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '打印' }));

    expect(screen.queryByRole('menu', { name: '阅读菜单' })).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(print).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('默认隐藏目录大纲栏，展开后默认显示当前正文大纲', async () => {
    const { container } = render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    const shell = container.querySelector('.file-url-app-shell');
    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'true');
    expect(screen.getByRole('button', { name: '显示左侧目录或大纲' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));

    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'false');
    expect(screen.getByRole('tab', { name: '显示文档大纲' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'Current' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /current\.md/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '隐藏左侧目录或大纲' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '隐藏左侧目录或大纲' }));

    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'true');
  });

  it('拖拽目录和正文之间的分隔线时调整侧栏宽度，拖到左侧阈值后隐藏侧栏', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280
    });
    const { container } = render(<FileUrlReaderApp payload={createLaunchPayload()} />);

    expect(await screen.findByRole('heading', { name: 'Current' })).toBeInTheDocument();
    const shell = container.querySelector<HTMLElement>('.file-url-app-shell');
    if (!shell) {
      throw new Error('测试需要 file URL 阅读器外壳。');
    }

    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    const resizer = screen.getByRole('separator', { name: '调整目录和正文宽度' });

    fireEvent.pointerDown(resizer, { clientX: 320, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 520, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 520, pointerId: 1 });

    expect(shell.style.getPropertyValue('--sidebar-width')).toBe('520px');
    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'false');

    fireEvent.pointerDown(resizer, { clientX: 520, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 80, pointerId: 2 });
    fireEvent.pointerUp(window, { clientX: 80, pointerId: 2 });

    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'true');
  });

  it('侧栏展开状态与宽度按目录持久化，整页导航后重新挂载可恢复', async () => {
    const { container, unmount } = render(<FileUrlReaderApp payload={createLaunchPayload()} />);
    await screen.findByRole('heading', { name: 'Current' });

    let shell = container.querySelector<HTMLElement>('.file-url-app-shell');
    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '显示左侧目录或大纲' }));
    fireEvent.click(screen.getByRole('tab', { name: '显示文件目录' }));
    shell = container.querySelector<HTMLElement>('.file-url-app-shell');
    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'false');
    expect(screen.getByRole('tab', { name: '显示文件目录' })).toHaveAttribute('aria-selected', 'true');

    unmount();

    const { container: secondContainer } = render(<FileUrlReaderApp payload={createLaunchPayload()} />);
    await screen.findByRole('heading', { name: 'Current' });
    const restoredShell = secondContainer.querySelector<HTMLElement>('.file-url-app-shell');
    // 整页导航会重置组件状态，持久化的侧栏布局在重新挂载时同步恢复。
    expect(restoredShell).toHaveAttribute('data-sidebar-collapsed', 'false');
    expect(screen.getByRole('tab', { name: '显示文件目录' })).toHaveAttribute('aria-selected', 'true');
  });
});

function createLaunchPayload(): FileUrlDirectoryLaunchPayload {
  return {
    type: 'file-directory',
    directoryName: 'docs',
    directoryUrl: 'file:///Users/example/docs/',
    selectedPathSegments: ['current.md'],
    selectedMarkdown: '# Current\n\n当前文件',
    entries: [
      {
        name: 'current.md',
        fileUrl: 'file:///Users/example/docs/current.md',
        pathSegments: ['current.md']
      },
      {
        name: 'README.md',
        fileUrl: 'file:///Users/example/docs/README.md',
        pathSegments: ['README.md']
      },
      {
        name: 'guide.markdown',
        fileUrl: 'file:///Users/example/docs/sub/guide.markdown',
        pathSegments: ['sub', 'guide.markdown']
      }
    ],
    createdAt: 1777651200000
  };
}

function createFileLaunchPayload(): FileUrlFileLaunchPayload {
  return {
    type: 'file-url',
    fileName: 'standalone.md',
    fileUrl: 'file:///Users/example/docs/standalone.md',
    markdown: '# Standalone\n\n独立文件',
    createdAt: 1777651200000
  };
}

function createNestedLaunchPayload(): FileUrlDirectoryLaunchPayload {
  return {
    type: 'file-directory',
    directoryName: 'docs',
    directoryUrl: 'file:///Users/example/docs/',
    selectedPathSegments: ['sub', 'current.md'],
    selectedMarkdown: '# Current Nested\n\n当前子目录文件',
    entries: [
      {
        name: 'root.md',
        fileUrl: 'file:///Users/example/docs/root.md',
        pathSegments: ['root.md']
      },
      {
        name: 'current.md',
        fileUrl: 'file:///Users/example/docs/sub/current.md',
        pathSegments: ['sub', 'current.md']
      },
      {
        name: 'sibling.md',
        fileUrl: 'file:///Users/example/docs/sub/sibling.md',
        pathSegments: ['sub', 'sibling.md']
      },
      {
        name: 'deep.md',
        fileUrl: 'file:///Users/example/docs/sub/nested/deep.md',
        pathSegments: ['sub', 'nested', 'deep.md']
      },
      {
        name: 'old.md',
        fileUrl: 'file:///Users/example/docs/archive/old.md',
        pathSegments: ['archive', 'old.md']
      }
    ],
    createdAt: 1777651200000
  };
}
