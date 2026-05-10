import type { AssetUrlResolver } from '../types';
import { getParentSegments, resolveRelativeSegments } from '@/shared/path/path-utils';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);

export type LocalAssetResolver = AssetUrlResolver & {
  revoke: () => void;
};

export function createLocalAssetResolver(options: {
  rootHandle: FileSystemDirectoryHandle;
  markdownPathSegments: string[];
}): LocalAssetResolver {
  const objectUrls = new Set<string>();
  const baseSegments = getParentSegments(options.markdownPathSegments);

  const resolver: AssetUrlResolver = async (src) => {
    if (!isSupportedLocalImage(src)) {
      return null;
    }

    const resolvedSegments = resolveRelativeSegments(baseSegments, decodeURI(src));
    if (!resolvedSegments) {
      return null;
    }

    const fileHandle = await getFileHandleBySegments(options.rootHandle, resolvedSegments);
    if (!fileHandle) {
      return null;
    }

    const file = await fileHandle.getFile();
    const objectUrl = URL.createObjectURL(file);
    objectUrls.add(objectUrl);
    return objectUrl;
  };

  return Object.assign(resolver, {
    revoke() {
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl);
      }
      objectUrls.clear();
    }
  });
}

async function getFileHandleBySegments(
  rootHandle: FileSystemDirectoryHandle,
  pathSegments: string[]
): Promise<FileSystemFileHandle | null> {
  let currentDirectory = rootHandle;

  for (const [index, segment] of pathSegments.entries()) {
    const isFile = index === pathSegments.length - 1;
    try {
      if (isFile) {
        return await currentDirectory.getFileHandle(segment);
      }
      currentDirectory = await currentDirectory.getDirectoryHandle(segment);
    } catch {
      return null;
    }
  }

  return null;
}

function isSupportedLocalImage(src: string): boolean {
  if (/^(https?:|data:|blob:|chrome-extension:)/i.test(src)) {
    return false;
  }

  const clean = src.split(/[?#]/, 1)[0] ?? '';
  const extension = clean.split('.').pop()?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}
