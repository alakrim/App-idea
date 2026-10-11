import type { LibraryFiles } from '../library-files';

/** An in-memory LibraryFiles. URIs are `mem://<path>`, so the fake can resolve what it returned. */
export function createMemoryLibraryFiles(): LibraryFiles & {
  readonly entries: Map<string, string | Uint8Array>;
} {
  const entries = new Map<string, string | Uint8Array>();
  const uriOf = (path: string) => `mem://${path}`;
  const pathOf = (uri: string) => uri.replace(/^mem:\/\//u, '');
  const under = (dir: string) => `${dir.replace(/\/+$/u, '')}/`;

  return {
    entries,
    async write(relativePath, content) {
      entries.set(relativePath, content);
      return uriOf(relativePath);
    },
    async readText(relativePath) {
      const value = entries.get(relativePath);
      if (value === undefined) return null;
      return typeof value === 'string' ? value : new TextDecoder().decode(value);
    },
    async readBase64(uri) {
      const value = entries.get(pathOf(uri));
      if (value === undefined) throw new Error(`No file at ${uri}`);
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
      return Buffer.from(bytes).toString('base64');
    },
    async importFile(sourceUri, relativePath) {
      const value = entries.get(pathOf(sourceUri)) ?? new Uint8Array();
      entries.set(relativePath, value);
      return uriOf(relativePath);
    },
    async listNames(relativeDir) {
      const prefix = under(relativeDir);
      return [...entries.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes('/'));
    },
    async removeFile(relativePath) {
      entries.delete(relativePath);
    },
    async removeDirectory(relativeDir) {
      const prefix = under(relativeDir);
      for (const path of [...entries.keys()]) {
        if (path.startsWith(prefix)) entries.delete(path);
      }
    },
  };
}
