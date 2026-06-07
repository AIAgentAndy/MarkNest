/// <reference types="chrome" />

export type LocalMarkdownLaunchMessage = {
  type: 'MARKNEST_OPEN_LOCAL_FILE_URL';
  fileName: string;
  fileUrl: string;
  markdown: string;
};

export type LocalDirectoryLaunchMessage = {
  type: 'MARKNEST_OPEN_LOCAL_DIRECTORY_URL';
  directoryName: string;
  directoryUrl: string;
  entries: LocalDirectoryMarkdownEntry[];
};

export type LocalDirectoryMarkdownEntry = {
  name: string;
  fileUrl: string;
};

export type FileUrlInlineLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

const markdownFilePattern = /\.(md|markdown|mdown|mkd)$/i;

export function shouldLaunchLocalMarkdown(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'file:' || parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      markdownFilePattern.test(decodeURIComponent(parsed.pathname))
    );
  } catch {
    return false;
  }
}

export function shouldLaunchLocalMarkdownDirectory(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/') && !markdownFilePattern.test(
      decodeURIComponent(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function createLocalMarkdownLaunchMessage(
  documentRef: Document,
  fileUrl: string
): LocalMarkdownLaunchMessage {
  const parsed = new URL(fileUrl);
  const pathSegments = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
  const fileName = pathSegments.at(-1) || '未命名.md';
  const pre = documentRef.querySelector('pre');
  const markdown = (pre?.textContent ?? documentRef.body?.innerText ?? '').trimEnd();

  return {
    type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
    fileName,
    fileUrl,
    markdown
  };
}

export function createFileUrlInlineLaunchPayload(
  documentRef: Document,
  fileUrl: string,
  now = Date.now()
): FileUrlInlineLaunchPayload {
  const message = createLocalMarkdownLaunchMessage(documentRef, fileUrl);
  return {
    type: 'file-url',
    fileName: message.fileName,
    fileUrl: message.fileUrl,
    markdown: message.markdown,
    createdAt: now
  };
}

export function createLocalDirectoryLaunchMessage(
  documentRef: Document,
  directoryUrl: string
): LocalDirectoryLaunchMessage {
  const parsed = new URL(directoryUrl);
  const pathSegments = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
  const directoryName = pathSegments.at(-1) || '本地目录';
  const entries = Array.from(documentRef.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => createMarkdownEntryFromAnchor(anchor, directoryUrl))
    .filter((entry): entry is LocalDirectoryMarkdownEntry => Boolean(entry));

  return {
    type: 'MARKNEST_OPEN_LOCAL_DIRECTORY_URL',
    directoryName,
    directoryUrl,
    entries
  };
}

export function launchLocalMarkdownFromCurrentPage() {
  if (shouldLaunchLocalMarkdown(window.location.href)) {
    return;
  }

  if (shouldLaunchLocalMarkdownDirectory(window.location.href)) {
    return;
  }
}

function createMarkdownEntryFromAnchor(
  anchor: HTMLAnchorElement,
  directoryUrl: string
): LocalDirectoryMarkdownEntry | null {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('?')) {
    return null;
  }

  const fileUrl = new URL(href, directoryUrl);
  if (fileUrl.protocol !== 'file:' || !shouldLaunchLocalMarkdown(fileUrl.href)) {
    return null;
  }

  const name = decodeURIComponent(fileUrl.pathname).split('/').filter(Boolean).at(-1);
  if (!name) {
    return null;
  }

  return {
    name,
    fileUrl: fileUrl.href
  };
}
