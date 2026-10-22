/**
 * Loads the modules ChromePage writes into `#ss-admin-modules`. Each is imported by its import map specifier, so the
 * map is the only source of a module's URL and an override of that URL cannot load a second copy.
 * client/loader/MODULES.md documents the failure behaviour for module authors; keep the two in step.
 */
import type { ModuleMetadata, ModuleSetup } from './types';
import { MODULES_BLOCK_ID, deepFreeze, readDataBlock } from './clientConfig';

/** The namespace object `import()` resolves to; `setup` is the only export the loader reads */
export interface ModuleExports {
  setup?: ModuleSetup;
}

/** Replaceable so a test can stand in for `import()` */
export type ModuleImporter = (specifier: string) => Promise<ModuleExports>;

// webpackIgnore leaves the import to the browser, which resolves the specifier through the page's import map
const importModule: ModuleImporter = (specifier) => import(/* webpackIgnore: true */ specifier);

/**
 * The page's module list with duplicates and malformed items removed; empty, with a console error, when the block
 * is missing or not a list. Keep the first-item-wins rule in step with ChromePage::listedNamesBySpecifier()
 */
export function readModuleList(): Array<ModuleMetadata> {
  const items = readDataBlock(MODULES_BLOCK_ID);
  if (!Array.isArray(items)) {
    console.error('The page module list is missing or not a JSON list; no modules were loaded');
    return [];
  }
  const byName = new Map<string, ModuleMetadata>();
  for (const item of items) {
    if (typeof item?.name !== 'string') {
      continue;
    }
    if (byName.has(item.name)) {
      console.warn(`The admin module "${item.name}" is listed more than once; only its first item is used`);
      continue;
    }
    byName.set(item.name, item as ModuleMetadata);
  }
  return [...byName.values()];
}

/**
 * Imports every item at once, then runs each `setup` in list order, waiting for a returned promise before the next.
 * A failed import or `setup` gets one console error and its stylesheet removed, and the rest still run. There is
 * no timeout, so an import or `setup` that never settles holds back every item after it
 */
export async function bootModules(
  items: ReadonlyArray<ModuleMetadata>,
  importer: ModuleImporter = importModule,
): Promise<void> {
  const imported = await Promise.allSettled(items.map((item) => importer(item.specifier)));
  for (const [index, item] of items.entries()) {
    try {
      await setupModule(item, imported[index]);
    } catch (error) {
      console.error(`The admin module "${item.name}" failed to load`, error);
      removeStylesheets(item.name);
    }
  }
}

/** A failed module's stylesheet must not keep restyling the page; ChromePage writes the `data-module` it is found by */
function removeStylesheets(name: string): void {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-module]')) {
    if (link.dataset.module === name) {
      link.remove();
    }
  }
}

/**
 * Throws for a rejected import, a missing `setup` and a `setup` that throws or rejects alike, so bootModules()
 * reports all three the same way. The item is cloned and frozen so one module cannot change what the next one sees
 */
async function setupModule(item: ModuleMetadata, imported: PromiseSettledResult<ModuleExports>): Promise<void> {
  if (imported.status === 'rejected') {
    throw imported.reason;
  }
  const module = imported.value;
  if (typeof module?.setup !== 'function') {
    throw new Error(`The module "${item.name}" exports no setup function`);
  }
  const frozen = deepFreeze(structuredClone(item));
  await module.setup(frozen);
}
