// Stand-ins for the native side of the New Architecture app. Each stub answers the way the Android
// build does for the calls the JS side makes at startup. Every call is recorded so a failure can be
// explained, and a fatal JS error is captured the same way the native ExceptionsManager receives it.

/**
 * @typedef {{ message: string, stack: unknown, source: 'fatal' | 'soft' }} Report
 * @typedef {ReturnType<typeof createRecorder>} Recorder
 * @typedef {{
 *   sandbox: Record<string, unknown>,
 *   recorder: Recorder,
 *   appConfigJson: string,
 *   reportError: (error: unknown) => void,
 * }} NativeContext
 */

/**
 * @returns {{
 *   fatals: Report[],
 *   softs: Report[],
 *   logs: string[],
 *   views: Map<string, number>,
 *   moduleCalls: string[],
 *   callableModules: Map<string, unknown>,
 * }}
 */
export function createRecorder() {
  return {
    fatals: [],
    softs: [],
    logs: [],
    views: new Map(),
    moduleCalls: [],
    callableModules: new Map(),
  };
}

/**
 * TurboModules that the Android build registers: React Native's own specs, plus the third-party
 * modules whose classes are in the release dex (checked with `strings classes*.dex`). A name outside
 * this list resolves to null, as it does on a device where the module is not linked. Code that
 * reads `NativeModules.X` for an absent module must cope with undefined, and the harness must not
 * fake it into a function.
 */
const LINKED_TURBO_MODULES = new Set([
  'AccessibilityInfo',
  'AccessibilityManager',
  'ActionSheetManager',
  'AlertManager',
  'AppState',
  'Appearance',
  'AudioAPIModule',
  'BlobModule',
  'Clipboard',
  'DeviceEventManager',
  'DeviceInfo',
  'DevLoadingView',
  'DevMenu',
  'DevSettings',
  'ExceptionsManager',
  'FrameRateLogger',
  'HeadlessJsTaskSupport',
  'I18nManager',
  'ImageLoader',
  'IntentAndroid',
  'KeyboardObserver',
  'LinkingManager',
  'LogBox',
  'ModalManager',
  'NativeAnimatedModule',
  'NativeDOMCxx',
  'NativeIdleCallbacksCxx',
  'NativeIntersectionObserverCxx',
  'NativeMicrotasksCxx',
  'NativeMutationObserverCxx',
  'NativePerformanceCxx',
  'NativeReactNativeFeatureFlagsCxx',
  'NativeViewTransitionCxx',
  'Networking',
  'PermissionsAndroid',
  'PlatformConstants',
  'RNCWebViewModule',
  'RNGestureHandlerModule',
  'ReanimatedModule',
  'SegmentFetcher',
  'ShareModule',
  'SourceCode',
  'StatusBarManager',
  'Timing',
  'ToastAndroid',
  'UIManager',
  'Vibration',
  'WorkletsModule',
]);

/** Constants that the native modules return synchronously. Values match a 412x915 dp phone. */
const MODULE_CONSTANTS = {
  PlatformConstants: () => ({
    forceTouchAvailable: false,
    osVersion: '16',
    systemName: 'Android',
    interfaceIdiom: 'phone',
    isTesting: false,
    reactNativeVersion: { major: 0, minor: 86, patch: 3, prerelease: null },
    isDisableAnimations: false,
    fontScale: 1,
  }),
  DeviceInfo: () => ({
    Dimensions: {
      window: { width: 412, height: 915, scale: 2.625, fontScale: 1 },
      screen: { width: 412, height: 915, scale: 2.625, fontScale: 1 },
    },
  }),
  SourceCode: () => ({ scriptURL: 'file:///android_asset/index.android.bundle' }),
  I18nManager: () => ({ isRTL: false, doLeftAndRightSwapInRTL: true }),
  AppState: () => ({ initialAppState: 'active' }),
  AccessibilityManager: () => ({
    isTouchExplorationEnabled: false,
    isReduceMotionEnabled: false,
    isReduceTransparencyEnabled: false,
  }),
};

