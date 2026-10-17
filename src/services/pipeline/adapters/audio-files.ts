/*
 * AudioFiles: narration clips in `audio/<chapterId>/`. A clip is named by its content (its input hash
 * and its length), so a clip with a given name always holds the same audio and can be reused.
 * Files are removed only by `prune`, after a chapter's new plan is stored.
 */
import type { Id } from '@/core/domain';
import type { AudioFiles } from '@/core/pipeline/ports';

import type { LibraryFiles } from '../library-files';

export const audioDirectory = (chapterId: Id): string => `audio/${chapterId}`;

export function createAudioFiles(files: LibraryFiles): AudioFiles {
  return {
    async write(chapterId, fileName, bytes) {
      return files.write(`${audioDirectory(chapterId)}/${fileName}`, bytes);
    },
    async list(chapterId) {
      return files.listEntries(audioDirectory(chapterId));
    },
    async prune(chapterId, keep) {
      const dir = audioDirectory(chapterId);
      for (const entry of await files.listEntries(dir)) {
        if (!keep.has(entry.name)) await files.removeFile(`${dir}/${entry.name}`);
      }
    },
    async remove(chapterId) {
      await files.removeDirectory(audioDirectory(chapterId));
    },
  };
}
