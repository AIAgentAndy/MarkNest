'use client';

import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { MarkdownTreeNode } from '../types';

type FileTreeViewProps = {
  tree: MarkdownTreeNode | null;
  selectedPath: string[];
  expandedIds: Set<string>;
  onToggleDirectory: (id: string) => void;
  onSelectFile: (pathSegments: string[]) => void;
};

export function FileTreeView({
  tree,
  selectedPath,
  expandedIds,
  onToggleDirectory,
  onSelectFile
}: FileTreeViewProps) {
  if (!tree || tree.kind !== 'directory' || tree.markdownCount === 0) {
    return <p className="tree-empty">当前目录没有 Markdown 文件。</p>;
  }

  return (
    <nav className="file-tree" aria-label="Markdown 文件树">
      <TreeNode
        node={tree}
        depth={0}
        selectedPath={selectedPath}
        expandedIds={expandedIds}
        onToggleDirectory={onToggleDirectory}
        onSelectFile={onSelectFile}
      />
    </nav>
  );
}

function TreeNode({
  node,
  depth,
  selectedPath,
  expandedIds,
  onToggleDirectory,
  onSelectFile
}: {
  node: MarkdownTreeNode;
  depth: number;
  selectedPath: string[];
  expandedIds: Set<string>;
  onToggleDirectory: (id: string) => void;
  onSelectFile: (pathSegments: string[]) => void;
}) {
  if (node.kind === 'file') {
    const selected = selectedPath.join('/') === node.pathSegments.join('/');
    return (
      <button
        type="button"
        className="tree-row tree-file"
        style={{ paddingInlineStart: depth * 16 + 10 }}
        aria-current={selected ? 'page' : undefined}
        onClick={() => onSelectFile(node.pathSegments)}
      >
        <FileText aria-hidden size={16} />
        <span>{node.name}</span>
      </button>
    );
  }

  const expanded = expandedIds.has(node.id);

  return (
    <div className="tree-group">
      <button
        type="button"
        className="tree-row tree-directory"
        style={{ paddingInlineStart: depth * 16 + 10 }}
        aria-expanded={expanded}
        onClick={() => onToggleDirectory(node.id)}
      >
        {expanded ? <ChevronDown aria-hidden size={16} /> : <ChevronRight aria-hidden size={16} />}
        <Folder aria-hidden size={16} />
        <span>{node.name}</span>
        <small>{node.markdownCount}</small>
      </button>

      {expanded ? (
        <div role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedIds={expandedIds}
              onToggleDirectory={onToggleDirectory}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
