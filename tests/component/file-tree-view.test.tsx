import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileTreeView } from '@/features/file-tree/components/file-tree-view';
import type { MarkdownTreeNode } from '@/features/file-tree/types';

const tree: MarkdownTreeNode = {
  kind: 'directory',
  id: 'workspace:root',
  name: 'root',
  pathSegments: [],
  markdownCount: 2,
  children: [
    {
      kind: 'directory',
      id: 'workspace:docs',
      name: 'docs',
      pathSegments: ['docs'],
      markdownCount: 1,
      children: [
        {
          kind: 'file',
          id: 'workspace:docs/guide.md',
          name: 'guide.md',
          pathSegments: ['docs', 'guide.md'],
          size: 1,
          lastModified: 1
        }
      ]
    },
    {
      kind: 'file',
      id: 'workspace:README.md',
      name: 'README.md',
      pathSegments: ['README.md'],
      size: 1,
      lastModified: 1
    }
  ]
};

describe('FileTreeView', () => {
  it('展示目录树并在点击文件时回调', () => {
    const onSelectFile = vi.fn();

    render(
      <FileTreeView
        tree={tree}
        selectedPath={['README.md']}
        expandedIds={new Set(['workspace:root', 'workspace:docs'])}
        onToggleDirectory={vi.fn()}
        onSelectFile={onSelectFile}
      />
    );

    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /README\.md/ })).toHaveAttribute(
      'aria-current',
      'page'
    );

    fireEvent.click(screen.getByText('guide.md'));
    expect(onSelectFile).toHaveBeenCalledWith(['docs', 'guide.md']);
  });
});
