import { isMarkdownFileName } from '@/shared/path/path-utils';

export type FileUrlLaunchPayload =
  | FileUrlFileLaunchPayload
  | FileUrlDirectoryLaunchPayload;

export type FileUrlFileLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

export type FileUrlDirectoryLaunchPayload = {
  type: 'file-directory';
  directoryName: string;
  directoryUrl: string;
  entries: FileUrlDirectoryMarkdownEntry[];
  selectedPathSegments?: string[];
  selectedMarkdown?: string;
  createdAt: number;
};

export type FileUrlDirectoryMarkdownEntry = {
  name: string;
  fileUrl: string;
  pathSegments?: string[];
  size?: number;
  lastModified?: number;
};

const maxDirectoryDepth = 6;
const maxMarkdownEntries = 500;

export async function createFileUrlDirectoryLaunchPayload(
  payload: FileUrlFileLaunchPayload
): Promise<FileUrlDirectoryLaunchPayload | null> {
  const fileUrl = parseFileUrl(payload.fileUrl);
  if (!fileUrl || !isMarkdownFileName(decodeURIComponent(fileUrl.pathname).split('/').at(-1) ?? '')) {
    return null;
  }

  const directoryUrl = getParentDirectoryUrl(fileUrl);
  if (!directoryUrl) {
    return null;
  }

  const entries = await collectMarkdownEntriesFromDirectoryUrl(directoryUrl);
  const selectedPathSegments = getRelativePathSegments(directoryUrl, fileUrl.href);
  const hasSelectedFile = entries.some((entry) => {
    return entry.fileUrl === fileUrl.href || pathsEqual(entry.pathSegments ?? [entry.name], selectedPathSegments);
  });

  if (!hasSelectedFile) {
    entries.unshift({
      name: payload.fileName,
      fileUrl: fileUrl.href,
      pathSegments: selectedPathSegments,
      size: new Blob([payload.markdown]).size,
      lastModified: payload.createdAt
    });
  }

  return {
    type: 'file-directory',
    directoryName: getDirectoryName(directoryUrl),
    directoryUrl,
    entries,
    selectedPathSegments,
    selectedMarkdown: payload.markdown,
    createdAt: payload.createdAt
  };
}

export async function collectMarkdownEntriesFromDirectoryUrl(
  rootDirectoryUrl: string
): Promise<FileUrlDirectoryMarkdownEntry[]> {
  const entries: FileUrlDirectoryMarkdownEntry[] = [];
  const visited = new Set<string>();
  const queue: Array<{ directoryUrl: string; pathSegments: string[]; depth: number }> = [
    { directoryUrl: rootDirectoryUrl, pathSegments: [], depth: 0 }
  ];

  while (queue.length > 0 && entries.length < maxMarkdownEntries) {
    const current = queue.shift();
    if (!current || visited.has(current.directoryUrl) || current.depth > maxDirectoryDepth) {
      continue;
    }

    visited.add(current.directoryUrl);
    const html = await fetchDirectoryHtml(current.directoryUrl);
    if (!html) {
      continue;
    }

    for (const directoryEntry of extractDirectoryEntries(html)) {
      const childUrl = toFileUrl(
        directoryEntry.isDirectory && !directoryEntry.href.endsWith('/')
          ? `${directoryEntry.href}/`
          : directoryEntry.href,
        current.directoryUrl
      );
      if (!childUrl || childUrl.href === current.directoryUrl || !childUrl.href.startsWith(rootDirectoryUrl)) {
        continue;
      }

      const childName = decodeURIComponent(childUrl.pathname).split('/').filter(Boolean).at(-1);
      if (!childName || childName === '..' || childName === '.') {
        continue;
      }

      if (directoryEntry.isDirectory || childUrl.pathname.endsWith('/')) {
        if (shouldSkipDirectory(childName)) {
          continue;
        }

        queue.push({
          directoryUrl: childUrl.href,
          pathSegments: [...current.pathSegments, childName],
          depth: current.depth + 1
        });
        continue;
      }

      if (!isMarkdownFileName(childName)) {
        continue;
      }

      entries.push({
        name: childName,
        fileUrl: childUrl.href,
        pathSegments: [...current.pathSegments, childName]
      });

      if (entries.length >= maxMarkdownEntries) {
        break;
      }
    }
  }

  return sortDirectoryEntries(entries);
}

