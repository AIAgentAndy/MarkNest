import GithubSlugger from 'github-slugger';
import type { Heading, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export type DocumentOutlineItem = {
  id: string;
  depth: number;
  text: string;
};

export type DocumentOutlineTreeNode = DocumentOutlineItem & {
  children: DocumentOutlineTreeNode[];
};

export function extractDocumentOutline(markdown: string): DocumentOutlineItem[] {
  if (!markdown.trim()) {
    return [];
  }

  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const slugger = new GithubSlugger();
  const outline: DocumentOutlineItem[] = [];

  visit(tree, 'heading', (node: Heading) => {
    const text = toString(node).trim();
    if (!text) {
      return;
    }

    outline.push({
      id: slugger.slug(text),
      depth: node.depth,
      text
    });
  });

  return outline;
}

export function buildDocumentOutlineTree(items: DocumentOutlineItem[]): DocumentOutlineTreeNode[] {
  const roots: DocumentOutlineTreeNode[] = [];
  const stack: DocumentOutlineTreeNode[] = [];

  for (const item of items) {
    const node: DocumentOutlineTreeNode = {
      ...item,
      children: []
    };

    while (stack.length > 0 && stack.at(-1)!.depth >= node.depth) {
      stack.pop();
    }

    const parent = stack.at(-1);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return roots;
}
