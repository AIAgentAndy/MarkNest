export type ExtensionFileLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

export type ExtensionDirectoryLaunchPayload = {
  type: 'file-directory';
  directoryName: string;
  directoryUrl: string;
  entries: ExtensionDirectoryMarkdownEntry[];
  selectedPathSegments?: string[];
  selectedMarkdown?: string;
  createdAt: number;
};

export type ExtensionDirectoryMarkdownEntry = {
  name: string;
  fileUrl: string;
  pathSegments?: string[];
};

export type ExtensionLaunchPayload =
  | ExtensionFileLaunchPayload
  | ExtensionDirectoryLaunchPayload;

type ChromeWithSessionStorage = typeof chrome & {
  storage?: {
    session?: {
      get: (key: string) => Promise<Record<string, unknown>>;
      remove: (key: string) => Promise<void>;
    };
  };
};

export async function consumeExtensionLaunchPayload(
  launchId: string
): Promise<ExtensionLaunchPayload | null> {
  const storageKey = `marknest-launch:${launchId}`;
  const maybeChrome = globalThis.chrome as ChromeWithSessionStorage | undefined;
  const sessionStorage = maybeChrome?.storage?.session;

  if (!sessionStorage) {
    return null;
  }

  const record = await sessionStorage.get(storageKey);
  await sessionStorage.remove(storageKey);
  const payload = record[storageKey];

  return isExtensionLaunchPayload(payload) ? payload : null;
}

function isExtensionLaunchPayload(payload: unknown): payload is ExtensionLaunchPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ExtensionLaunchPayload>;
  if (candidate.type === 'file-url') {
    return (
      typeof candidate.fileName === 'string' &&
      typeof candidate.fileUrl === 'string' &&
      typeof candidate.markdown === 'string' &&
      typeof candidate.createdAt === 'number'
    );
  }

  if (candidate.type === 'file-directory') {
    return (
      typeof candidate.directoryName === 'string' &&
      typeof candidate.directoryUrl === 'string' &&
      Array.isArray(candidate.entries) &&
      candidate.entries.every(isExtensionDirectoryMarkdownEntry) &&
      (
        candidate.selectedPathSegments === undefined ||
        (
          Array.isArray(candidate.selectedPathSegments) &&
          candidate.selectedPathSegments.every(isNonEmptyString)
        )
      ) &&
      (
        candidate.selectedMarkdown === undefined ||
        typeof candidate.selectedMarkdown === 'string'
      ) &&
      typeof candidate.createdAt === 'number'
    );
  }

  return false;
}

function isExtensionDirectoryMarkdownEntry(
  entry: unknown
): entry is ExtensionDirectoryMarkdownEntry {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const candidate = entry as Partial<ExtensionDirectoryMarkdownEntry>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.fileUrl === 'string' &&
    (
      candidate.pathSegments === undefined ||
      (
        Array.isArray(candidate.pathSegments) &&
        candidate.pathSegments.every(isNonEmptyString)
      )
    )
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
