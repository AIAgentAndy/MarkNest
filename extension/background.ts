/// <reference types="chrome" />

if (typeof chrome !== 'undefined') {
  chrome.action.onClicked.addListener(() => {
    void handleExtensionActionClick();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    return handleExtensionMessage(message, sendResponse);
  });
}

export async function handleExtensionActionClick(): Promise<void> {
  await chrome.tabs.create({
    url: chrome.runtime.getURL('support.html')
  });
}

export function handleExtensionMessage(
  message: unknown,
  sendResponse: (response: FileUrlBackgroundResponse) => void = () => {}
): boolean {
  if (isOpenExtensionDetailsRequest(message)) {
    return false;
  }

  if (isReadMarkdownRequest(message)) {
    void readMarkdownPayload(message.fileUrl).then(sendResponse);
    return true;
  }

  if (isReadDirectoryRequest(message)) {
    void readDirectoryPayload(message.directoryUrl).then(sendResponse);
    return true;
  }

  if (isReadTextRequest(message)) {
    void readMarkdownText(message.fileUrl).then(sendResponse);
    return true;
  }

  return false;
}

type ReadMarkdownRequest = {
  type: 'MARKNEST_READ_FILE_URL_MARKDOWN';
  fileUrl: string;
};

type ReadDirectoryRequest = {
  type: 'MARKNEST_READ_FILE_URL_DIRECTORY';
  directoryUrl: string;
};

type ReadTextRequest = {
  type: 'MARKNEST_READ_FILE_URL_TEXT';
  fileUrl: string;
};

type OpenExtensionDetailsRequest = {
  type: 'MARKNEST_OPEN_EXTENSION_DETAILS';
};

type FileUrlBackgroundResponse =
  | {
      ok: true;
      payload: FileUrlLaunchPayload;
    }
  | {
      ok: true;
      markdown: string;
    }
  | {
      ok: false;
      error: string;
    };

type FileUrlLaunchPayload =
  | FileUrlFileLaunchPayload
  | FileUrlDirectoryLaunchPayload;

type FileUrlFileLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

type FileUrlDirectoryLaunchPayload = {
  type: 'file-directory';
  directoryName: string;
  directoryUrl: string;
  entries: FileUrlDirectoryMarkdownEntry[];
  selectedPathSegments?: string[];
  selectedMarkdown?: string;
  createdAt: number;
};

type FileUrlDirectoryMarkdownEntry = {
  name: string;
  fileUrl: string;
  pathSegments?: string[];
  size?: number;
  lastModified?: number;
};

const markdownFilePattern = /\.(md|markdown|mdown|mkd)$/i;
const maxDirectoryDepth = 6;
const maxMarkdownEntries = 500;

async function readMarkdownPayload(fileUrl: string): Promise<FileUrlBackgroundResponse> {
  const parsed = parseReadableMarkdownUrl(fileUrl);
  if (!parsed || !isMarkdownFileName(getFileName(parsed))) {
    return {
      ok: false,
      error: '只能读取 Markdown 文件。'
    };
  }

  try {
    const markdown = await fetchText(parsed.href);
    const filePayload: FileUrlFileLaunchPayload = {
      type: 'file-url',
      fileName: getFileName(parsed),
      fileUrl: parsed.href,
      markdown,
      createdAt: Date.now()
    };
    const directoryPayload = parsed.protocol === 'file:' ? await createDirectoryPayloadForFile(filePayload) : null;

    return {
      ok: true,
      payload: directoryPayload ?? filePayload
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '读取本地 Markdown 文件失败。'
    };
  }
}

async function readDirectoryPayload(directoryUrl: string): Promise<FileUrlBackgroundResponse> {
  const parsed = parseFileUrl(directoryUrl);
  if (!parsed || !parsed.pathname.endsWith('/')) {
    return {
      ok: false,
      error: '只能索引 file:// 下的本地目录。'
    };
  }

  try {
    return {
      ok: true,
      payload: {
        type: 'file-directory',
        directoryName: getDirectoryName(parsed.href),
        directoryUrl: parsed.href,
        entries: await collectMarkdownEntriesFromDirectoryUrl(parsed.href),
        createdAt: Date.now()
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '索引本地目录失败。'
    };
  }
}

async function readMarkdownText(fileUrl: string): Promise<FileUrlBackgroundResponse> {
  const parsed = parseReadableMarkdownUrl(fileUrl);
  if (!parsed || !isMarkdownFileName(getFileName(parsed))) {
    return {
      ok: false,
      error: '只能读取 Markdown 文件。'
    };
  }

  try {
    return {
      ok: true,
      markdown: await fetchText(parsed.href)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '读取本地 Markdown 文件失败。'
    };
  }
}

async function createDirectoryPayloadForFile(
  payload: FileUrlFileLaunchPayload
): Promise<FileUrlDirectoryLaunchPayload | null> {
  const fileUrl = parseFileUrl(payload.fileUrl);
  if (!fileUrl) {
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

async function collectMarkdownEntriesFromDirectoryUrl(
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

      const childName = getFileName(childUrl);
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!response.ok && !(response.status === 0 && url.startsWith('file://'))) {
    throw new Error(`读取本地 Markdown 失败：${response.status}`);
  }

  return response.text();
}

async function fetchDirectoryHtml(directoryUrl: string): Promise<string | null> {
  try {
    return await fetchText(directoryUrl);
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

function parseReadableMarkdownUrl(fileUrl: string): URL | null {
  try {
    const parsed = new URL(fileUrl);
    return ['file:', 'http:', 'https:'].includes(parsed.protocol) ? parsed : null;
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

function getFileName(fileUrl: URL): string {
  return decodeURIComponent(fileUrl.pathname).split('/').filter(Boolean).at(-1) ?? '';
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

function isMarkdownFileName(fileName: string): boolean {
  return markdownFilePattern.test(fileName);
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

function isReadMarkdownRequest(message: unknown): message is ReadMarkdownRequest {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as Partial<ReadMarkdownRequest>).type === 'MARKNEST_READ_FILE_URL_MARKDOWN' &&
    typeof (message as Partial<ReadMarkdownRequest>).fileUrl === 'string'
  );
}

function isReadDirectoryRequest(message: unknown): message is ReadDirectoryRequest {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as Partial<ReadDirectoryRequest>).type === 'MARKNEST_READ_FILE_URL_DIRECTORY' &&
    typeof (message as Partial<ReadDirectoryRequest>).directoryUrl === 'string'
  );
}

function isReadTextRequest(message: unknown): message is ReadTextRequest {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as Partial<ReadTextRequest>).type === 'MARKNEST_READ_FILE_URL_TEXT' &&
    typeof (message as Partial<ReadTextRequest>).fileUrl === 'string'
  );
}

function isOpenExtensionDetailsRequest(message: unknown): message is OpenExtensionDetailsRequest {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as Partial<OpenExtensionDetailsRequest>).type === 'MARKNEST_OPEN_EXTENSION_DETAILS'
  );
}
