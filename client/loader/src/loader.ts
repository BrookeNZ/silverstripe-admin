/**
 * Loads the client entries ChromePage writes into `#ss-admin-entries`. Each is imported by its name, which is its
 * import map specifier, so the map is the only source of an entry's URL and an override of that URL cannot load a
 * second copy. client/loader/MODULES.md documents the failure behaviour for module authors; keep the two in step.
 */
import type { AdminApi, ClientEntry, EntrySetup } from './types';
import { ENTRIES_BLOCK_ID, deepFreeze, readDataBlock } from './clientConfig';

/** The namespace object `import()` resolves to; `setup` is the only export the loader reads */
export interface EntryExports {
  setup?: EntrySetup;
}

/** Replaceable so a test can stand in for `import()` */
export type EntryImporter = (specifier: string) => Promise<EntryExports>;

// webpackIgnore leaves the import to the browser, which resolves the specifier through the page's import map
const importEntry: EntryImporter = (specifier) => import(/* webpackIgnore: true */ specifier);

/**
 * The page's entry list with duplicates and malformed items removed; empty, with a console error, when the block
 * is missing or not a list. Keep the first-item-wins rule in step with ClientRegistry::dropRefusedItems()
 */
export function readEntryList(): Array<ClientEntry> {
  const items = readDataBlock(ENTRIES_BLOCK_ID);
  if (!Array.isArray(items)) {
    console.error('The page entry list is missing or not a JSON list; no client entries were loaded');
    return [];
  }
  const seen = new Set<string>();
  const listed: Array<ClientEntry> = [];
  for (const item of items) {
    if (typeof item?.name !== 'string') {
      continue;
    }
    if (seen.has(item.name)) {
      console.warn(`The client entry "${item.name}" is listed more than once; only its first item is used`);
      continue;
    }
    seen.add(item.name);
    if (typeof item.module !== 'string') {
      console.warn(`The client entry "${item.name}" is listed without a module; it is not loaded`);
      continue;
    }
    listed.push(item as ClientEntry);
  }
  return listed;
}

/**
 * Starts every import at once, then runs each `setup` in list order once its own import arrives and the previous
 * `setup` has settled. A failure gets one console error and its stylesheet removed; one that never settles holds back
 * every item after it, since there is no timeout
 */
export async function bootEntries(
  items: ReadonlyArray<ClientEntry>,
  importer: EntryImporter = importEntry,
): Promise<void> {
  const imports = items.map((item) => {
    const imported = importer(item.name);
    // A rejection is reported when its item's turn comes; until then it must not count as unhandled
    imported.catch(() => undefined);
    return imported;
  });
  for (const [index, item] of items.entries()) {
    try {
      await setupEntry(item, imports[index]);
    } catch (error) {
      console.error(`The client entry "${item.name}" failed to load`, error);
      removeStylesheets(item.name);
    }
  }
}

/** A failed entry's stylesheet must not keep restyling the page; ChromePage writes the `data-entry` it is found by */
function removeStylesheets(name: string): void {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-entry]')) {
    if (link.dataset.entry === name) {
      link.remove();
    }
  }
}

/**
 * Throws for a rejected import, a missing `setup` and a `setup` that throws or rejects alike, so bootEntries()
 * reports all three the same way. The handle is built from a clone and frozen so one entry cannot change what the next
 * one sees
 */
async function setupEntry(item: ClientEntry, imported: Promise<EntryExports>): Promise<void> {
  const exported = await imported;
  if (typeof exported?.setup !== 'function') {
    throw new Error(`The client entry "${item.name}" exports no setup function`);
  }
  const admin: AdminApi = deepFreeze({ entry: structuredClone(item) });
  await exported.setup(admin);
}
