export type DirectoryEntryInput =
  | {
      kind: 'directory';
      name: string;
      children: DirectoryEntryInput[];
    }
  | {
      kind: 'file';
      name: string;
      size: number;
      lastModified: number;
    };

export type MarkdownTreeNode =
  | {
      kind: 'directory';
      id: string;
      name: string;
      pathSegments: string[];
      children: MarkdownTreeNode[];
      markdownCount: number;
    }
  | {
      kind: 'file';
      id: string;
      name: string;
      pathSegments: string[];
      size: number;
      lastModified: number;
    };

export type FileTreeSelection = {
  workspaceId: string;
  pathSegments: string[];
};
