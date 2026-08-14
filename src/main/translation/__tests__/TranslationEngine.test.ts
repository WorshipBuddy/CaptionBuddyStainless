import { pipeline } from '@huggingface/transformers';
import { TranslationEngine, TranslationResult } from '../TranslationEngine';

// The real package is ESM-only and marked external for webpack, so it is
// stubbed here. The shape mirrors what the model actually returns, verified
// against Xenova/opus-mt-en-es: an array of { translation_text }.
const translatorCalls: string[] = [];
let translatorImpl: (text: string) => Promise<unknown> = async (text) => [
  { translation_text: `es:${text}` },
];

jest.mock(
  '@huggingface/transformers',
  () => ({
    pipeline: jest.fn(async () => (text: string) => {
      translatorCalls.push(text);
      return translatorImpl(text);
    }),
    env: {},
  }),
  { virtual: true }
);

jest.mock('electron', () => ({
  app: { getPath: () => '/tmp/autoscribe-test' },
}));

const mockedPipeline = pipeline as unknown as jest.Mock;

/** Wait for the engine's async queue to drain. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function readyEngine(): Promise<TranslationEngine> {
  const engine = new TranslationEngine();
  await engine.init();
  return engine;
}

beforeEach(() => {
  // Clears call counts only — the factory's implementation survives.
  jest.clearAllMocks();
  translatorCalls.length = 0;
  translatorImpl = async (text) => [{ translation_text: `es:${text}` }];
});

describe('TranslationEngine', () => {
  test('reports ready only after init', async () => {
    const engine = new TranslationEngine();
    expect(engine.isReady).toBe(false);
    await engine.init();
    expect(engine.isReady).toBe(true);
  });

  test('emits a translation tagged with its segment id', async () => {
    const engine = await readyEngine();
    const results: TranslationResult[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));

    engine.translate('seg-1', 'good morning');
    await flush();

    expect(results).toEqual([{ id: 'seg-1', text: 'es:good morning' }]);
  });

  test('handles the object (non-array) result shape', async () => {
    translatorImpl = async (text) => ({ translation_text: `es:${text}` });
    const engine = await readyEngine();
    const results: TranslationResult[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));

    engine.translate('seg-1', 'hello');
    await flush();

    expect(results[0].text).toBe('es:hello');
  });

  test('processes segments one at a time, in order', async () => {
    const engine = await readyEngine();
    const results: TranslationResult[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));

    engine.translate('a', 'first');
    engine.translate('b', 'second');
    engine.translate('c', 'third');
    await flush();

    expect(translatorCalls).toEqual(['first', 'second', 'third']);
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  test('one failing segment does not stop the queue', async () => {
    translatorImpl = async (text) => {
      if (text === 'bad') throw new Error('model blew up');
      return [{ translation_text: `es:${text}` }];
    };
    const engine = await readyEngine();
    const results: TranslationResult[] = [];
    const errors: Error[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));
    engine.on('error', (e: Error) => errors.push(e));

    engine.translate('a', 'good');
    engine.translate('b', 'bad');
    engine.translate('c', 'also good');
    await flush();

    expect(errors).toHaveLength(1);
    expect(results.map((r) => r.id)).toEqual(['a', 'c']);
  });

  test('ignores requests before the model is ready', async () => {
    const engine = new TranslationEngine();
    const results: TranslationResult[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));

    engine.translate('seg-1', 'too early');
    await flush();

    expect(translatorCalls).toHaveLength(0);
    expect(results).toHaveLength(0);
  });

  test('ignores blank text', async () => {
    const engine = await readyEngine();
    engine.translate('seg-1', '   ');
    await flush();
    expect(translatorCalls).toHaveLength(0);
  });

  test('drops empty translations rather than blanking a line', async () => {
    translatorImpl = async () => [{ translation_text: '   ' }];
    const engine = await readyEngine();
    const results: TranslationResult[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));

    engine.translate('seg-1', 'something');
    await flush();

    expect(results).toHaveLength(0);
  });

  test('clearQueue drops work that has not started', async () => {
    // Hold the first translation open so the rest stay queued behind it.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    translatorImpl = async (text) => {
      if (text === 'first') await gate;
      return [{ translation_text: `es:${text}` }];
    };

    const engine = await readyEngine();
    const results: TranslationResult[] = [];
    engine.on('result', (r: TranslationResult) => results.push(r));

    engine.translate('a', 'first');
    engine.translate('b', 'second');
    engine.translate('c', 'third');
    await flush();

    expect(engine.queueLength).toBe(2);
    engine.clearQueue();
    release();
    await flush();

    // Only the in-flight segment survives the clear.
    expect(results.map((r) => r.id)).toEqual(['a']);
  });

  test('init is idempotent and does not reload the model', async () => {
    const engine = new TranslationEngine();
    await engine.init();
    await engine.init();

    expect(mockedPipeline).toHaveBeenCalledTimes(1);
  });
});
