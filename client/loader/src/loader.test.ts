// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimInternals } from '@silverstripe/admin';
import { ENTRIES_BLOCK_ID } from './clientConfig';
import { bootEntries, readEntryList } from './loader';
import type { EntryExports, EntryImporter } from './loader';
import type { AdminApi, ClientEntry } from './types';

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.head.replaceChildren();
});

/** An importer that records each specifier asked for and resolves, or rejects, with what the map holds for it */
function countingImporter(entries: Record<string, EntryExports | Error | Promise<EntryExports>>) {
  const imported: Array<string> = [];
  const importer: EntryImporter = (specifier) => {
    imported.push(specifier);
    const entry = entries[specifier];
    return entry instanceof Error ? Promise.reject(entry) : Promise.resolve(entry);
  };
  return { imported, importer };
}

// An entry list item for a name
const listed = (name: string): ClientEntry => ({ name, module: 'acme/files' });

// The entry name quoted in each console error, in order
const failedNames = () => errors.mock.calls.map(([message]: Array<unknown>) => String(message).match(/"([\w-]+)"/)?.[1]);

describe('bootEntries', () => {
  it('imports every listed entry, sets them up in list order, and skips each failure with one error', async () => {
    let finishSlow: (module: EntryExports) => void = () => undefined;
    const seen: Array<string> = [];
    const setup: EntryExports['setup'] = (admin) => {
      seen.push(admin.entry.name);
    };
    const { imported, importer } = countingImporter({
      'slow': new Promise((resolve) => {
        finishSlow = resolve;
      }),
      'fast': { setup },
      'missing': new TypeError('Failed to fetch dynamically imported module'),
      'no-setup': {},
      'throws': {
        setup: () => {
          throw new Error('Setup failed');
        },
      },
      'rejects': { setup: () => Promise.reject(new Error('Setup failed later')) },
    });
    const booted = bootEntries(
      ['slow', 'missing', 'fast', 'no-setup', 'throws', 'rejects'].map(listed),
      importer,
    );
    expect(imported).toEqual(['slow', 'missing', 'fast', 'no-setup', 'throws', 'rejects']);
    // A task boundary, so a rejection behind the pending import would surface as unhandled
    await new Promise((resolve) => setTimeout(resolve));
    finishSlow({ setup });
    await booted;

    expect(seen).toEqual(['slow', 'fast']);
    expect(failedNames()).toEqual(['missing', 'no-setup', 'throws', 'rejects']);
  });

  it('passes setup() a frozen admin object whose entry is the item', async () => {
    const item = listed('files');
    let received: AdminApi | undefined;
    let afterAwait: AdminApi | undefined;
    const { importer } = countingImporter({
      files: {
        setup: async (admin) => {
          received = admin;
          await Promise.resolve();
          afterAwait = admin;
        },
      },
    });
    await bootEntries([item], importer);
    expect(received).toBe(afterAwait);
    expect(received?.entry).not.toBe(item);
    expect(received?.entry).toEqual(item);
    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(received?.entry)).toBe(true);
  });

  it('sets up an item without waiting for a later item whose import never settles', async () => {
    const seen: Array<string> = [];
    const { importer } = countingImporter({
      first: {
        setup: (admin) => {
          seen.push(admin.entry.name);
        },
      },
      hangs: new Promise<EntryExports>(() => undefined),
    });
    void bootEntries([listed('first'), listed('hangs')], importer);
    await vi.waitFor(() => expect(seen).toEqual(['first']));
  });

  it("removes a failed entry's stylesheet link and keeps the others, stylesheet-only links included", async () => {
    const link = (name?: string) => {
      const element = document.createElement('link');
      element.rel = 'stylesheet';
      if (name) {
        element.dataset.entry = name;
      }
      document.head.append(element);
    };
    link('broken');
    link();
    link('working');
    const { importer } = countingImporter({ broken: new TypeError('Failed to fetch'), working: { setup: () => undefined } });

    await bootEntries([listed('broken'), listed('working')], importer);

    expect([...document.querySelectorAll('link')].map((element) => element.dataset.entry)).toEqual([
      undefined,
      'working',
    ]);
  });
});

describe('claimInternals', () => {
  it('refuses a second claim of the runtime internals', () => {
    expect(() => claimInternals()).toThrow('cannot be claimed again');
  });
});

describe('readEntryList', () => {
  /** Writes an entry list block into the page the way ChromePage.ss does */
  function entryBlock(json: string) {
    const block = document.createElement('script');
    block.id = ENTRIES_BLOCK_ID;
    block.textContent = json;
    document.head.append(block);
  }

  it('logs an error and lists nothing when the block is missing, not JSON or not a list', () => {
    expect(readEntryList()).toEqual([]);
    for (const json of ['[{"name"', '{"name":"files","module":"acme/files"}']) {
      entryBlock(json);
      expect(readEntryList()).toEqual([]);
      document.head.replaceChildren();
    }
    expect(errors).toHaveBeenCalledTimes(3);
  });
});
