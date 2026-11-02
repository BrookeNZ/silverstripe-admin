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
  const seen = new Set<string>();
  const listed: Array<ModuleMetadata> = [];
  for (const item of items) {
    if (typeof item?.name !== 'string') {
      continue;
    }
    if (seen.has(item.name)) {
      console.warn(`The admin module "${item.name}" is listed more than once; only its first item is used`);
      continue;
    }
    seen.add(item.name);
    if (typeof item.specifier !== 'string') {
      console.warn(`The admin module "${item.name}" is listed without a specifier; it is not loaded`);
      continue;
    }
    listed.push(item as ModuleMetadata);
  }
  return listed;
}

/**
 * Starts every import at once, then runs each `setup` in list order once its own import arrives and the previous
 * `setup` has settled. A failure gets one console error and its stylesheet removed; one that never settles holds back
 * every item after it, since there is no timeout
 */
export async function bootModules(
  items: ReadonlyArray<ModuleMetadata>,
  importer: ModuleImporter = importModule,
): Promise<void> {
  const imports = items.map((item) => {
    const imported = importer(item.specifier);
    // A rejection is reported when its item's turn comes; until then it must not count as unhandled
    imported.catch(() => undefined);
    return imported;
  });
  for (const [index, item] of items.entries()) {
    try {
      await setupModule(item, imports[index]);
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
async function setupModule(item: ModuleMetadata, imported: Promise<ModuleExports>): Promise<void> {
  const module = await imported;
  if (typeof module?.setup !== 'function') {
    throw new Error(`The module "${item.name}" exports no setup function`);
  }
  const frozen = deepFreeze(structuredClone(item));
  await module.setup(frozen);
}
