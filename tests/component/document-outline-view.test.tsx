import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentOutlineView } from '@/features/markdown-renderer/components/document-outline-view';

describe('DocumentOutlineView', () => {
  it('展示大纲层级并在点击标题时回调', () => {
    const onSelectHeading = vi.fn();

    render(
      <DocumentOutlineView
        items={[
          { id: 'overview', depth: 1, text: '总览' },
          { id: 'flow', depth: 2, text: '核心流程' }
        ]}
        activeId="flow"
        expandedIds={new Set(['overview'])}
        onToggleHeading={vi.fn()}
        onSelectHeading={onSelectHeading}
      />
    );

    expect(screen.getByRole('button', { name: '总览' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '核心流程' })).toHaveAttribute('aria-current', 'location');

    fireEvent.click(screen.getByRole('button', { name: '核心流程' }));
    expect(onSelectHeading).toHaveBeenCalledWith('flow');
  });

  it('没有标题时展示空状态', () => {
    render(
      <DocumentOutlineView
        items={[]}
        activeId={null}
        expandedIds={new Set()}
        onToggleHeading={vi.fn()}
        onSelectHeading={vi.fn()}
      />
    );

    expect(screen.getByText('当前文档没有可展示的大纲。')).toBeInTheDocument();
  });

  it('点击箭头折叠或展开子标题', () => {
    const onToggleHeading = vi.fn();

    render(
      <DocumentOutlineView
        items={[
          { id: 'overview', depth: 1, text: '总览' },
          { id: 'flow', depth: 2, text: '核心流程' }
        ]}
        activeId={null}
        expandedIds={new Set(['overview'])}
        onToggleHeading={onToggleHeading}
        onSelectHeading={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '折叠 总览' }));

    expect(onToggleHeading).toHaveBeenCalledWith('overview');
  });

  it('父标题折叠后隐藏子标题', () => {
    render(
      <DocumentOutlineView
        items={[
          { id: 'overview', depth: 1, text: '总览' },
          { id: 'flow', depth: 2, text: '核心流程' }
        ]}
        activeId={null}
        expandedIds={new Set()}
        onToggleHeading={vi.fn()}
        onSelectHeading={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '总览' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '核心流程' })).not.toBeInTheDocument();
  });

  it('高亮跟随时不调用原生 scrollIntoView，避免带动正文滚动', () => {
    const prototype = HTMLElement.prototype as HTMLElement & {
      scrollIntoView?: Element['scrollIntoView'];
    };
    const originalScrollIntoView = prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    prototype.scrollIntoView = scrollIntoView as Element['scrollIntoView'];

    try {
      render(
        <DocumentOutlineView
          items={[
            { id: 'overview', depth: 1, text: '总览' },
            { id: 'flow', depth: 2, text: '核心流程' }
          ]}
          activeId="flow"
          expandedIds={new Set(['overview'])}
          onToggleHeading={vi.fn()}
          onSelectHeading={vi.fn()}
        />
      );

      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      if (originalScrollIntoView) {
        prototype.scrollIntoView = originalScrollIntoView;
      } else {
        Reflect.deleteProperty(prototype, 'scrollIntoView');
      }
    }
  });
});
