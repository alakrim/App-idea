import { pcmToWav, wavDurationMs } from '@/core/narration/formats';

import { StageFailure } from '../errors';

import {
  audioContainer,
  isSplittableFailure,
  joinClips,
  splitAtMidpoint,
  synthesizeWithFallback,
} from './narrate-fallback';

import type { SpokenClip } from './narrate-fallback';

/** One second of 24 kHz mono silence as a WAV clip. */
function wavClip(seconds: number, fill = 0): SpokenClip {
  const bytes = pcmToWav(new Uint8Array(24_000 * 2 * seconds).fill(fill), {
    rate: 24_000,
    channels: 1,
  });
  return { bytes, mime: 'audio/wav', durationMs: 1_000 * seconds };
}

function mp3Clip(durationMs: number): SpokenClip {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00], 0);
  return { bytes: frame, mime: 'audio/mpeg', durationMs };
}

function retryable(code: 'UNKNOWN' | 'NETWORK' | 'RATE_LIMITED'): StageFailure {
  return new StageFailure(code, 'The narrator is busy.', { retryable: true, detail: 'HTTP 503' });
}

const SENTENCES = ['Alpha opens the door.', 'Bravo follows her inside.', 'Charlie shuts it.'];

describe('isSplittableFailure', () => {
  it('splits only a retryable server error or network failure', () => {
    expect(isSplittableFailure(retryable('UNKNOWN'))).toBe(true);
    expect(isSplittableFailure(retryable('NETWORK'))).toBe(true);
    expect(isSplittableFailure(retryable('RATE_LIMITED'))).toBe(false);
    expect(isSplittableFailure(new StageFailure('UNKNOWN', 'x', { retryable: false }))).toBe(false);
    expect(isSplittableFailure(new StageFailure('CANCELLED', 'x', { retryable: false }))).toBe(false);
    expect(isSplittableFailure(new Error('plain'))).toBe(false);
  });

  it('reads a failure that carries a PipelineError, as the OpenRouter client throws it', () => {
    const carried = { error: { code: 'NETWORK', message: 'No connection.', retryable: true } };
    expect(isSplittableFailure(carried)).toBe(true);
  });
});

describe('splitAtMidpoint', () => {
  it('cannot split one sentence', () => {
    expect(splitAtMidpoint(['Only one.'])).toBeNull();
    expect(splitAtMidpoint([])).toBeNull();
  });

  it('splits at the boundary nearest the middle of the characters', () => {
    const four = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40)];
    expect(splitAtMidpoint(four)).toEqual([four.slice(0, 2), four.slice(2)]);
  });

  it('follows the characters, not the sentence count', () => {
    const uneven = ['a'.repeat(100), 'b'.repeat(10), 'c'.repeat(10)];
    expect(splitAtMidpoint(uneven)).toEqual([[uneven[0]], [uneven[1], uneven[2]]]);
  });
});

describe('audioContainer', () => {
  it('names the container from its MIME type, and nothing else', () => {
    expect(audioContainer('audio/mpeg')).toBe('mp3');
    expect(audioContainer('audio/mp3')).toBe('mp3');
    expect(audioContainer('audio/wav')).toBe('wav');
    expect(audioContainer('application/octet-stream')).toBeNull();
  });
});

