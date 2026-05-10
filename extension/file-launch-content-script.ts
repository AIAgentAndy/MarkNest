/// <reference types="chrome" />

export type LocalMarkdownLaunchMessage = {
  type: 'MARKNEST_OPEN_LOCAL_FILE_URL';
  fileName: string;
  fileUrl: string;
  markdown: string;
};

const markdownFilePattern = /\.(md|markdown|mdown|mkd)$/i;

export function shouldLaunchLocalMarkdown(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && markdownFilePattern.test(decodeURIComponent(parsed.pathname));
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

export function launchLocalMarkdownFromCurrentPage() {
  if (
    typeof chrome === 'undefined' ||
    !chrome.runtime?.sendMessage ||
    !shouldLaunchLocalMarkdown(window.location.href)
  ) {
    return;
  }

  const message = createLocalMarkdownLaunchMessage(document, window.location.href);
  if (!message.markdown.trim()) {
    return;
  }

  void chrome.runtime.sendMessage(message);
}

launchLocalMarkdownFromCurrentPage();
