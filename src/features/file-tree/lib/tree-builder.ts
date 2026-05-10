import { isMarkdownFileName, pathSegmentsToId } from '@/shared/path/path-utils';
import type { DirectoryEntryInput, MarkdownTreeNode } from '../types';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'build'
]);

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base'
});

export function shouldIgnoreDirectory(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRECTORIES.has(name);
}

export function buildMarkdownTreeFromEntries(
  root: DirectoryEntryInput,
  workspaceId: string
): MarkdownTreeNode {
  if (root.kind !== 'directory') {
    throw new Error('根节点必须是目录。');
  }

  const tree = buildDirectoryNode(root, workspaceId, []);

  if (!tree) {
    return {
      kind: 'directory',
      id: pathSegmentsToId(workspaceId, []),
      name: root.name,
      pathSegments: [],
      children: [],
      markdownCount: 0
    };
  }

  return tree;
}

function buildDirectoryNode(
  directory: Extract<DirectoryEntryInput, { kind: 'directory' }>,
  workspaceId: string,
  parentSegments: string[]
): Extract<MarkdownTreeNode, { kind: 'directory' }> | null {
  const pathSegments = parentSegments;
  const children: MarkdownTreeNode[] = [];

  for (const child of directory.children) {
    if (child.kind === 'directory') {
      if (shouldIgnoreDirectory(child.name)) {
        continue;
      }

      const directoryNode = buildDirectoryNode(child, workspaceId, [...pathSegments, child.name]);
      if (directoryNode && directoryNode.markdownCount > 0) {
        children.push(directoryNode);
      }
      continue;
    }

    if (isMarkdownFileName(child.name)) {
      const filePathSegments = [...pathSegments, child.name];
      children.push({
        kind: 'file',
        id: pathSegmentsToId(workspaceId, filePathSegments),
        name: child.name,
        pathSegments: filePathSegments,
        size: child.size,
        lastModified: child.lastModified
      });
    }
  }

  children.sort(compareTreeNodes);

  const markdownCount = children.reduce((count, child) => {
    return count + (child.kind === 'directory' ? child.markdownCount : 1);
  }, 0);

  if (markdownCount === 0 && pathSegments.length > 0) {
    return null;
  }

  return {
    kind: 'directory',
    id: pathSegmentsToId(workspaceId, pathSegments),
    name: pathSegments.length === 0 ? directory.name : directory.name,
    pathSegments,
    children,
    markdownCount
  };
}

function compareTreeNodes(left: MarkdownTreeNode, right: MarkdownTreeNode): number {
  if (left.kind !== right.kind) {
    return left.kind === 'directory' ? -1 : 1;
  }

  return collator.compare(left.name, right.name);
}
