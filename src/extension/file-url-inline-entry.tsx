import { createRoot } from 'react-dom/client';
import { FileUrlReaderApp } from '@/features/workspace/components/file-url-reader-app';
import {
  createFileUrlInlineLaunchPayload,
  createLocalDirectoryLaunchMessage,
  shouldLaunchLocalMarkdown,
  shouldLaunchLocalMarkdownDirectory
} from '../../extension/file-launch-content-script';
import {
  createFileUrlDirectoryLaunchPayload,
  type FileUrlDirectoryLaunchPayload,
  type FileUrlDirectoryMarkdownEntry,
  type FileUrlLaunchPayload
} from '@/features/workspace/lib/file-url-launch';
import { consumeExtensionLaunchPayload } from '@/features/workspace/lib/extension-launch';
import { sampleDirectory, sampleMarkdownByPath } from '@/features/workspace/lib/sample-workspace';
import type { DirectoryEntryInput } from '@/features/file-tree/types';
import {
  readFileUrlDirectoryPayloadFromBackground,
  readFileUrlMarkdownPayloadFromBackground
} from '@/features/workspace/lib/file-url-background-client';
import '../app/globals.css';

void bootstrapFileUrlInlineReader();

async function bootstrapFileUrlInlineReader() {
  if (document.documentElement.dataset.marknestMounted === 'true') {
    return;
  }

  const payload = await createLaunchPayloadFromCurrentPage();
  if (!payload) {
    // 不接管该页面（例如在线 HTML 网页）时，移除启动阶段预载的样式，避免影响原始页面。
    removeInlineReaderStylesheet(document);
    return;
  }

  mountFileUrlReader(payload);
}

async function createLaunchPayloadFromCurrentPage(): Promise<FileUrlLaunchPayload | null> {
  const extensionLaunchPayload = await consumePendingExtensionLaunch();
  if (extensionLaunchPayload) {
    return extensionLaunchPayload;
  }

  const currentUrl = window.location.href;
  if (shouldLaunchLocalMarkdown(currentUrl)) {
    let backgroundPayload: FileUrlLaunchPayload | null = null;
    try {
      backgroundPayload = await readFileUrlMarkdownPayloadFromBackground(currentUrl);
    } catch {
      // 后台判定该地址不可作为原始 Markdown 渲染（例如在线 HTML 网页）时，
      // 不接管该页面，避免把整页 HTML 当 Markdown 渲染导致浏览器卡死。
      backgroundPayload = null;
    }

    if (backgroundPayload) {
      return backgroundPayload;
    }

    // 仅本地 file:// Markdown 在后台不可用时回退到页面内 <pre> 文本；
    // 在线地址不再回退到 body.innerText，避免误把已渲染网页当 Markdown。
    if (currentUrl.startsWith('file:')) {
      const filePayload = createFileUrlInlineLaunchPayload(document, currentUrl);
      if (!filePayload.markdown.trim()) {
        return null;
      }

      return (await createFileUrlDirectoryLaunchPayload(filePayload)) ?? filePayload;
    }

    return null;
  }

  if (shouldLaunchLocalMarkdownDirectory(currentUrl)) {
    let backgroundPayload: FileUrlDirectoryLaunchPayload | null = null;
    try {
      backgroundPayload = await readFileUrlDirectoryPayloadFromBackground(currentUrl);
    } catch {
      backgroundPayload = null;
    }

    if (backgroundPayload) {
      return backgroundPayload;
    }

    const directoryPayload = createLocalDirectoryLaunchMessage(document, currentUrl);
    if (directoryPayload.entries.length === 0) {
      return null;
    }

    return {
      type: 'file-directory',
      directoryName: directoryPayload.directoryName,
      directoryUrl: directoryPayload.directoryUrl,
      entries: directoryPayload.entries,
      createdAt: Date.now()
    } satisfies FileUrlDirectoryLaunchPayload;
  }

  return null;
}

async function consumePendingExtensionLaunch(): Promise<FileUrlLaunchPayload | null> {
  const params = new URLSearchParams(window.location.search);
  const launchType = params.get('launch');
  if (launchType === 'sample') {
    return createSampleLaunchPayload();
  }

  if (launchType !== 'file-url' && launchType !== 'file-directory') {
    return null;
  }

  const launchId = params.get('id');
  if (!launchId) {
    return null;
  }

  return consumeExtensionLaunchPayload(launchId);
}

function createSampleLaunchPayload(): FileUrlDirectoryLaunchPayload {
  return {
    type: 'file-directory',
    directoryName: sampleDirectory.name,
    directoryUrl: 'marknest://sample/',
    entries: collectSampleMarkdownEntries(sampleDirectory),
    selectedPathSegments: ['README.md'],
    selectedMarkdown: sampleMarkdownByPath.get('README.md') ?? '',
    createdAt: Date.now()
  };
}

function collectSampleMarkdownEntries(
  root: DirectoryEntryInput,
  parentSegments: string[] = []
): FileUrlDirectoryMarkdownEntry[] {
  if (root.kind === 'file') {
    const pathSegments = [...parentSegments, root.name];
    const markdownPath = pathSegments.join('/');
    if (!sampleMarkdownByPath.has(markdownPath)) {
      return [];
    }

    return [
      {
        name: root.name,
        fileUrl: `marknest://sample/${encodePathSegments(pathSegments)}`,
        pathSegments,
        size: root.size,
        lastModified: root.lastModified
      }
    ];
  }

  return root.children.flatMap((child) =>
    collectSampleMarkdownEntries(child, child.kind === 'directory' ? [...parentSegments, child.name] : parentSegments)
  );
}

function encodePathSegments(pathSegments: string[]): string {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
}

function mountFileUrlReader(payload: FileUrlLaunchPayload) {
  const rootElement = document.createElement('div');
  rootElement.id = 'marknest-file-url-root';
  document.documentElement.dataset.marknestMounted = 'true';
  enableInlineReaderStylesheet(document);
  installMarkNestDocumentChrome(getLaunchTitle(payload));
  document.body.hidden = true;
  document.body.innerHTML = '';
  document.body.hidden = false;
  document.body.append(rootElement);

  createRoot(rootElement).render(<FileUrlReaderApp payload={payload} />);
}

function enableInlineReaderStylesheet(documentRef: Document): void {
  const stylesheet = documentRef.head.querySelector<HTMLLinkElement>(
    'link[data-marknest-inline-reader-style="true"]'
  );
  if (stylesheet) {
    stylesheet.disabled = false;
  }
}

function removeInlineReaderStylesheet(documentRef: Document): void {
  documentRef.head.querySelector('link[data-marknest-inline-reader-style="true"]')?.remove();
}

function installMarkNestDocumentChrome(title: string) {
  document.title = title;
  const existingIcons = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  existingIcons.forEach((icon) => icon.remove());

  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/png';
  icon.href = chrome.runtime.getURL('icons/icon-32.png');
  document.head.append(icon);
}

function getLaunchTitle(payload: FileUrlLaunchPayload): string {
  if (payload.type === 'file-url') {
    return payload.fileName;
  }

  return payload.selectedPathSegments?.at(-1) ?? payload.entries[0]?.name ?? payload.directoryName;
}
