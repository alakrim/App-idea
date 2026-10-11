import { File } from 'expo-file-system';

import { deleteChapterFiles } from '@/services/storage';

import type { SeriesFiles } from './series-service';

/** The library's file store: covers and chapter sources, through the storage service. */
export const seriesFiles: SeriesFiles = {
  deleteFile(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  deleteChapterFiles,
};
