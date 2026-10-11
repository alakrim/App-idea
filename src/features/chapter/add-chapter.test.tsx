/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';

import { renderWithApp } from '@/__tests__/helpers/feature-harness';
import { id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';
import type { PipelineFacade } from '@/features/pipeline/facade';
import { createFakePipeline } from '@/features/pipeline/fake-facade';

import { AddChapterScreen } from './add-chapter-screen';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('expo-sqlite', () => require('../../__tests__/helpers/fake-expo-sqlite'));
jest.mock('expo-clipboard', () => ({
  hasStringAsync: jest.fn(() => Promise.resolve(false)),
  getStringAsync: jest.fn(() => Promise.resolve('')),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const pickerMock = jest.mocked(DocumentPicker.getDocumentAsync);

function setup(): { db: Db; pipeline: PipelineFacade } {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { sourceLang: 'en', targetLang: 'it' }));
  let counter = 0;
  const pipeline = createFakePipeline({ db, previewMs: 50, newId: () => id(800 + counter++) });
  return { db, pipeline };
}

beforeEach(() => {
  jest.clearAllMocks();
});

const WAIT = { timeout: 4000 };

describe('Add chapter: link flow', () => {
  it('previews a link, estimates the cost, then creates and starts the chapter', async () => {
    const { db, pipeline } = setup();
    const createSpy = jest.spyOn(pipeline, 'createChapter');
    const enqueueSpy = jest.spyOn(pipeline, 'enqueue');
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.changeText(
      screen.getByLabelText('Article link'),
      'https://example.com/the-night-harbour',
    );

    await waitFor(() => expect(screen.getByText('Clean')).toBeOnTheScreen(), WAIT);
    expect(screen.getByLabelText('Chapter title')).toHaveProp('value', 'The night harbour');
    await waitFor(() => expect(screen.getByText(/^≈ \$0\.\d\d \(/)).toBeOnTheScreen(), WAIT);

    const create = screen.getByRole('button', { name: 'Create & process' });
    expect(create).toBeEnabled();
    await fireEvent.press(create);

    expect(createSpy).toHaveBeenCalledWith({
      seriesId: id(1),
      title: 'The night harbour',
      source: { kind: 'url', url: 'https://example.com/the-night-harbour' },
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled(), WAIT);
    expect(enqueueSpy).toHaveBeenCalledWith(id(800));
    expect(chapterRepo.listBySeries(db, id(1))).toHaveLength(1);
  });

  it('keeps Create off until a valid link has loaded', async () => {
    const { db, pipeline } = setup();
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.changeText(screen.getByLabelText('Article link'), 'not a link');

    expect(screen.getByText('Enter a full link, starting with https://')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create & process' })).toBeDisabled();
  });

  it('says what went wrong when the page cannot be reached, and offers a retry', async () => {
    const { db, pipeline } = setup();
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.changeText(
      screen.getByLabelText('Article link'),
      'https://example.com/offline',
    );

    await waitFor(
      () => expect(screen.getByText(/We couldn't load this link/)).toBeOnTheScreen(),
      WAIT,
    );
    expect(screen.getByRole('button', { name: 'Create & process' })).toBeDisabled();
  });

  it('refuses a page with no readable text', async () => {
    const { db, pipeline } = setup();
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.changeText(screen.getByLabelText('Article link'), 'https://example.com/empty');

    await waitFor(
      () => expect(screen.getByText(/We couldn't find readable text/)).toBeOnTheScreen(),
      WAIT,
    );
    expect(screen.getByRole('button', { name: 'Create & process' })).toBeDisabled();
  });
});

describe('Add chapter: PDF selection', () => {
  it('shows the picked file name and size, and creates a PDF chapter', async () => {
    const { db, pipeline } = setup();
    const createSpy = jest.spyOn(pipeline, 'createChapter');
    pickerMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/Harbour.pdf',
          name: 'Harbour.pdf',
          size: 2048,
          mimeType: 'application/pdf',
        },
      ],
    } as unknown as Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>);
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.press(screen.getByLabelText('PDF'));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a PDF' }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Create & process' })).toBeEnabled(),
      WAIT,
    );

    await waitFor(() => expect(screen.getByText('Harbour.pdf')).toBeOnTheScreen(), WAIT);
    expect(pickerMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' }));
    expect(screen.getByText('Harbour.pdf')).toBeOnTheScreen();
    expect(screen.getByText('2 KB')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Create & process' }));
    await waitFor(
      () =>
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Harbour',
            source: { kind: 'pdf', fileUri: 'file:///cache/Harbour.pdf', fileName: 'Harbour.pdf' },
          }),
        ),
      WAIT,
    );
  });

  it('does nothing when the picker is cancelled', async () => {
    const { db, pipeline } = setup();
    pickerMock.mockResolvedValue({ canceled: true, assets: null } as unknown as Awaited<
      ReturnType<typeof DocumentPicker.getDocumentAsync>
    >);
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.press(screen.getByLabelText('PDF'));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a PDF' }));

    expect(screen.queryByText(/Harbour/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create & process' })).toBeDisabled();
  });
});

describe('Add chapter: pasted text', () => {
  it('takes the title from the first line and enables Create once there is text', async () => {
    const { db, pipeline } = setup();
    const createSpy = jest.spyOn(pipeline, 'createChapter');
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.press(screen.getByLabelText('Text'));
    await fireEvent.changeText(
      screen.getByLabelText('Chapter text'),
      'The Lamp at Tessport\n\nThe fog came in.',
    );
    expect(screen.getByLabelText('Chapter title')).toHaveProp('value', 'The Lamp at Tessport');
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Create & process' })).toBeEnabled(),
      WAIT,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create & process' }));
    await waitFor(
      () =>
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({ source: expect.objectContaining({ kind: 'text' }) }),
        ),
      WAIT,
    );
  });
});
