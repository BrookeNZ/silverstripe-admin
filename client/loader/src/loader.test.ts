// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimInternals } from '@silverstripe/admin';
import { MODULES_BLOCK_ID } from './clientConfig';
import { bootModules, readModuleList } from './loader';
import type { ModuleExports, ModuleImporter } from './loader';
import type { ModuleMetadata } from './types';

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.head.replaceChildren();
});

function countingImporter(modules: Record<string, ModuleExports | Error | Promise<ModuleExports>>) {
  const imported: Array<string> = [];
  const importer: ModuleImporter = (specifier) => {
    imported.push(specifier);
    const module = modules[specifier];
    return module instanceof Error ? Promise.reject(module) : Promise.resolve(module);
  };
  return { imported, importer };
}

const listed = (name: string): ModuleMetadata => ({ name, specifier: name });

const failedNames = () => errors.mock.calls.map(([message]: Array<unknown>) => String(message).match(/"([\w-]+)"/)?.[1]);

describe('bootModules', () => {
  it('imports every listed module, sets them up in list order, and skips each failure with one error', async () => {
    let finishSlow: (module: ModuleExports) => void = () => undefined;
    const seen: Array<string> = [];
    const setup: ModuleExports['setup'] = (module) => {
      seen.push(module.name);
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
    const booted = bootModules(
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

  it('passes setup() a frozen copy of its list item', async () => {
    const item = listed('files');
    let received: unknown;
    const { importer } = countingImporter({
      files: {
        setup: (module) => {
          received = module;
        },
      },
    });
    await bootModules([item], importer);
    expect(received).not.toBe(item);
    expect(received).toEqual(item);
    expect(Object.isFrozen(received)).toBe(true);
  });

  it('sets up an item without waiting for a later item whose import never settles', async () => {
    const seen: Array<string> = [];
    const { importer } = countingImporter({
      first: {
        setup: (module) => {
          seen.push(module.name);
        },
      },
      hangs: new Promise<ModuleExports>(() => undefined),
    });
    void bootModules([listed('first'), listed('hangs')], importer);
    await vi.waitFor(() => expect(seen).toEqual(['first']));
  });

  it("removes a failed module's stylesheet link and keeps the others, stylesheet-only links included", async () => {
    const link = (name?: string) => {
      const element = document.createElement('link');
      element.rel = 'stylesheet';
      if (name) {
        element.dataset.module = name;
      }
      document.head.append(element);
    };
    link('broken');
    link();
    link('working');
    const { importer } = countingImporter({ broken: new TypeError('Failed to fetch'), working: { setup: () => undefined } });

    await bootModules([listed('broken'), listed('working')], importer);

    expect([...document.querySelectorAll('link')].map((element) => element.dataset.module)).toEqual([
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

describe('readModuleList', () => {
  function moduleBlock(json: string) {
    const block = document.createElement('script');
    block.id = MODULES_BLOCK_ID;
    block.textContent = json;
    document.head.append(block);
  }

  it('keeps the first item of a name listed twice, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    moduleBlock(JSON.stringify([
      { name: 'files', specifier: 'first' },
      { name: 'files', specifier: 'second' },
    ]));
    expect(readModuleList().map(({ specifier }) => specifier)).toEqual(['first']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips an item without a specifier, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    moduleBlock(JSON.stringify([{ name: 'broken' }, listed('files')]));
    expect(readModuleList()).toEqual([listed('files')]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('logs an error and lists nothing when the block is missing, not JSON or not a list', () => {
    expect(readModuleList()).toEqual([]);
    for (const json of ['[{"name"', '{"name":"files","specifier":"files"}']) {
      moduleBlock(json);
      expect(readModuleList()).toEqual([]);
      document.head.replaceChildren();
    }
    expect(errors).toHaveBeenCalledTimes(3);
  });
});
