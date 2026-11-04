/**
 * Loads the client entries ChromePage writes into `#ss-admin-entries`. Each entry is imported by its name, and the
 * import map turns that name into a URL, so the map is the only place an entry's URL comes from and nothing can load
 * a second copy from elsewhere. client/loader/MODULES.md documents the failure behaviour for module authors; keep
 * the two in step.
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
 * The entry list from the page, minus any item with no name. Empty, with a console error, when the block is missing
 * or not a list. The list is taken as written: ClientRegistry::dropRefusedItems() has already refused duplicates and
 * items without a module before the page carries it
 */
export function readEntryList(): Array<ClientEntry> {
  const items = readDataBlock(ENTRIES_BLOCK_ID);
  if (!Array.isArray(items)) {
    console.error('The page entry list is missing or not a JSON list; no client entries were loaded');
    return [];
  }
  return items.filter((item): item is ClientEntry => typeof item?.name === 'string');
}

/**
 * Starts every import at once, then runs each entry's `setup` in list order, each waiting for its own import and for
 * the previous `setup` to finish. A failed entry gets one console error and its stylesheet removed. There is no
 * timeout, so a `setup` that never finishes blocks every entry after it
 */
export async function bootEntries(
  items: ReadonlyArray<ClientEntry>,
  importer: EntryImporter = importEntry,
): Promise<void> {
  const imports = items.map((item) => {
    const imported = importer(item.name);
    // A failed import is reported when its turn comes; this stops the browser reporting it as unhandled first
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

/**
 * Removes a failed entry's stylesheets so they stop styling the page; ChromePage writes the `data-entry` they are
 * found by
 */
function removeStylesheets(name: string): void {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-entry]')) {
    if (link.dataset.entry === name) {
      link.remove();
    }
  }
}

/**
 * Waits for the entry's import and runs its `setup`. A failed import, a missing `setup` and a `setup` that fails all
 * throw, so bootEntries() reports them the same way. The `admin` object is a frozen copy, so one entry cannot change
 * what the next one sees
 */
async function setupEntry(item: ClientEntry, imported: Promise<EntryExports>): Promise<void> {
  const exported = await imported;
  if (typeof exported?.setup !== 'function') {
    throw new Error(`The client entry "${item.name}" exports no setup function`);
  }
  const admin: AdminApi = deepFreeze({ entry: structuredClone(item) });
  await exported.setup(admin);
}
