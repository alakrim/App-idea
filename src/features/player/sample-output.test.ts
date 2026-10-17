import { createSampleOutput } from './sample-output';

/*
 * The sample output on mocked expo-audio and expo-speech. Each test checks what reaches the native
 * module and when the end callback is allowed to run.
 */

type StatusListener = (status: { didJustFinish: boolean }) => void;

const mockSpeech = {
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
};

interface MockClip {
  listener: StatusListener | null;
  replace: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
}

const mockClips: MockClip[] = [];

jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeech.speak(...args),
  stop: () => mockSpeech.stop(),
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => {
    const clip: MockClip = {
      listener: null,
      replace: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
    };
    mockClips.push(clip);
    return {
      ...clip,
      addListener: (_event: string, listener: StatusListener) => {
        clip.listener = listener;
        return { remove: jest.fn() };
      },
    };
  }),
}));

beforeEach(() => {
  mockClips.length = 0;
  mockSpeech.speak.mockReset();
  mockSpeech.stop.mockClear();
});

describe('sample output: clips', () => {
  it('plays the clip and reports its end once it finishes on its own', () => {
    const output = createSampleOutput();
    const onEnd = jest.fn();

    output.play({ kind: 'clip', uri: 'file:///a.mp3' }, onEnd);
    const clip = mockClips[0];
    expect(clip?.replace).toHaveBeenCalledWith({ uri: 'file:///a.mp3' });
    expect(clip?.play).toHaveBeenCalledTimes(1);

    clip?.listener?.({ didJustFinish: false });
    expect(onEnd).not.toHaveBeenCalled();
    clip?.listener?.({ didJustFinish: true });
    expect(onEnd).toHaveBeenCalledTimes(1);
    output.dispose();
  });

  it('silences the clip it replaces, so only the clip that replaced it reports an end', () => {
    const output = createSampleOutput();
    const firstEnd = jest.fn();
    const secondEnd = jest.fn();

    output.play({ kind: 'clip', uri: 'file:///a.mp3' }, firstEnd);
    output.play({ kind: 'clip', uri: 'file:///b.mp3' }, secondEnd);
    expect(mockClips[0]?.pause).toHaveBeenCalled();
    mockClips[0]?.listener?.({ didJustFinish: true });

    expect(firstEnd).not.toHaveBeenCalled();
    expect(secondEnd).toHaveBeenCalledTimes(1);
    output.dispose();
  });

  it('does not report an end when stopped', () => {
    const output = createSampleOutput();
    const onEnd = jest.fn();

    output.play({ kind: 'clip', uri: 'file:///a.mp3' }, onEnd);
    output.stop();
    mockClips[0]?.listener?.({ didJustFinish: true });

    expect(onEnd).not.toHaveBeenCalled();
    output.dispose();
  });
});

describe('sample output: device speech', () => {
  it('speaks the line with its language, voice and rate, and reports the end when it is done', () => {
    const output = createSampleOutput();
    const onEnd = jest.fn();

    output.play(
      { kind: 'speech', text: 'Hello there.', language: 'en', voice: 'en-gb-x', rate: 1.25 },
      onEnd,
    );

    expect(mockSpeech.speak).toHaveBeenCalledWith(
      'Hello there.',
      expect.objectContaining({ language: 'en', voice: 'en-gb-x', rate: 1.25 }),
    );
    const options = mockSpeech.speak.mock.calls[0]?.[1] as { onDone: () => void };
    options.onDone();
    expect(onEnd).toHaveBeenCalledTimes(1);
    output.dispose();
  });

  it('does not report the end of a line that a newer sample replaced', () => {
    const output = createSampleOutput();
    const onEnd = jest.fn();

    output.play({ kind: 'speech', text: 'One.', language: 'en', voice: null, rate: 1 }, onEnd);
    const options = mockSpeech.speak.mock.calls[0]?.[1] as { onDone: () => void };
    output.play({ kind: 'clip', uri: 'file:///b.mp3' }, jest.fn());
    options.onDone();

    expect(onEnd).not.toHaveBeenCalled();
    output.dispose();
  });
});
