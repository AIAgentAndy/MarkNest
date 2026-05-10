/// <reference types="chrome" />

type LocalMarkdownLaunchMessage = {
  type: 'MARKNEST_OPEN_LOCAL_FILE_URL';
  fileName: string;
  fileUrl: string;
  markdown: string;
};

export type MarkNestLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

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
  if (!isLocalMarkdownLaunchMessage(message)) {
    return false;
  }

  const launchId = crypto.randomUUID();
  const storageKey = `marknest-launch:${launchId}`;
  const payload: MarkNestLaunchPayload = {
    type: 'file-url',
    fileName: message.fileName,
    fileUrl: message.fileUrl,
    markdown: message.markdown,
    createdAt: Date.now()
  };

  await chrome.storage.session.set({
    [storageKey]: payload
  });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`index.html?launch=file-url&id=${encodeURIComponent(launchId)}`)
  });

  return true;
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
