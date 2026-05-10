import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '@/features/workspace/components/reader-app';

describe('ReaderApp about panel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
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
    window.history.replaceState(null, '', '/');
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('在品牌名后展示统一 slogan，并保留工作区状态', () => {
    const { container } = render(<ReaderApp />);

    const brand = container.querySelector('.brand');
    expect(brand).toHaveTextContent('MarkNest');
    expect(screen.getByText('让 Markdown 文档优雅归巢')).toBeInTheDocument();
    expect(screen.getByText('本地 Markdown 文档工作区')).toBeInTheDocument();
  });

  it('把设置入口替换为关于，并展示作者联系方式', async () => {
    render(<ReaderApp />);

    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关于' }));

    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/AIAgentAndy/MarkNest'
    );
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email' })).toHaveAttribute(
      'title',
      '点击复制作者邮箱地址（AIAgentAndy001@gmail.com）'
    );
    expect(screen.getByRole('img', { name: '微信二维码' })).toHaveAttribute(
      'title',
      '扫码加我微信（备注：MarkNest）'
    );
    expect(screen.getByRole('img', { name: '微信赞赏二维码' })).toHaveAttribute(
      'title',
      '扫码请作者喝杯饮料，感谢~'
    );
  });

  it('点击 Email 后复制作者邮箱，并只在 Email 图标附近提示', async () => {
    const { container } = render(<ReaderApp />);

    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    fireEvent.click(screen.getByRole('button', { name: 'Email' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AIAgentAndy001@gmail.com');
    await waitFor(() => {
      expect(screen.getByText('已复制作者邮箱地址')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Email' }).parentElement).toHaveTextContent(
      '已复制作者邮箱地址'
    );
    expect(container.querySelector('.notice')).not.toBeInTheDocument();
  });

  it('关于面板和全局 notice 互斥显示', async () => {
    const { container } = render(<ReaderApp />);

    fireEvent.click(screen.getByRole('button', { name: '示例' }));
    expect(screen.getByText('当前为示例数据模式。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    expect(container.querySelector('.notice')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '示例' }));

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('当前为示例数据模式。')).toBeInTheDocument();
  });

  it('notice 区域支持手动关闭，并在新提示出现时重新显示', async () => {
    render(<ReaderApp />);

    fireEvent.click(screen.getByRole('button', { name: '示例' }));
    expect(screen.getByText('当前为示例数据模式。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));
    expect(screen.queryByText('当前为示例数据模式。')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }));

    await waitFor(() => {
      expect(screen.getByText(/当前浏览器不支持 File System Access API|正在选择 Markdown 文件/)).toBeInTheDocument();
    });
  });

  it('正文滚动超过一屏后显示返回顶部按钮，回到顶部后隐藏', async () => {
    const { container } = render(<ReaderApp />);

    fireEvent.click(screen.getByRole('button', { name: '示例' }));

    const contentPane = container.querySelector<HTMLElement>('.content-pane');
    expect(contentPane).toBeTruthy();
    if (!contentPane) {
      throw new Error('测试需要正文滚动容器。');
    }

    Object.defineProperty(contentPane, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(contentPane, 'scrollTop', { configurable: true, writable: true, value: 520 });
    await act(async () => {
      fireEvent.scroll(contentPane);
    });

    expect(screen.getByRole('button', { name: '返回顶部' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '返回顶部' }));
    });
    expect(contentPane.scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: '打开目录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关于' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.scroll(contentPane, { target: { scrollTop: 0 } });
    });
    expect(screen.queryByRole('button', { name: '返回顶部' })).not.toBeInTheDocument();
  });

  it('取消打开文件后保留当前工作区且不显示错误提示', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'))
    });

    const { container } = render(<ReaderApp />);
    fireEvent.click(screen.getByRole('button', { name: '示例' }));
    expect(screen.getByText('当前为示例数据模式。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'MarkNest 示例' })).toBeInTheDocument();
    });
    expect(container.querySelector('.document-header')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '当前位置' })).not.toBeInTheDocument();
    expect(container.querySelector('.notice-error')).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to execute/)).not.toBeInTheDocument();
  });

  it('从扩展 file URL 启动载荷进入单文件阅读模式', async () => {
    const get = vi.fn().mockResolvedValue({
      'marknest-launch:launch-1': {
        type: 'file-url',
        fileName: 'from-finder.md',
        fileUrl: 'file:///Users/example/from-finder.md',
        markdown: '# From Finder\n\n正文',
        createdAt: 1777651200000
      }
    });
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get,
          remove
        }
      }
    });
    window.history.pushState(null, '', '/?launch=file-url&id=launch-1');

    render(<ReaderApp />);

    expect(await screen.findByRole('heading', { name: 'From Finder' })).toBeInTheDocument();
    expect(screen.getByText('正文')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'from-finder.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '当前位置' })).not.toBeInTheDocument();
    expect(screen.getByText('已从本地文件打开 Markdown；如需完整目录树，请使用“打开目录”。')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('marknest-launch:launch-1');
    expect(remove).toHaveBeenCalledWith('marknest-launch:launch-1');
  });

  it('点击大纲标题时只滚动正文容器，不触发页面级 scrollIntoView', async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });

    try {
      const { container } = render(<ReaderApp />);

      fireEvent.click(screen.getByRole('button', { name: '示例' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'MarkNest 示例' })).toBeInTheDocument();
      });

      const contentPane = container.querySelector<HTMLElement>('.content-pane');
      expect(contentPane).toBeTruthy();
      if (!contentPane) {
        throw new Error('测试需要正文滚动容器。');
      }

      const scrollTo = vi.fn();
      Object.defineProperty(contentPane, 'scrollTo', {
        configurable: true,
        value: scrollTo
      });

      fireEvent.click(screen.getByRole('tab', { name: '显示文档大纲' }));
      fireEvent.click(screen.getByRole('button', { name: '核心流程' }));

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '打开目录' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView
      });
    }
  });

  it('目录刷新后重新扫描 Markdown 文件并处理当前文件被删除', async () => {
    const readmeFile = createMockFileHandle('README.md', '# README');
    const addedFile = createMockFileHandle('added.md', '# Added');
    let refreshCount = 0;
    const rootHandle = {
      kind: 'directory',
      name: 'docs',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      async *values() {
        refreshCount += 1;
        if (refreshCount === 1) {
          yield readmeFile;
          return;
        }

        yield addedFile;
      }
    } as unknown as FileSystemDirectoryHandle;

    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn().mockResolvedValue(rootHandle)
    });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn()
    });

    render(<ReaderApp />);

    fireEvent.click(screen.getByRole('button', { name: '打开目录' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /README\.md/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('navigation', { name: '当前位置' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新目录' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /added\.md/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /README\.md/ })).not.toBeInTheDocument();
    expect(screen.getByText('目录已刷新，原选中文件已不存在。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '选择左侧 Markdown 文件开始阅读' })).toBeInTheDocument();
  });
});

function createMockFileHandle(name: string, content: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: vi.fn().mockResolvedValue(
      new File([content], name, {
        type: 'text/markdown',
        lastModified: 1777651200000
      })
    )
  } as unknown as FileSystemFileHandle;
}
