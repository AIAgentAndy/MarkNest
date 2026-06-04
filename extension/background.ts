/// <reference types="chrome" />

type LocalMarkdownLaunchMessage = {
  type: 'MARKNEST_OPEN_LOCAL_FILE_URL';
  fileName: string;
  fileUrl: string;
  markdown: string;
};

type LocalDirectoryLaunchMessage = {
  type: 'MARKNEST_OPEN_LOCAL_DIRECTORY_URL';
  directoryName: string;
  directoryUrl: string;
  entries: LocalDirectoryMarkdownEntry[];
};

type LocalDirectoryMarkdownEntry = {
  name: string;
  fileUrl: string;
  pathSegments?: string[];
};

export type MarkNestFileLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

export type MarkNestDirectoryLaunchPayload = {
  type: 'file-directory';
  directoryName: string;
  directoryUrl: string;
  entries: LocalDirectoryMarkdownEntry[];
  selectedPathSegments?: string[];
  selectedMarkdown?: string;
  createdAt: number;
};

export type MarkNestLaunchPayload =
  | MarkNestFileLaunchPayload
  | MarkNestDirectoryLaunchPayload;

if (typeof chrome !== 'undefined') {
  chrome.action.onClicked.addListener(async () => {
    // 打开扩展内的静态 Next.js 页面，所有本地文件读取都在页面端完成。
    await chrome.tabs.create({
      url: chrome.runtime.getURL('index.html')
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    void handleExtensionMessage(message);
  });
}

export async function handleExtensionMessage(message: unknown): Promise<boolean> {
  if (isLocalMarkdownLaunchMessage(message)) {
    const indexedDirectory = await createIndexedDirectoryLaunchPayload(message);
    if (indexedDirectory) {
      await openMarkNestLaunchPage('file-directory', indexedDirectory);
      return true;
    }

    await openMarkNestLaunchPage('file-url', {
      type: 'file-url',
      fileName: message.fileName,
      fileUrl: message.fileUrl,
      markdown: message.markdown,
      createdAt: Date.now()
    });
    return true;
  }

  if (isLocalDirectoryLaunchMessage(message)) {
    await openMarkNestLaunchPage('file-directory', {
      type: 'file-directory',
      directoryName: message.directoryName,
      directoryUrl: message.directoryUrl,
      entries: message.entries,
      createdAt: Date.now()
    });
    return true;
  }

  return false;
}

async function openMarkNestLaunchPage(
  launchType: MarkNestLaunchPayload['type'],
  payload: MarkNestLaunchPayload
) {
  const launchId = crypto.randomUUID();
  const storageKey = `marknest-launch:${launchId}`;

  await chrome.storage.session.set({
    [storageKey]: payload
  });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`index.html?launch=${launchType}&id=${encodeURIComponent(launchId)}`)
  });
}

function isLocalMarkdownLaunchMessage(message: unknown): message is LocalMarkdownLaunchMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<LocalMarkdownLaunchMessage>;
  return (
    candidate.type === 'MARKNEST_OPEN_LOCAL_FILE_URL' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileUrl === 'string' &&
    typeof candidate.markdown === 'string' &&
    candidate.markdown.trim().length > 0
  );
}

function isLocalDirectoryLaunchMessage(message: unknown): message is LocalDirectoryLaunchMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<LocalDirectoryLaunchMessage>;
  return (
    candidate.type === 'MARKNEST_OPEN_LOCAL_DIRECTORY_URL' &&
    typeof candidate.directoryName === 'string' &&
    typeof candidate.directoryUrl === 'string' &&
    Array.isArray(candidate.entries) &&
    candidate.entries.length > 0 &&
    candidate.entries.every(isLocalDirectoryMarkdownEntry)
  );
}

function isLocalDirectoryMarkdownEntry(entry: unknown): entry is LocalDirectoryMarkdownEntry {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const candidate = entry as Partial<LocalDirectoryMarkdownEntry>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.fileUrl === 'string' &&
    (
      candidate.pathSegments === undefined ||
      (
        Array.isArray(candidate.pathSegments) &&
        candidate.pathSegments.every((segment) => typeof segment === 'string' && segment.length > 0)
      )
    )
  );
}

const markdownFilePattern = /\.(md|markdown|mdown|mkd)$/i;
const maxDirectoryDepth = 6;
const maxMarkdownEntries = 500;

async function createIndexedDirectoryLaunchPayload(
  message: LocalMarkdownLaunchMessage
): Promise<MarkNestDirectoryLaunchPayload | null> {
  const fileUrl = parseFileUrl(message.fileUrl);
  if (!fileUrl || !markdownFilePattern.test(decodeURIComponent(fileUrl.pathname))) {
    return null;
  }

  const directoryUrl = getParentDirectoryUrl(fileUrl);
  if (!directoryUrl) {
    return null;
  }

  const entries = await collectMarkdownEntriesFromDirectoryUrl(directoryUrl);
  if (entries.length === 0) {
    return null;
  }

  const selectedPathSegments = getRelativePathSegments(directoryUrl, fileUrl.href);
  const hasSelectedFile = entries.some((entry) => {
    return entry.fileUrl === fileUrl.href || pathsEqual(entry.pathSegments ?? [entry.name], selectedPathSegments);
  });

  if (!hasSelectedFile) {
    entries.unshift({
      name: message.fileName,
      fileUrl: fileUrl.href,
      pathSegments: selectedPathSegments
    });
  }

  return {
    type: 'file-directory',
    directoryName: getDirectoryName(directoryUrl),
    directoryUrl,
    entries,
    selectedPathSegments,
    selectedMarkdown: message.markdown,
    createdAt: Date.now()
  };
}

async function collectMarkdownEntriesFromDirectoryUrl(
  rootDirectoryUrl: string
): Promise<LocalDirectoryMarkdownEntry[]> {
  const entries: LocalDirectoryMarkdownEntry[] = [];
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
      if (!childUrl || childUrl.href === current.directoryUrl) {
        continue;
      }
      if (!childUrl.href.startsWith(rootDirectoryUrl)) {
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

      if (!markdownFilePattern.test(childName)) {
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

function sortDirectoryEntries(entries: LocalDirectoryMarkdownEntry[]): LocalDirectoryMarkdownEntry[] {
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
