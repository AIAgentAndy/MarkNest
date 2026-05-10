import type { WorkspacePermission, WorkspaceRecord } from '../types';
export {
  clearReaderSession,
  loadReaderSession,
  saveReaderSession
} from '@/shared/db/workspace-db';
import type {
  FileSystemPickerWindow,
  PermissionAwareFileSystemHandle
} from '@/shared/browser/file-system-types';

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const maybeWindow = window as FileSystemPickerWindow;
  return (
    typeof maybeWindow.showDirectoryPicker === 'function' &&
    typeof maybeWindow.showOpenFilePicker === 'function'
  );
}

export function createWorkspaceRecord(
  rootHandle: FileSystemDirectoryHandle,
  now = Date.now()
): WorkspaceRecord {
  return {
    id: `workspace:${rootHandle.name}`,
    name: rootHandle.name,
    rootHandle,
    createdAt: now,
    lastOpenedAt: now
  };
}

export async function getWorkspacePermission(
  handle: FileSystemHandle
): Promise<WorkspacePermission> {
  const permissionHandle = handle as PermissionAwareFileSystemHandle;
  if (typeof permissionHandle.queryPermission !== 'function') {
    return 'unsupported';
  }

  // Chrome 会持久化句柄，但不会保证下次仍然有权限，所以每次恢复都要查询。
  return permissionHandle.queryPermission({ mode: 'read' });
}

export async function requestWorkspacePermission(
  handle: FileSystemHandle
): Promise<WorkspacePermission> {
  const permissionHandle = handle as PermissionAwareFileSystemHandle;
  if (typeof permissionHandle.requestPermission !== 'function') {
    return 'unsupported';
  }

  // 只申请 read，MVP 不写入本地 Markdown 文件，降低权限风险。
  return permissionHandle.requestPermission({ mode: 'read' });
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  const maybeWindow = window as FileSystemPickerWindow;
  try {
    return (await maybeWindow.showDirectoryPicker?.()) ?? null;
  } catch (error) {
    if (isFilePickerAbortError(error)) {
      return null;
    }

    throw error;
  }
}

export async function pickMarkdownFile(): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  const maybeWindow = window as FileSystemPickerWindow;
  try {
    const handles = await maybeWindow.showOpenFilePicker?.({
      multiple: false,
      types: [
        {
          description: 'Markdown 文件',
          accept: {
            'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'],
            'text/plain': ['.md']
          }
        }
      ]
    });

    return handles?.[0] ?? null;
  } catch (error) {
    if (isFilePickerAbortError(error)) {
      return null;
    }

    throw error;
  }
}

export function isFilePickerAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || /user aborted|abort/i.test(error.message);
}
