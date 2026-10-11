/*
 * The library's file store as the pipeline sees it. Paths are relative to the library root, which
 * holds `sources/`, `audio/` and the other library directories (see services/storage.ts). The app
 * implements this with expo-file-system; tests use an in-memory store.
 */
export interface LibraryFiles {
  /** Writes text or bytes, replacing any file at the path. Returns the file's URI. */
  write(relativePath: string, content: string | Uint8Array): Promise<string>;
  /** The text of a file, or null when it does not exist. */
  readText(relativePath: string): Promise<string | null>;
  /** The bytes of a file as base64. The URI is one returned by `write` or `importFile`. */
  readBase64(uri: string): Promise<string>;
  /** Copies a file from outside the library (a picked document) into it. Returns the new URI. */
  importFile(sourceUri: string, relativePath: string): Promise<string>;
  /** The names of the entries in a directory. Empty when the directory does not exist. */
  listNames(relativeDir: string): Promise<string[]>;
  /** Removes one file. A missing file is not an error. */
  removeFile(relativePath: string): Promise<void>;
  /** Removes a directory and everything in it. A missing directory is not an error. */
  removeDirectory(relativeDir: string): Promise<void>;
}
