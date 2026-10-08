import { afterEach, describe, expect, it, vi } from 'vitest';
import { silverstripePlugin } from '../test/silverstripePlugin';
import { clearHooksOf, orderedHooks, registerHook, resetHooks, runAfterHook, runBeforeHook, runHook, runUpdateHook, setHookFeedOrder } from './registry';

afterEach(() => {
  resetHooks();
  vi.restoreAllMocks();
});

const appendAs = (label: string) => (value: unknown) => [...(value as Array<string>), label];

describe('hook order', () => {
  it('runs the shell first, then pilets in feed order, then in registration order', () => {
    setHookFeedOrder(() => ['pages', 'elemental']);
    registerHook('elemental', 'updateList', appendAs('elemental one'));
    registerHook('pages', 'updateList', appendAs('pages'));
    registerHook('unlisted', 'updateList', appendAs('unlisted'));
    registerHook('elemental', 'updateList', appendAs('elemental two'));
    registerHook('shell', 'updateList', appendAs('shell'));
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['shell', 'pages', 'elemental one', 'elemental two', 'unlisted']);
  });

  it('honours before and after over the feed order', () => {
    setHookFeedOrder(() => ['pages', 'elemental', 'history']);
    registerHook('pages', 'updateList', appendAs('pages'), { id: 'list' });
    registerHook('elemental', 'updateList', appendAs('elemental'), { before: ['pages:list'] });
    registerHook('history', 'updateList', appendAs('history'), { id: 'last' });
    registerHook('shell', 'updateList', appendAs('shell'), { after: ['history:last'] });
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['elemental', 'pages', 'history', 'shell']);
  });

  it('ignores a before or after naming nothing registered', () => {
    registerHook('pages', 'updateList', appendAs('pages'), { before: ['missing:one'], after: ['missing:two'] });
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['pages']);
  });

  it('logs a cycle with the pilets in it and runs only its handlers last, in feed order', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setHookFeedOrder(() => ['pages', 'elemental', 'history']);
    registerHook('history', 'updateList', appendAs('history'));
    registerHook('elemental', 'updateList', appendAs('elemental'), { id: 'a', after: ['pages:b'] });
    registerHook('pages', 'updateList', appendAs('pages'), { id: 'b', after: ['elemental:a'] });
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['history', 'pages', 'elemental']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"pages", "elemental"');
    expect(warn.mock.calls[0][0]).not.toContain('history');
  });

  it('keeps the same ordered list until a registration changes', () => {
    registerHook('pages', 'updateList', appendAs('pages'));
    const first = orderedHooks('updateList');
    expect(orderedHooks('updateList')).toBe(first);
    const dispose = registerHook('pages', 'updateList', appendAs('again'));
    expect(orderedHooks('updateList')).not.toBe(first);
    dispose();
  });

  it('refuses a name of no known kind and a key registered twice', () => {
    expect(() => registerHook('pages', 'formSchema', (() => undefined) as never)).toThrow('not an updateX');
    registerHook('pages', 'updateList', appendAs('one'), { id: 'list' });
    expect(() => registerHook('pages', 'updateList', appendAs('two'), { id: 'list' })).toThrow('pages:list');
  });
});

describe('update hooks', () => {
  it('passes the previous value on past a handler that throws, and logs the pilet', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerHook('pages', 'updateList', appendAs('pages'));
    registerHook('broken', 'updateList', () => {
      throw new Error('Broken');
    });
    registerHook('elemental', 'updateList', appendAs('elemental'));
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['pages', 'elemental']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('pilet "broken"');
  });

  it('treats a handler returning a promise as failed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerHook('pages', 'updateList', async () => ['late']);
    expect(runUpdateHook('updateList', ['kept'], undefined)).toEqual(['kept']);
  });

  it('hands each handler a frozen copy outside production builds, so mutating fails and is isolated', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const input = { fields: [{ name: 'Title' }] };
    registerHook('pages', 'updateSchema', (schema) => {
      (schema as typeof input).fields[0].name = 'Changed';
      return schema;
    });
    const result = runUpdateHook('updateSchema', input, undefined) as typeof input;
    expect(result).toBe(input);
    expect(input.fields[0].name).toBe('Title');
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('runs through runHook with the kind its name gives', async () => {
    registerHook('pages', 'updateList', appendAs('pages'));
    registerHook('pages', 'onBeforeSave', () => false);
    expect(runHook('updateList', [], undefined)).toEqual(['pages']);
    await expect(runHook('onBeforeSave', {})).resolves.toBe(false);
  });
});