describe('synthesizeWithFallback', () => {
  it('speaks the whole passage once when it succeeds', async () => {
    const speak = jest.fn(async () => wavClip(2));

    const clip = await synthesizeWithFallback(SENTENCES, speak);

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(SENTENCES);
    expect(clip.durationMs).toBe(2_000);
  });

  it('after a retryable server error, speaks each half once and joins them into one clip', async () => {
    const speak = jest
      .fn<Promise<SpokenClip>, [readonly string[]]>()
      .mockRejectedValueOnce(retryable('UNKNOWN'))
      .mockResolvedValueOnce(wavClip(3, 1))
      .mockResolvedValueOnce(wavClip(2, 2));

    const clip = await synthesizeWithFallback(SENTENCES, speak);

    expect(speak).toHaveBeenCalledTimes(3);
    // 21 of the 63 characters come first, which is nearer the middle than 46 would be.
    expect(speak.mock.calls[1]?.[0]).toEqual(SENTENCES.slice(0, 1));
    expect(speak.mock.calls[2]?.[0]).toEqual(SENTENCES.slice(1));
    expect(clip.mime).toBe('audio/wav');
    expect(clip.durationMs).toBe(5_000);
    expect(wavDurationMs(clip.bytes)).toBe(5_000);
  });

  it('also splits after a network failure', async () => {
    const speak = jest
      .fn<Promise<SpokenClip>, [readonly string[]]>()
      .mockRejectedValueOnce(retryable('NETWORK'))
      .mockResolvedValue(wavClip(1));

    await synthesizeWithFallback(SENTENCES, speak);

    expect(speak).toHaveBeenCalledTimes(3);
  });

  it('does not split a failure that a shorter passage cannot fix', async () => {
    const failure = retryable('RATE_LIMITED');
    const speak = jest.fn(async (): Promise<SpokenClip> => {
      throw failure;
    });

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(failure);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('does not split a non-retryable failure', async () => {
    const failure = new StageFailure('UNKNOWN', 'bad input', { retryable: false });
    const speak = jest.fn(async (): Promise<SpokenClip> => {
      throw failure;
    });

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(failure);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('does not split a single sentence', async () => {
    const failure = retryable('UNKNOWN');
    const speak = jest.fn(async (): Promise<SpokenClip> => {
      throw failure;
    });

    await expect(synthesizeWithFallback(['One long sentence.'], speak)).rejects.toBe(failure);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original failure when the first half fails, and makes no further request', async () => {
    const failure = retryable('UNKNOWN');
    const speak = jest
      .fn<Promise<SpokenClip>, [readonly string[]]>()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(retryable('UNKNOWN'));

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(failure);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('rethrows the original failure when the second half fails', async () => {
    const failure = retryable('UNKNOWN');
    const speak = jest
      .fn<Promise<SpokenClip>, [readonly string[]]>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(wavClip(1))
      .mockRejectedValueOnce(retryable('NETWORK'));

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(failure);
    expect(speak).toHaveBeenCalledTimes(3);
  });

  it('never splits a half again, even when the half fails with the same retryable error', async () => {
    const failure = retryable('UNKNOWN');
    const speak = jest.fn(async (): Promise<SpokenClip> => {
      throw failure;
    });

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(failure);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('rethrows the original failure when the halves come back in different containers', async () => {
    const failure = retryable('UNKNOWN');
    const speak = jest
      .fn<Promise<SpokenClip>, [readonly string[]]>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(wavClip(1))
      .mockResolvedValueOnce(mp3Clip(1_000));

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(failure);
  });

  it('does not treat a cancellation as a reason to split', async () => {
    const cancelled = new StageFailure('CANCELLED', 'Cancelled.', { retryable: false });
    const speak = jest.fn(async (): Promise<SpokenClip> => {
      throw cancelled;
    });

    await expect(synthesizeWithFallback(SENTENCES, speak)).rejects.toBe(cancelled);
    expect(speak).toHaveBeenCalledTimes(1);
  });
});

describe('joinClips', () => {
  it('joins two MP3 clips and adds their durations', () => {
    const joined = joinClips(mp3Clip(4_000), mp3Clip(1_500));

    expect(joined?.mime).toBe('audio/mpeg');
    expect(joined?.durationMs).toBe(5_500);
    expect(joined?.bytes.length).toBe(417 * 2);
  });

  it('refuses clips of different MIME types, and clips it cannot join', () => {
    expect(joinClips(wavClip(1), mp3Clip(1_000))).toBeNull();
    expect(joinClips({ bytes: new Uint8Array(4), mime: 'audio/x', durationMs: 1 }, { bytes: new Uint8Array(4), mime: 'audio/x', durationMs: 1 })).toBeNull();
  });
});
