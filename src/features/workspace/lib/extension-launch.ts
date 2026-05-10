export type ExtensionLaunchPayload = {
  type: 'file-url';
  fileName: string;
  fileUrl: string;
  markdown: string;
  createdAt: number;
};

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
  return (
    candidate.type === 'file-url' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileUrl === 'string' &&
    typeof candidate.markdown === 'string' &&
    typeof candidate.createdAt === 'number'
  );
}
