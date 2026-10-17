import { fireEvent, screen, type RenderResult } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/core/defaults';
import { modelKindConfig } from '@/features/settings/model-kinds';
import { ModelPicker } from '@/features/settings/model-picker';
import { parseModelItems, type OpenRouterModel } from '@/services/openrouter';
import catalogue from '@/services/openrouter/__fixtures__/openrouter-speech-2026-10-17.json';

import { renderThemed } from '../helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

// Four days after Fish Audio Drama 3 was created (2026-10-13), so its New badge is on.
const NOW = Date.parse('2026-10-17T12:00:00Z');
const narration = modelKindConfig('narration', DEFAULT_SETTINGS);
const SPEECH: readonly OpenRouterModel[] = narration.arrange(
  parseModelItems(catalogue.data).filter(narration.accept),
);

/** The native refresh control under the picker's list, or null when there is none. */
function refreshControlOf(root: RenderResult['root']) {
  const [control] = root?.queryAll((node) => node.type === 'RCTRefreshControl') ?? [];
  return control ?? null;
}

function renderSpeechPicker(extra: { refreshing?: boolean; onRefresh?: () => void } = {}) {
  return renderThemed(
    <ModelPicker
      models={SPEECH}
      selectedId={null}
      recommendedId={narration.recommendedId}
      describe={narration.describe}
      onSelect={jest.fn()}
      searchLabel="Search narration models"
      isNew={(model) => narration.isNew(model, NOW)}
      {...extra}
    />,
  );
}

describe('speech picker on the live catalogue', () => {
  it('shows Fish Audio Drama 3 with a New badge and a default voice', async () => {
    await renderSpeechPicker();

    await fireEvent.changeText(screen.getByLabelText('Search narration models'), 'drama');

    expect(screen.getByText('New')).toBeOnTheScreen();
    expect(screen.getByText(/Default voice/)).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: /Drama 3\. New\. Fish Audio\. Default voice/ }),
    ).toBeOnTheScreen();
  });

  it('lists the three curated narrators first, in their own order', async () => {
    await renderSpeechPicker();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(/Gemini 3\.8 Flash Lite TTS/);
    expect(radios[1]).toHaveAccessibleName(/Kokoro 82M/);
    expect(radios[2]).toHaveAccessibleName(/S2\.1 Pro Free/);
  });
});

describe('ModelPicker pull-to-refresh', () => {
  it('offers a native refresh control when a refresh handler is given', async () => {
    const view = await renderSpeechPicker({ refreshing: true, onRefresh: jest.fn() });

    expect(refreshControlOf(view.root)).not.toBeNull();
  });

  it('has no refresh control when no handler is given', async () => {
    const view = await renderSpeechPicker();

    expect(refreshControlOf(view.root)).toBeNull();
  });
});
