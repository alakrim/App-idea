// Loads the app's own TypeScript modules into Node, so the contract check runs the real request
// builders instead of a copy of them. Node's built-in hooks resolve the `@/` alias and extensionless
// relative imports, and the repo's `typescript` (a dev dependency) transpiles each `.ts` file to
// CommonJS on the fly. Nothing is written to disk.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));

/** Candidate files for an import path: the path itself, then `.ts`, then a directory `index.ts`. */
function firstExisting(base) {
  const candidates = [base, `${base}.ts`, join(base, 'index.ts')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

let installed = false;

/** Registers the hooks once per process. Safe to call again. */
export function installTypeScriptLoader() {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@/')) {
        const file = firstExisting(join(SRC_DIR, specifier.slice(2)));
        if (file === null) throw new Error(`Cannot resolve ${specifier}`);
        return { url: pathToFileURL(file).href, shortCircuit: true };
      }
      const parentFile = context.parentURL?.startsWith('file:')
        ? fileURLToPath(context.parentURL)
        : null;
      const isTsParent = parentFile !== null && parentFile.endsWith('.ts');
      if (isTsParent && (specifier.startsWith('./') || specifier.startsWith('../'))) {
        const file = firstExisting(resolvePath(dirname(parentFile), specifier));
        if (file === null) throw new Error(`Cannot resolve ${specifier} from ${parentFile}`);
        return { url: pathToFileURL(file).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context);
      const fileName = fileURLToPath(url);
      const { outputText } = ts.transpileModule(readFileSync(fileName, 'utf8'), {
        fileName,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      });
      return { format: 'commonjs', source: outputText, shortCircuit: true };
    },
  });
}

/** Requires a TypeScript module by its path under the repo, for example `src/core/defaults.ts`. */
export function loadTs(repoRelativePath) {
  installTypeScriptLoader();
  const require = createRequire(import.meta.url);
  return require(fileURLToPath(new URL(`../../${repoRelativePath}`, import.meta.url)));
}