/**
 * A host object installed from C++ (JSI). Every method answers a fresh opaque object, the way the
 * native side returns handles (for example Worklets' SerializableRef values, which are used as
 * WeakMap keys and so must be objects).
 *
 * @param {Recorder} recorder
 * @param {string} label
 */
function createHostObject(recorder, label) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then' || typeof prop === 'symbol') {
          return undefined;
        }
        return (/** @type {unknown[]} */ ...args) => {
          recorder.moduleCalls.push(`${label}.${String(prop)}(${args.length})`);
          return {};
        };
      },
    }
  );
}

/**
 * Methods with real behaviour in the harness. Everything else answers undefined.
 *  - NativeMicrotasksCxx.queueMicrotask is what bridgeless React Native uses for the global
 *    `queueMicrotask`. A throw in it reaches the native error handler, so it is reported.
 *  - WorkletsModule.installTurboModule is where libworklets.so defines `__workletsModuleProxy`.
 *
 * @param {string} name
 * @param {NativeContext} ctx
 * @returns {Record<string, (...args: unknown[]) => unknown>}
 */
function methodsFor(name, ctx) {
  switch (name) {
    case 'NativeMicrotasksCxx':
      return {
        queueMicrotask: (fn) =>
          queueMicrotask(() => {
            try {
              /** @type {() => void} */ (fn)();
            } catch (error) {
              ctx.reportError(error);
            }
          }),
      };
    case 'WorkletsModule':
      return {
        installTurboModule: () => {
          ctx.sandbox.__workletsModuleProxy = createHostObject(ctx.recorder, 'workletsModuleProxy');
        },
      };
    // No deep link at launch: the promise resolves to null, as on a plain launcher start.
    case 'IntentAndroid':
      return { getInitialURL: () => Promise.resolve(null) };
    // expo-observe answers with the integrations it wants active. A device with no integrations
    // configured answers an empty object.
    case 'ExpoObserve':
      return { getIntegrations: () => ({}) };
    default:
      return {};
  }
}

/**
 * Data properties (read as values, never called) of the expo modules that the app reads at startup.
 * `ExponentConstants.manifest` is the embedded app config as JSON, which the device reads from the
 * APK's assets/app.config.
 *
 * @param {NativeContext} ctx
 * @returns {Record<string, Record<string, unknown>>}
 */
function dataPropertiesFor(ctx) {
  return {
    ExponentConstants: {
      manifest: ctx.appConfigJson,
      executionEnvironment: 'bare',
      appOwnership: null,
      isDevice: true,
      platform: { android: { versionCode: 1 } },
      linkingUri: 'lectio://',
      sessionId: 'boot-harness',
      installationId: 'boot-harness',
      statusBarHeight: 24,
      systemFonts: [],
      nativeAppVersion: '0.1.0',
      nativeBuildVersion: '1',
    },
  };
}

/**
 * A native module that answers every method with undefined unless the harness implements it, and
 * records each call. Modules with constants return them from `getConstants`.
 *
 * @param {string} name the module's key on its registry (TurboModule name or expo module name)
 * @param {NativeContext} ctx
 */
function createTurboModule(name, ctx) {
  const constants = MODULE_CONSTANTS[/** @type {keyof typeof MODULE_CONSTANTS} */ (name)];
  const data = dataPropertiesFor(ctx)[name] ?? {};
  const methods = methodsFor(name, ctx);
  // The target carries the data properties so that object spread (`{ ...ExponentConstants }`) copies them.
  return new Proxy(
    { ...data },
    {
      get(_target, prop) {
        if (prop === 'then' || typeof prop === 'symbol') {
          return undefined;
        }
        if (prop in data) {
          return data[String(prop)];
        }
        if (prop === 'getConstants') {
          return () => (constants ? constants() : {});
        }
        // Native classes (for example ExpoFetchModule.NativeResponse) are read at module init and
        // subclassed, so they must be constructors rather than methods.
        if (/^[A-Z]/.test(String(prop))) {
          return class StubNativeClass {};
        }
        const implemented = methods[String(prop)];
        return (/** @type {unknown[]} */ ...args) => {
          ctx.recorder.moduleCalls.push(`${name}.${String(prop)}(${args.length})`);
          return implemented?.(...args);
        };
      },
    }
  );
}

