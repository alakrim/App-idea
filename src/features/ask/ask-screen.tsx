import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { newId } from '@/core/domain';
import { useDb } from '@/db/hooks';
import { useSettings } from '@/features/settings/settings-store';
import { useDbRead } from '@/features/shared/use-db-read';

import { ASK_TABLES, readAskSeriesData, readAskSeriesOptions } from './ask-data';
import { askErrorCopy } from './ask-errors';
import { askQuestion } from './ask-service';
import { AskView } from './ask-view';

import type { AskFailure } from './ask-view';

/** Container for the Ask tab: reads the data, runs questions and routes navigation. */
export function AskScreen() {
  const db = useDb();
  const openrouter = useOpenRouter();
  const { settings } = useSettings();
  const options = useDbRead(readAskSeriesOptions, ASK_TABLES, '');

  const [picked, setPicked] = useState<string | null>(null);
  const selectedId =
    picked !== null && options.some((option) => option.id === picked)
      ? picked
      : (options[0]?.id ?? null);
  const data = useDbRead(readAskSeriesData, ASK_TABLES, selectedId ?? '');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [failure, setFailure] = useState<AskFailure | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const ask = useCallback(
    (question: string) => {
      const text = question.trim();
      if (text === '' || selectedId === null || inFlight.current !== null) return;
      const controller = new AbortController();
      inFlight.current = controller;
      setSending(text);
      setFailure(null);
      askQuestion(
        { db, openrouter, now: Date.now, newId },
        {
          seriesId: selectedId,
          question: text,
          model: settings.analysisModel,
          lang: settings.uiLanguage,
          signal: controller.signal,
        },
      )
        .then((result) => {
          if (result.kind === 'answered') {
            setDraft((current) => (current.trim() === text ? '' : current));
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFailure({ ...askErrorCopy(error), question: text });
        })
        .finally(() => {
          inFlight.current = null;
          setSending(null);
        });
    },
    [db, openrouter, selectedId, settings.analysisModel, settings.uiLanguage],
  );

  return (
    <AskView
      options={options}
      selectedId={selectedId}
      data={data}
      draft={draft}
      sending={sending}
      failure={failure}
      onDraftChange={setDraft}
      onSelectSeries={(seriesId) => {
        setPicked(seriesId);
        setFailure(null);
      }}
      onSend={() => ask(draft)}
      onAsk={ask}
      onOpenChapter={(chapterId) =>
        router.push({ pathname: '/chapter/[chapterId]', params: { chapterId } })
      }
      onOpenLibrary={() => router.navigate('/')}
      onOpenSettings={() => router.navigate('/settings')}
      onRetry={() => {
        if (failure !== null) ask(failure.question);
      }}
    />
  );
}
