export type FileSystemPermissionMode = {
  mode: 'read' | 'readwrite';
};

export type PermissionAwareFileSystemHandle = FileSystemHandle & {
  queryPermission?: (descriptor?: FileSystemPermissionMode) => Promise<PermissionState>;
  requestPermission?: (descriptor?: FileSystemPermissionMode) => Promise<PermissionState>;
};

export type FileSystemPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?: (
      options?: {
        multiple?: boolean;
        types?: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }
    ) => Promise<FileSystemFileHandle[]>;
  };