/**
 * The Fabric UI manager. Creating a host view is the signal that the first screen rendered.
 *
 * @param {Recorder} recorder
 */
function createFabricUIManager(recorder) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then' || typeof prop === 'symbol') {
          return undefined;
        }
        return (/** @type {unknown[]} */ ...args) => {
          if (prop === 'createNode' && typeof args[1] === 'string') {
            recorder.views.set(args[1], (recorder.views.get(args[1]) ?? 0) + 1);
          }
          return {};
        };
      },
    }
  );
}

/**
 * Expo modules are looked up on `globalThis.expo.modules`. Each one answers every method with
 * undefined, which is enough for module-init code that only holds references to them.
 *
 * @param {NativeContext} ctx
 */
function createExpoModules(ctx) {
  /** @type {Map<string, unknown>} */
  const cache = new Map();
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== 'string' || name === 'then') {
          return undefined;
        }
        if (!cache.has(name)) {
          cache.set(name, createTurboModule(name, ctx));
        }
        return cache.get(name);
      },
    }
  );
}

/** Minimal stand-in for the EventEmitter class that the native expo-modules-core installs. */
class StubEventEmitter {
  /** @param {unknown} _native */
  constructor(_native) {}
  /** @param {string} _name @param {unknown} _listener */
  addListener(_name, _listener) {
    return { remove() {} };
  }
  /** @param {string} _name @param {unknown} _listener */
  removeListener(_name, _listener) {}
  /** @param {string} _name */
  removeAllListeners(_name) {}
  /** @param {string} _name @param {...unknown} _args */
  emit(_name, ..._args) {}
}

/**
 * Installs the native surface into a sandbox object before the bundle runs. This matches the order
 * in which the native host installs it: globals, then the expo JSI host, then the bundle.
 *
 * @param {NativeContext} ctx
 */
export function installNativeStubs(ctx) {
  const { sandbox, recorder } = ctx;
  sandbox.RN$Bridgeless = true;
  sandbox.RN$registerCallableModule = (/** @type {string} */ name, /** @type {unknown} */ factory) => {
    recorder.callableModules.set(name, factory);
  };
  sandbox.nativeFabricUIManager = createFabricUIManager(recorder);
  sandbox.__turboModuleProxy = (/** @type {string} */ name) => {
    if (name === 'ExceptionsManager') {
      return {
        reportException: (/** @type {{ message: string, stack: unknown, isFatal: boolean }} */ e) => {
          (e.isFatal ? recorder.fatals : recorder.softs).push({
            message: e.message,
            stack: e.stack,
            source: e.isFatal ? 'fatal' : 'soft',
          });
        },
        reportFatalException: (/** @type {string} */ message, /** @type {unknown} */ stack) => {
          recorder.fatals.push({ message, stack, source: 'fatal' });
        },
        reportSoftException: (/** @type {string} */ message, /** @type {unknown} */ stack) => {
          recorder.softs.push({ message, stack, source: 'soft' });
        },
        updateExceptionMessage: () => undefined,
      };
    }
    return LINKED_TURBO_MODULES.has(name) ? createTurboModule(name, ctx) : null;
  };
  sandbox.nativeModuleProxy = new Proxy(
    {},
    {
      get: (_t, name) =>
        typeof name === 'string' && LINKED_TURBO_MODULES.has(name)
          ? createTurboModule(name, ctx)
          : undefined,
    }
  );
  sandbox.expo = {
    EventEmitter: StubEventEmitter,
    NativeModule: class {},
    SharedObject: class {},
    SharedRef: class {},
    modules: createExpoModules(ctx),
  };
}
