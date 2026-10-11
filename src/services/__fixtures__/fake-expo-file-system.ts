/**
 * An in-memory stand-in for the parts of expo-file-system the app uses (the new Directory/File API).
 * Paths are plain `file:///` strings. Exposes `__entries` so tests can inspect or reset the tree.
 */

type Entry = { kind: 'dir' } | { kind: 'file'; bytes: Uint8Array };

export const __entries = new Map<string, Entry>();

type PathPart = string | { uri: string };

const uriOf = (part: PathPart): string => (typeof part === 'string' ? part : part.uri);

class Node {
  readonly uri: string;

  constructor(...parts: PathPart[]) {
    const pieces = parts.map(uriOf);
    this.uri = pieces
      .map((piece, index) => (index === 0 ? piece : piece.replace(/^\/+/, '')))
      .map((piece, index, all) => (index === all.length - 1 ? piece : piece.replace(/\/+$/, '')))
      .join('/');
  }

  get exists(): boolean {
    return __entries.has(this.uri);
  }
}

export class Directory extends Node {
  create(): void {
    const segments = this.uri.split('/');
    for (let i = 3; i <= segments.length; i += 1) {
      const path = segments.slice(0, i).join('/');
      if (!__entries.has(path)) __entries.set(path, { kind: 'dir' });
    }
  }

  delete(): void {
    for (const key of [...__entries.keys()]) {
      if (key === this.uri || key.startsWith(`${this.uri}/`)) __entries.delete(key);
    }
  }

  list(): (Directory | File)[] {
    const children: (Directory | File)[] = [];
    for (const [key, entry] of __entries) {
      const isDirectChild =
        key.startsWith(`${this.uri}/`) && !key.slice(this.uri.length + 1).includes('/');
      if (!isDirectChild) continue;
      children.push(entry.kind === 'dir' ? new Directory(key) : new File(key));
    }
    return children;
  }
}

export class File extends Node {
  get size(): number | null {
    const entry = __entries.get(this.uri);
    return entry?.kind === 'file' ? entry.bytes.length : null;
  }

  create(options?: { overwrite?: boolean }): void {
    if (__entries.has(this.uri) && !options?.overwrite) throw new Error('already exists');
    __entries.set(this.uri, { kind: 'file', bytes: new Uint8Array() });
  }

  write(content: Uint8Array | string): void {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    __entries.set(this.uri, { kind: 'file', bytes: new Uint8Array(bytes) });
  }

  bytes(): Promise<Uint8Array> {
    const entry = __entries.get(this.uri);
    return entry?.kind === 'file'
      ? Promise.resolve(entry.bytes)
      : Promise.reject(new Error('no such file'));
  }

  delete(): void {
    __entries.delete(this.uri);
  }
}

export const Paths = {
  document: new Directory('file:///docs'),
  cache: new Directory('file:///cache'),
  get availableDiskSpace(): number {
    return 4_096;
  },
};
