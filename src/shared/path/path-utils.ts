const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);

export function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');

  // `.gitignore` 这种隐藏文件不是扩展名文件，避免误判。
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return '';
  }

  return fileName.slice(lastDot).toLowerCase();
}

export function isMarkdownFileName(fileName: string): boolean {
  return MARKDOWN_EXTENSIONS.has(getExtension(fileName));
}

export function normalizeRelativePath(path: string): string[] {
  const segments: string[] = [];

  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments;
}

export function resolveRelativeSegments(
  baseSegments: string[],
  relativePath: string
): string[] | null {
  const resolved = [...baseSegments];

  for (const segment of relativePath.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      // 浏览器只授权工作区根目录，任何 `..` 都不能越过这个根。
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return resolved;
}

export function pathSegmentsToId(workspaceId: string, pathSegments: string[]): string {
  return `${workspaceId}:${pathSegments.join('/')}`;
}

export function getParentSegments(pathSegments: string[]): string[] {
  return pathSegments.slice(0, -1);
}