describe('before hooks', () => {
  it('awaits each handler in order and stops at the first that answers false', async () => {
    const ran: Array<string> = [];
    registerHook('pages', 'onBeforeSave', async () => {
      await Promise.resolve();
      ran.push('pages');
    });
    registerHook('elemental', 'onBeforeSave', () => {
      ran.push('elemental');
      return false;
    });
    registerHook('history', 'onBeforeSave', () => {
      ran.push('history');
    });
    expect(await runBeforeHook('onBeforeSave', {})).toBe(false);
    expect(ran).toEqual(['pages', 'elemental']);
  });

  it('goes ahead when no handler answers false', async () => {
    registerHook('pages', 'onBeforeSave', () => true);
    registerHook('elemental', 'onBeforeSave', () => undefined);
    expect(await runBeforeHook('onBeforeSave', {})).toBe(true);
  });

  it('logs a thrown error and rejects with it, which cancels', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerHook('elemental', 'onBeforeSave', () => {
      throw new Error('Block failed');
    });
    await expect(runBeforeHook('onBeforeSave', {})).rejects.toThrow('Block failed');
    expect(error.mock.calls[0][0]).toContain('pilet "elemental"');
  });
});

describe('after hooks', () => {
  it('tells every handler, logging those that throw or reject', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const told: Array<string> = [];
    registerHook('pages', 'onAfterSave', () => {
      throw new Error('Sync');
    });
    registerHook('elemental', 'onAfterSave', async () => {
      throw new Error('Async');
    });
    registerHook('history', 'onAfterSave', (context) => {
      told.push(`history ${(context as { id: number }).id}`);
    });
    runAfterHook('onAfterSave', { id: 3 });
    await Promise.resolve();
    await Promise.resolve();
    expect(told).toEqual(['history 3']);
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe('removal', () => {
  it('drops a disposed handler and every handler of an unloaded pilet', async () => {
    const ran: Array<string> = [];
    const dispose = registerHook('pages', 'onBeforeSave', () => {
      ran.push('disposed');
    });
    registerHook('unloaded', 'onBeforeSave', () => {
      ran.push('unloaded');
    });
    registerHook('unloaded', 'updateList', appendAs('unloaded'));
    registerHook('kept', 'onBeforeSave', () => {
      ran.push('kept');
    });
    dispose();
    clearHooksOf('unloaded');
    expect(await runBeforeHook('onBeforeSave', {})).toBe(true);
    expect(ran).toEqual(['kept']);
    expect(orderedHooks('updateList')).toEqual([]);
  });
});

describe('pilet api runners', () => {
  // The Pilet API plugin reads the feed order from Piral state, so a stub context holds the modules
  function piletApis(feed: Array<string>) {
    const context = { on() {}, readState: (read: (state: unknown) => unknown) => read({ modules: feed.map((name) => ({ name })) }) };
    const plugin = silverstripePlugin(context);
    return Object.fromEntries(feed.map((name) => [name, plugin({}, { name })]));
  }

  it('runs a pilet-run update hook through shell and pilet handlers in order', () => {
    const apis = piletApis(['pages', 'elemental']);
    apis.elemental.registerHook('updateList', appendAs('elemental'));
    apis.pages.registerHook('updateList', appendAs('pages'));
    registerHook('shell', 'updateList', appendAs('shell'));
    expect(apis.elemental.runUpdateHook('updateList', ['start'], undefined)).toEqual(['start', 'shell', 'pages', 'elemental']);
  });

  it('runs before and after hooks, and refuses a name of the wrong kind', async () => {
    const apis = piletApis(['history']);
    const heard: Array<unknown> = [];
    apis.history.registerHook('onBeforeRevert', () => false);
    apis.history.registerHook('onAfterRevert', (context: unknown) => {
      heard.push(context);
    });
    expect(await apis.history.runBeforeHook('onBeforeRevert', {})).toBe(false);
    apis.history.runAfterHook('onAfterRevert', { version: 2 });
    expect(heard).toEqual([{ version: 2 }]);
    // @ts-expect-error the wrong kind of name is what the runtime check refuses
    expect(() => apis.history.runUpdateHook('onAfterRevert', {}, {})).toThrow('not an updateX');
  });
});