async function fetchDirectoryHtml(directoryUrl: string): Promise<string | null> {
  try {
    const response = await fetch(directoryUrl, {
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!response.ok && !(response.status === 0 && directoryUrl.startsWith('file://'))) {
      return null;
    }

    return response.text();
  } catch {
    return null;
  }
}

function extractDirectoryEntries(html: string): Array<{ href: string; isDirectory: boolean }> {
  return [
    ...extractAnchorDirectoryEntries(html),
    ...extractChromeAddRowDirectoryEntries(html)
  ];
}

function extractAnchorDirectoryEntries(html: string): Array<{ href: string; isDirectory: boolean }> {
  const entries: Array<{ href: string; isDirectory: boolean }> = [];
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? '');
    entries.push({
      href,
      isDirectory: href.endsWith('/')
    });
  }

  return entries;
}

function extractChromeAddRowDirectoryEntries(html: string): Array<{ href: string; isDirectory: boolean }> {
  const entries: Array<{ href: string; isDirectory: boolean }> = [];
  const addRowPattern = /addRow\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,\s*([01])\s*,/g;
  let match: RegExpExecArray | null;

  while ((match = addRowPattern.exec(html)) !== null) {
    const href = parseJavaScriptStringLiteral(match[1]);
    if (!href) {
      continue;
    }

    entries.push({
      href,
      isDirectory: match[2] === '1'
    });
  }

  return entries;
}

function parseJavaScriptStringLiteral(value: string): string | null {
  try {
    return JSON.parse(value.replace(/^'/, '"').replace(/'$/, '"')) as string;
  } catch {
    return null;
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function toFileUrl(href: string, baseUrl: string): URL | null {
  if (!href || href.startsWith('#') || href.startsWith('?')) {
    return null;
  }

  try {
    const url = new URL(href, baseUrl);
    return url.protocol === 'file:' ? url : null;
  } catch {
    return null;
  }
}

function parseFileUrl(fileUrl: string): URL | null {
  try {
    const parsed = new URL(fileUrl);
    return parsed.protocol === 'file:' ? parsed : null;
  } catch {
    return null;
  }
}

function getParentDirectoryUrl(fileUrl: URL): string | null {
  try {
    return new URL('.', fileUrl).href;
  } catch {
    return null;
  }
}

function getDirectoryName(directoryUrl: string): string {
  const parsed = new URL(directoryUrl);
  return decodeURIComponent(parsed.pathname).split('/').filter(Boolean).at(-1) ?? '本地目录';
}

function getRelativePathSegments(rootDirectoryUrl: string, fileUrl: string): string[] {
  const root = new URL(rootDirectoryUrl);
  const file = new URL(fileUrl);
  const rootSegments = decodeURIComponent(root.pathname).split('/').filter(Boolean);
  const fileSegments = decodeURIComponent(file.pathname).split('/').filter(Boolean);
  return fileSegments.slice(rootSegments.length);
}

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || ['node_modules', 'dist', 'build', '.next', '.turbo'].includes(name);
}

function sortDirectoryEntries(entries: FileUrlDirectoryMarkdownEntry[]): FileUrlDirectoryMarkdownEntry[] {
  const collator = new Intl.Collator('zh-CN', {
    numeric: true,
    sensitivity: 'base'
  });
  return [...entries].sort((left, right) => {
    const leftPath = left.pathSegments ?? [left.name];
    const rightPath = right.pathSegments ?? [right.name];
    return collator.compare(leftPath.join('/'), rightPath.join('/'));
  });
}

function pathsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
