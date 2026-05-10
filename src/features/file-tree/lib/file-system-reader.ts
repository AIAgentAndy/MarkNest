import type { DirectoryEntryInput } from '../types';
import { isMarkdownFileName } from '@/shared/path/path-utils';
import { shouldIgnoreDirectory } from './tree-builder';

type DirectoryLikeHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
};

export type FileHandleEntryInput = {
  handle: FileSystemFileHandle;
  parentHandle: FileSystemDirectoryHandle;
};

export type MarkdownDirectoryScanResult = {
  directoryInput: DirectoryEntryInput;
  fileHandles: Map<string, FileHandleEntryInput>;
};

export async function scanDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle
): Promise<DirectoryEntryInput> {
  const { directoryInput } = await collectMarkdownFilesFromDirectory(rootHandle);
  return directoryInput;
}

export async function collectMarkdownFilesFromDirectory(
  rootHandle: FileSystemDirectoryHandle
): Promise<MarkdownDirectoryScanResult> {
  const fileHandles = new Map<string, FileHandleEntryInput>();
  const directoryInput = await readDirectory(rootHandle as DirectoryLikeHandle, [], rootHandle, fileHandles);

  return {
    directoryInput,
    fileHandles
  };
}

async function readDirectory(
  handle: DirectoryLikeHandle,
  parentSegments: string[],
  parentHandle: FileSystemDirectoryHandle,
  fileHandles: Map<string, FileHandleEntryInput>
): Promise<DirectoryEntryInput> {
  const children: DirectoryEntryInput[] = [];

  // 只读取 Markdown 文件元信息；非 Markdown 文件不调用 getFile，避免大目录首次扫描卡顿。
  for await (const child of handle.values()) {
    if (child.kind === 'directory') {
      if (shouldIgnoreDirectory(child.name)) {
        continue;
      }

      children.push(
        await readDirectory(
          child as DirectoryLikeHandle,
          [...parentSegments, child.name],
          child as FileSystemDirectoryHandle,
          fileHandles
        )
      );
      continue;
    }

    if (!isMarkdownFileName(child.name)) {
      continue;
    }

    const fileHandle = child as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const filePathSegments = [...parentSegments, child.name];
    fileHandles.set(filePathSegments.join('/'), {
      handle: fileHandle,
      parentHandle
    });
    children.push({
      kind: 'file',
      name: child.name,
      size: file.size,
      lastModified: file.lastModified
    });
  }

  return {
    kind: 'directory',
    name: handle.name,
    children
  };
}
