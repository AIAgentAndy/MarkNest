'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DocumentOutlineItem } from '../lib/document-outline';
import { buildDocumentOutlineTree, type DocumentOutlineTreeNode } from '../lib/document-outline';

type DocumentOutlineViewProps = {
  items: DocumentOutlineItem[];
  activeId: string | null;
  expandedIds: Set<string>;
  onToggleHeading: (id: string) => void;
  onSelectHeading: (id: string) => void;
};

export function DocumentOutlineView({
  items,
  activeId,
  expandedIds,
  onToggleHeading,
  onSelectHeading
}: DocumentOutlineViewProps) {
  if (items.length === 0) {
    return <p className="outline-empty">当前文档没有可展示的大纲。</p>;
  }

  const tree = buildDocumentOutlineTree(items);

  return (
    <nav className="document-outline" aria-label="当前文档大纲">
      {tree.map((node) => (
        <OutlineNode
          key={node.id}
          node={node}
          activeId={activeId}
          expandedIds={expandedIds}
          onToggleHeading={onToggleHeading}
          onSelectHeading={onSelectHeading}
        />
      ))}
    </nav>
  );
}

function OutlineNode({
  node,
  activeId,
  expandedIds,
  onToggleHeading,
  onSelectHeading
}: {
  node: DocumentOutlineTreeNode;
  activeId: string | null;
  expandedIds: Set<string>;
  onToggleHeading: (id: string) => void;
  onSelectHeading: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);

  return (
    <>
      <div
        className="outline-row-wrap"
        style={{ paddingLeft: `${8 + Math.max(node.depth - 1, 0) * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="outline-toggle"
            aria-label={`${expanded ? '折叠' : '展开'} ${node.text}`}
            onClick={() => onToggleHeading(node.id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="outline-toggle-placeholder" />
        )}
        <button
          type="button"
          className="outline-row"
          data-outline-id={node.id}
          aria-current={activeId === node.id ? 'location' : undefined}
          onClick={() => onSelectHeading(node.id)}
        >
          <span>{node.text}</span>
        </button>
      </div>
      {hasChildren && expanded
        ? node.children.map((child) => (
            <OutlineNode
              key={child.id}
              node={child}
              activeId={activeId}
              expandedIds={expandedIds}
              onToggleHeading={onToggleHeading}
              onSelectHeading={onSelectHeading}
            />
          ))
        : null}
    </>
  );
}
