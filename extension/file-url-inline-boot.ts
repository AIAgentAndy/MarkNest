/// <reference types="chrome" />

const markdownFilePattern = /\.(md|markdown|mdown|mkd)$/i;

if (typeof window !== 'undefined' && typeof chrome !== 'undefined') {
  loadFileUrlInlineReaderIfNeeded(window.location.href);
}

export function shouldLoadFileUrlInlineReader(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isMarkdownFile =
      (parsed.protocol === 'file:' || parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      markdownFilePattern.test(decodeURIComponent(parsed.pathname));
    const isLocalDirectory =
      parsed.protocol === 'file:' &&
      parsed.pathname.endsWith('/') &&
      !markdownFilePattern.test(decodeURIComponent(parsed.pathname));

    return isMarkdownFile || isLocalDirectory;
  } catch {
    return false;
  }
}

export function loadFileUrlInlineReaderIfNeeded(url: string): void {
  if (!shouldLoadFileUrlInlineReader(url)) {
    return;
  }

  installFileUrlInlineReaderStyles(document, chrome.runtime.getURL('file-url-inline-entry.css'));
  const inlineEntryUrl = chrome.runtime.getURL('file-url-inline-entry.js');
  void import(inlineEntryUrl).catch((error: unknown) => {
    console.error('MarkNest file URL inline renderer failed to load.', error);
  });
}

export function installFileUrlInlineReaderStyles(documentRef: Document, stylesheetUrl: string): void {
  if (documentRef.head.querySelector('link[data-marknest-inline-reader-style="true"]')) {
    return;
  }

  const stylesheet = documentRef.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = stylesheetUrl;
  stylesheet.dataset.marknestInlineReaderStyle = 'true';
  documentRef.head.append(stylesheet);
}
