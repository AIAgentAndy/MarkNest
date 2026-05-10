import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ReaderSession, ReaderSettings, WorkspaceRecord } from '@/features/workspace/types';

const DB_NAME = 'md-view';
const DB_VERSION = 2;

type WorkspaceStoredRecord = WorkspaceRecord;

type SettingsRecord = {
  id: 'reader-settings';
  value: ReaderSettings;
};

type SessionRecord = {
  id: 'reader-session';
  value: ReaderSession;
};

interface MdViewDb extends DBSchema {
  workspaces: {
    key: string;
    value: WorkspaceStoredRecord;
    indexes: {
      'by-last-opened': number;
    };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
  sessions: {
    key: string;
    value: SessionRecord;
  };
}

let databasePromise: Promise<IDBPDatabase<MdViewDb>> | null = null;

export function getWorkspaceDb(): Promise<IDBPDatabase<MdViewDb>> {
  databasePromise ??= openDB<MdViewDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('workspaces')) {
        const workspaceStore = db.createObjectStore('workspaces', { keyPath: 'id' });
        workspaceStore.createIndex('by-last-opened', 'lastOpenedAt');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
    }
  });

  return databasePromise;
}

export async function saveWorkspace(record: WorkspaceRecord): Promise<void> {
  const db = await getWorkspaceDb();
  await db.put('workspaces', record);
}

export async function listRecentWorkspaces(): Promise<WorkspaceRecord[]> {
  const db = await getWorkspaceDb();
  const records = await db.getAllFromIndex('workspaces', 'by-last-opened');
  return records.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
}

export async function saveReaderSettings(settings: ReaderSettings): Promise<void> {
  const db = await getWorkspaceDb();
  await db.put('settings', {
    id: 'reader-settings',
    value: settings
  });
}

export async function loadReaderSettings(): Promise<ReaderSettings> {
  const db = await getWorkspaceDb();
  const record = await db.get('settings', 'reader-settings');
  return (
    record?.value ?? {
      theme: 'system',
      allowRemoteImages: true,
      trustWorkspaceHtml: false
    }
  );
}

export async function saveReaderSession(session: ReaderSession): Promise<void> {
  const db = await getWorkspaceDb();
  try {
    await db.put('sessions', {
      id: 'reader-session',
      value: session
    });
  } catch (error) {
    if (session.mode === 'directory') {
      await clearReaderSession();
      return;
    }

    if (session.mode !== 'file' || !session.fileHandle) {
      throw error;
    }

    const fallbackSession: ReaderSession = {
      ...session,
      fileHandle: undefined
    };
    await db.put('sessions', {
      id: 'reader-session',
      value: fallbackSession
    });
  }
}

export async function loadReaderSession(): Promise<ReaderSession | null> {
  const db = await getWorkspaceDb();
  const record = await db.get('sessions', 'reader-session');
  return record?.value ?? null;
}

export async function clearReaderSession(): Promise<void> {
  const db = await getWorkspaceDb();
  await db.delete('sessions', 'reader-session');
}
