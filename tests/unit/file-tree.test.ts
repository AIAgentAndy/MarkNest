import { describe, expect, it } from 'vitest';
import {
  buildMarkdownTreeFromEntries,
  shouldIgnoreDirectory
} from '@/features/file-tree/lib/tree-builder';
import type { DirectoryEntryInput } from '@/features/file-tree/types';

const fixture: DirectoryEntryInput = {
  kind: 'directory',
  name: 'root',
  children: [
    {
      kind: 'directory',
      name: 'node_modules',
      children: [{ kind: 'file', name: 'ignored.md', size: 1, lastModified: 1 }]
    },
    {
      kind: 'directory',
      name: 'docs',
      children: [
        { kind: 'file', name: 'b.md', size: 2, lastModified: 2 },
        { kind: 'file', name: 'a.md', size: 1, lastModified: 1 },
        { kind: 'file', name: 'image.png', size: 3, lastModified: 3 },
        {
          kind: 'directory',
          name: 'empty',
          children: [{ kind: 'file', name: 'note.txt', size: 1, lastModified: 1 }]
        }
      ]
    },
    { kind: 'file', name: 'README.md', size: 5, lastModified: 5 }
  ]
};

describe('tree-builder', () => {
  it('忽略隐藏目录和常见大型目录', () => {
    expect(shouldIgnoreDirectory('.git')).toBe(true);
    expect(shouldIgnoreDirectory('node_modules')).toBe(true);
    expect(shouldIgnoreDirectory('docs')).toBe(false);
  });

  it('只保留 Markdown 文件以及包含 Markdown 的父目录，并稳定排序', () => {
    const tree = buildMarkdownTreeFromEntries(fixture, 'workspace-1');

    expect(tree).toMatchObject({
      kind: 'directory',
      name: 'root',
      markdownCount: 3
    });
    expect(tree.kind).toBe('directory');
    if (tree.kind !== 'directory') {
      throw new Error('测试夹具根节点应生成目录树。');
    }

    expect(tree.children.map((node) => node.name)).toEqual(['docs', 'README.md']);

    const docs = tree.children[0];
    expect(docs.kind).toBe('directory');
    if (docs.kind === 'directory') {
      expect(docs.markdownCount).toBe(2);
      expect(docs.children.map((node) => node.name)).toEqual(['a.md', 'b.md']);
    }
  });
});
