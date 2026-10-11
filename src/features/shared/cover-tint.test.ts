import { blurhashAverageHex, computeCoverTint, NEUTRAL_TINT } from './cover-tint';

const BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

/** Encodes an integer as four base-83 characters, the DC term of a blurhash. */
function encode83(value: number, length: number): string {
  let out = '';
  let rest = value;
  for (let i = 0; i < length; i += 1) {
    out = BASE83[rest % 83] + out;
    rest = Math.floor(rest / 83);
  }
  return out;
}

const mockBlurhash = jest.fn<Promise<string | null>, [string, unknown]>();
const mockManipulate = jest.fn();

jest.mock('expo-image', () => ({
  Image: { generateBlurhashAsync: (...args: [string, unknown]) => mockBlurhash(...args) },
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
  SaveFormat: { PNG: 'png', JPEG: 'jpeg', WEBP: 'webp' },
}));

describe('blurhashAverageHex', () => {
  it('decodes the DC term of a one-component hash into sRGB', () => {
    // Size flag 0 means one component, then a zero quantised maximum, then the DC colour.
    const hash = `00${encode83(0x336699, 4)}`;

    expect(blurhashAverageHex(hash)).toBe('#336699');
  });

  it('rejects a hash that is too short or has characters outside base 83', () => {
    expect(blurhashAverageHex('00')).toBeNull();
    expect(blurhashAverageHex(`00${' '.repeat(4)}`)).toBeNull();
  });
});

describe('computeCoverTint', () => {
  beforeEach(() => {
    mockBlurhash.mockReset();
    mockManipulate.mockReset();
  });

  it('downscales the cover, then averages it with a one-component blurhash', async () => {
    mockManipulate.mockResolvedValue({ uri: 'file:///cache/sample.png', width: 16, height: 24 });
    mockBlurhash.mockResolvedValue(`00${encode83(0x112233, 4)}`);

    await expect(computeCoverTint('file:///covers/a.jpg')).resolves.toBe('#112233');
    expect(mockBlurhash).toHaveBeenCalledWith('file:///cache/sample.png', [1, 1]);
  });

  it('falls back to the neutral tint when the average cannot be read', async () => {
    mockManipulate.mockRejectedValue(new Error('decode failed'));

    await expect(computeCoverTint('file:///covers/a.jpg')).resolves.toBe(NEUTRAL_TINT);
  });
});
