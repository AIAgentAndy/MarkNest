export type WorkspaceRecord = {
  id: string;
  name: string;
  rootHandle: FileSystemDirectoryHandle;
  createdAt: number;
  lastOpenedAt: number;
};

export type WorkspacePermission = PermissionState | 'unsupported';

export type ReaderTheme = 'system' | 'light' | 'dark';

export type ReaderSettings = {
  theme: ReaderTheme;
  allowRemoteImages: boolean;
  trustWorkspaceHtml: boolean;
};

export type SidebarMode = 'files' | 'outline';

export type ReaderSessionBase = {
  workspaceName: string;
  selectedPath: string[];
  expandedIds: string[];
  sidebarMode: SidebarMode;
  sidebarCollapsed: boolean;
  topbarCollapsed: boolean;
  savedAt: number;
};

export type DirectoryReaderSession = ReaderSessionBase & {
  mode: 'directory';
  rootHandle: FileSystemDirectoryHandle;
};

export type FileReaderSession = ReaderSessionBase & {
  mode: 'file';
  fileName: string;
  fileHandle?: FileSystemFileHandle;
  cachedMarkdown: string;
  size?: number;
  lastModified?: number;
};

export type SampleReaderSession = ReaderSessionBase & {
  mode: 'sample';
};

export type ReaderSession =
  | DirectoryReaderSession
  | FileReaderSession
  | SampleReaderSession;
