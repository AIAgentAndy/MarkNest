import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import mermaid from 'mermaid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownViewer } from '@/features/markdown-renderer/components/markdown-viewer';

type MermaidParseMock = {
  mockResolvedValueOnce: (value: false) => unknown;
};

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => ({ diagramType: 'flowchart-v2', config: {} })),
    render: vi.fn(async () => ({ svg: '<svg role="img" data-testid="mock-mermaid"></svg>' }))
  }
}));

describe('MarkdownViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把 Markdown 内容渲染到阅读区', async () => {
    render(<MarkdownViewer markdown={'# 标题\n\n正文'} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument();
    });
    expect(screen.getByText('正文')).toBeInTheDocument();
  });

  it('空内容时展示空状态', () => {
    render(<MarkdownViewer markdown="" />);
    expect(screen.getByText('选择左侧 Markdown 文件开始阅读')).toBeInTheDocument();
  });

  it('Markdown 渲染完成后把 Mermaid 源码块替换为 SVG', async () => {
    render(<MarkdownViewer markdown={['```mermaid', 'flowchart LR', 'A-->B', '```'].join('\n')} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid')).toBeInTheDocument();
    });
    expect(mermaid.parse).toHaveBeenCalledWith('flowchart LR\nA-->B', { suppressErrors: true });
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^md-view-mermaid-/),
      'flowchart LR\nA-->B'
    );
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        suppressErrorRendering: true
      })
    );
    expect(screen.queryByText('flowchart LR')).not.toBeInTheDocument();
  });

  it('宽 Mermaid 图表保留原始 viewBox 宽度以便横向滚动查看细节', async () => {
    vi.mocked(mermaid.render).mockResolvedValueOnce({
      diagramType: 'flowchart-v2',
      svg:
        '<svg role="img" data-testid="wide-mermaid" width="100%" viewBox="0 0 4714.87109375 911" style="max-width: 4714.87109375px;"><g></g></svg>'
    });

    render(<MarkdownViewer markdown={['```mermaid', 'graph TB', 'A-->B', '```'].join('\n')} />);

    const svg = await screen.findByTestId('wide-mermaid');
    await waitFor(() => {
      expect(svg).toHaveStyle({
        width: '4714.87109375px',
        maxWidth: 'none',
        height: 'auto'
      });
    });
  });

  it('Mermaid 图表全屏预览保留原始尺寸并可退出', async () => {
    vi.mocked(mermaid.render).mockResolvedValueOnce({
      diagramType: 'flowchart-v2',
      svg:
        '<svg role="img" data-testid="fullscreen-source-mermaid" width="100%" viewBox="0 0 4714.87109375 911" style="max-width: 4714.87109375px;"><g></g></svg>'
    });

    render(<MarkdownViewer markdown={['```mermaid', 'graph TB', 'A-->B', '```'].join('\n')} />);

    const fullscreenButton = await screen.findByRole('button', { name: '全屏查看 Mermaid 图表' });
    fireEvent.click(fullscreenButton);

    const dialog = await screen.findByRole('dialog', { name: 'Mermaid 图表全屏预览' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出全屏 Mermaid 图表' })).toBeInTheDocument();
    const fullscreenSvg = within(dialog).getByTestId('fullscreen-source-mermaid');
    const fullscreenContent = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-content');
    if (!fullscreenContent) {
      throw new Error('Missing fullscreen Mermaid content');
    }
    expect(fullscreenContent).toHaveStyle({
      width: '4714.87109375px'
    });
    expect(fullscreenSvg).toHaveStyle({
      width: '100%',
      maxWidth: 'none',
      height: 'auto'
    });

    const scaleSlider = await within(dialog).findByRole('slider', { name: '缩小 Mermaid 图表' });
    expect(scaleSlider).toHaveAttribute('aria-orientation', 'vertical');
    expect(scaleSlider).toHaveAttribute('aria-valuenow', '100');
    expect(dialog.querySelector('.mermaid-fullscreen-zoom-track')).toBeInTheDocument();
    expect(dialog.querySelector('.mermaid-fullscreen-zoom-thumb')).toBeInTheDocument();

    fireEvent.keyDown(scaleSlider, { key: 'End' });
    expect(fullscreenContent).toHaveStyle({
      width: '707.2306640625px'
    });

    fireEvent.click(screen.getByRole('button', { name: '退出全屏 Mermaid 图表' }));
    expect(screen.queryByRole('dialog', { name: 'Mermaid 图表全屏预览' })).not.toBeInTheDocument();
  });

  it('Mermaid 语法无效时保留源码块且不触发全局错误图渲染', async () => {
    (vi.mocked(mermaid.parse) as unknown as MermaidParseMock).mockResolvedValueOnce(false);

    render(<MarkdownViewer markdown={['```mermaid', 'not mermaid syntax', '```'].join('\n')} />);

    await waitFor(() => {
      expect(mermaid.parse).toHaveBeenCalled();
    });

    expect(mermaid.render).not.toHaveBeenCalled();
    expect(screen.getByText('not mermaid syntax')).toBeInTheDocument();
    expect(screen.queryByText('Syntax error in text')).not.toBeInTheDocument();
  });

  it('主题切换后重新渲染 Mermaid 图表', async () => {
    const markdown = ['```mermaid', 'flowchart LR', 'A-->B', '```'].join('\n');
    const { rerender } = render(<MarkdownViewer markdown={markdown} theme="light" />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });

    rerender(<MarkdownViewer markdown={markdown} theme="dark" />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(2);
    });
  });

  it('父组件用相同内容重渲染时不重复渲染 Mermaid 图表', async () => {
    const markdown = ['```mermaid', 'flowchart LR', 'A-->B', '```'].join('\n');
    const { rerender } = render(<MarkdownViewer markdown={markdown} theme="light" />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });

    rerender(<MarkdownViewer markdown={markdown} theme="light" />);

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  it('向调用方同步当前文档大纲', async () => {
    const onOutlineChange = vi.fn();

    render(
      <MarkdownViewer
        markdown={['# 总览', '', '## 核心流程', '', '正文'].join('\n')}
        onOutlineChange={onOutlineChange}
      />
    );

    await waitFor(() => {
      expect(onOutlineChange).toHaveBeenLastCalledWith([
        { id: '总览', depth: 1, text: '总览' },
        { id: '核心流程', depth: 2, text: '核心流程' }
      ]);
    });
  });

  it('大文档先渲染首段，再逐步追加剩余段落', async () => {
    const originalRequestIdleCallback = window.requestIdleCallback;
    const callbacks: IdleRequestCallback[] = [];
    window.requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    window.cancelIdleCallback = vi.fn();

    try {
      const markdown = Array.from(
        { length: 36 },
        (_, index) => `## 标题 ${index + 1}\n\n${`正文 ${index + 1} `.repeat(220)}`
      ).join('\n\n');

      render(<MarkdownViewer markdown={markdown} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '标题 1' })).toBeInTheDocument();
      });
      expect(screen.queryByRole('heading', { name: '标题 36' })).not.toBeInTheDocument();
      expect(callbacks.length).toBeGreaterThan(0);

      await act(async () => {
        while (callbacks.length > 0) {
          const callback = callbacks.shift();
          callback?.({
            didTimeout: false,
            timeRemaining: () => 50
          } as IdleDeadline);
        }
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '标题 36' })).toBeInTheDocument();
      });
    } finally {
      window.requestIdleCallback = originalRequestIdleCallback;
    }
  });
});
