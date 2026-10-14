/*
 * The app's LibraryFiles, on expo-file-system. Every path is checked before it touches the disk: no
 * empty, `.` or `..` segments, so a path can never leave the library root.
 */
import { Directory, File, Paths } from 'expo-file-system';

import type { LibraryFiles } from './library-files';

function segmentsOf(relativePath: string): string[] {
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Refusing to use a library path with an empty or relative segment.');
  }
  return segments;
}

function fileAt(relativePath: string): File {
  return new File(Paths.document, ...segmentsOf(relativePath));
}

function directoryAt(relativeDir: string): Directory {
  return new Directory(Paths.document, ...segmentsOf(relativeDir));
}

export function createExpoLibraryFiles(): LibraryFiles {
  return {
    async write(relativePath, content) {
      const file = fileAt(relativePath);
      file.create({ intermediates: true, overwrite: true });
      file.write(content);
      return file.uri;
    },

    async readText(relativePath) {
      const file = fileAt(relativePath);
      return file.exists ? file.text() : null;
    },

    async readBase64(uri) {
      return new File(uri).base64();
    },

    async sizeOf(uri) {
      const file = new File(uri);
      return file.exists ? file.size : null;
    },

    async importFile(sourceUri, relativePath) {
      const destination = fileAt(relativePath);
      if (destination.exists) destination.delete();
      destination.create({ intermediates: true, overwrite: true });
      await new File(sourceUri).copy(destination);
      return destination.uri;
    },

    async listNames(relativeDir) {
      const directory = directoryAt(relativeDir);
      return directory.exists ? directory.list().map((entry) => entry.name) : [];
    },

    async removeFile(relativePath) {
      const file = fileAt(relativePath);
      if (file.exists) file.delete();
    },

    async removeDirectory(relativeDir) {
      const directory = directoryAt(relativeDir);
      if (directory.exists) directory.delete();
    },
  };
}
