import type { FileUrlDirectoryLaunchPayload, FileUrlLaunchPayload } from './file-url-launch';

type ReadMarkdownPayloadResponse =
  | {
      ok: true;
      payload: FileUrlLaunchPayload;
    }
  | {
      ok: false;
      error: string;
    };

type ReadDirectoryPayloadResponse =
  | {
      ok: true;
      payload: FileUrlDirectoryLaunchPayload;
    }
  | {
      ok: false;
      error: string;
    };

type ReadTextResponse =
  | {
      ok: true;
      markdown: string;
    }
  | {
      ok: false;
      error: string;
    };

type RuntimeWithOptionalLastError = typeof chrome.runtime & {
  lastError?: {
    message?: string;
  };
};

export async function readFileUrlMarkdownPayloadFromBackground(
  fileUrl: string
): Promise<FileUrlLaunchPayload | null> {
  const response = await sendRuntimeMessage<ReadMarkdownPayloadResponse>({
    type: 'MARKNEST_READ_FILE_URL_MARKDOWN',
    fileUrl
  });
  if (!response) {
    return null;
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return isFileUrlLaunchPayload(response.payload) ? response.payload : null;
}

export async function readFileUrlDirectoryPayloadFromBackground(
  directoryUrl: string
): Promise<FileUrlDirectoryLaunchPayload | null> {
  const response = await sendRuntimeMessage<ReadDirectoryPayloadResponse>({
    type: 'MARKNEST_READ_FILE_URL_DIRECTORY',
    directoryUrl
  });
  if (!response) {
    return null;
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return isFileUrlDirectoryLaunchPayload(response.payload) ? response.payload : null;
}

export async function readFileUrlTextFromBackground(fileUrl: string): Promise<string | null> {
  const response = await sendRuntimeMessage<ReadTextResponse>({
    type: 'MARKNEST_READ_FILE_URL_TEXT',
    fileUrl
  });
  if (!response) {
    return null;
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.markdown;
}

async function sendRuntimeMessage<TResponse>(message: unknown): Promise<TResponse | null> {
  const runtime = globalThis.chrome?.runtime as RuntimeWithOptionalLastError | undefined;
  if (!runtime?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      runtime.sendMessage(message, (response: TResponse | undefined) => {
        if (runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function isFileUrlLaunchPayload(payload: unknown): payload is FileUrlLaunchPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<FileUrlLaunchPayload>;
  if (candidate.type === 'file-url') {
    return (
      typeof candidate.fileName === 'string' &&
      typeof candidate.fileUrl === 'string' &&
      typeof candidate.markdown === 'string' &&
      typeof candidate.createdAt === 'number'
    );
  }

  return isFileUrlDirectoryLaunchPayload(payload);
}

function isFileUrlDirectoryLaunchPayload(payload: unknown): payload is FileUrlDirectoryLaunchPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<FileUrlDirectoryLaunchPayload>;
  return (
    candidate.type === 'file-directory' &&
    typeof candidate.directoryName === 'string' &&
    typeof candidate.directoryUrl === 'string' &&
    Array.isArray(candidate.entries) &&
    candidate.entries.every((entry) => {
      return (
        entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string' &&
        typeof entry.fileUrl === 'string' &&
        (
          entry.pathSegments === undefined ||
          (
            Array.isArray(entry.pathSegments) &&
            entry.pathSegments.every((segment) => typeof segment === 'string' && segment.length > 0)
          )
        )
      );
    }) &&
    (
      candidate.selectedPathSegments === undefined ||
      (
        Array.isArray(candidate.selectedPathSegments) &&
        candidate.selectedPathSegments.every((segment) => typeof segment === 'string' && segment.length > 0)
      )
    ) &&
    (
      candidate.selectedMarkdown === undefined ||
      typeof candidate.selectedMarkdown === 'string'
    ) &&
    typeof candidate.createdAt === 'number'
  );
}
