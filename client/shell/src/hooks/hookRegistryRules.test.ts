/**
 * Probes of the hook registry's edges, each asserting the settled rule so a change shows up as a
 * failure: a handler returning undefined, re-entrancy, what the development freeze covers and leaves
 * open, a cycle's reach, key collisions, a pilet named "shell", unawaited async after handlers and the
 * production build's lack of isolation
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silverstripePlugin } from '../test/silverstripePlugin';
import { orderedHooks, registerHook, resetHooks, runAfterHook, runBeforeHook, runUpdateHook, setHookFeedOrder } from './registry';

afterEach(() => {
  resetHooks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const appendAs = (label: string) => (value: unknown) => [...(value as Array<string>), label];

describe('update handler results', () => {
  it('logs a handler that returns nothing as failed and passes the previous value on to the next handler and the caller', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: Array<unknown> = [];
    registerHook('pages', 'updateList', () => undefined);
    registerHook('pages', 'updateList', (value: unknown) => {
      seen.push(value);
      return value;
    });
    expect(runUpdateHook('updateList', ['start'], undefined)).toEqual(['start']);
    expect(seen).toEqual([['start']]);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('re-entrancy', () => {
  it('guards a handler that runs its own hook: the inner run warns and hands back the value it was given', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;
    registerHook('pages', 'updateList', (value: unknown) => {
      calls += 1;
      return [...(runUpdateHook('updateList', value, undefined) as Array<string>), 'outer'];
    });
    expect(runUpdateHook('updateList', ['start'], undefined)).toEqual(['start', 'outer']);
    expect(calls).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(runUpdateHook('updateList', ['again'], undefined)).toEqual(['again', 'outer']);
  });

  it('guards an after hook run from one of its own handlers the same way', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;
    registerHook('pages', 'onAfterSave', () => {
      calls += 1;
      runAfterHook('onAfterSave', {});
    });
    runAfterHook('onAfterSave', {});
    expect(calls).toBe(1);
  });
});

describe('development freeze', () => {
  it('freezes the context too, so an update handler that changes it fails and the caller\'s copy is untouched', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = { formId: 'Form_EditForm' };
    registerHook('pages', 'updateList', (value: unknown, given: unknown) => {
      (given as { formId: string }).formId = 'changed';
      return value;
    });
    runUpdateHook('updateList', [], context);
    expect(context.formId).toBe('Form_EditForm');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('hands a before handler a frozen context, so changing it rejects the run and the caller\'s copy is untouched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = { values: { Title: 'Before' } };
    registerHook('pages', 'onBeforeSave', (given: unknown) => {
      (given as typeof context).values.Title = 'Changed';
    });
    await expect(runBeforeHook('onBeforeSave', context)).rejects.toThrow(TypeError);
    expect(context.values.Title).toBe('Before');
  });

  it('copies a value frozen only at the top, so its unfrozen children are frozen in the copy', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inner = { title: 'Before' };
    const value = Object.freeze({ inner });
    registerHook('pages', 'updateThing', (given: unknown) => {
      (given as { inner: { title: string } }).inner.title = 'Changed';
      return given;
    });
    runUpdateHook('updateThing', value, undefined);
    expect(inner.title).toBe('Before');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('hands class instances through by reference, so a Map in the value can be mutated', () => {
    const map = new Map([['a', 1]]);
    registerHook('pages', 'updateThing', (given: unknown) => {
      (given as { map: Map<string, number> }).map.set('b', 2);
      return given;
    });
    runUpdateHook('updateThing', { map }, undefined);
    expect(map.has('b')).toBe(true);
  });
});

describe('production build', () => {
  it('hands the caller\'s own value to handlers, so a mutating handler changes shell state', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const registry = await import('./registry');
    const state = { fields: ['Title'] };
    registry.registerHook('pages', 'updateThing', (given: unknown) => {
      (given as typeof state).fields.push('Injected');
      return given;
    });
    registry.runUpdateHook('updateThing', state, undefined);
    expect(state.fields).toEqual(['Title', 'Injected']);
    registry.resetHooks();
  });
});

describe('ordering', () => {
  it('keeps every constraint outside a cycle, and runs only the cycle\'s handlers last in feed order', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setHookFeedOrder(() => ['a', 'b', 'x', 'y']);
    registerHook('a', 'updateList', appendAs('a'), { id: 'one', after: ['b:one'] });
    registerHook('b', 'updateList', appendAs('b'), { id: 'one', after: ['a:one'] });
    registerHook('x', 'updateList', appendAs('x'), { id: 'one' });
    registerHook('y', 'updateList', appendAs('y'), { id: 'one', before: ['x:one'] });
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['y', 'x', 'a', 'b']);
  });

  it('names only the pilets in a cycle, not those downstream of it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setHookFeedOrder(() => ['a', 'b', 'c']);
    registerHook('a', 'updateList', appendAs('a'), { id: 'one', after: ['b:one'] });
    registerHook('b', 'updateList', appendAs('b'), { id: 'one', after: ['a:one'] });
    registerHook('c', 'updateList', appendAs('c'), { after: ['a:one'] });
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['a', 'b', 'c']);
    expect(warn.mock.calls[0][0]).toContain('"a", "b"');
    expect(warn.mock.calls[0][0]).not.toContain('"c"');
  });

  it('keeps counter ids apart from explicit numeric ids, so neither refuses the other', () => {
    registerHook('pages', 'updateList', appendAs('first'));
    const counter = Number(orderedHooks('updateList')[0].key.split(':#')[1]);
    expect(orderedHooks('updateList')[0].key).toBe(`pages:#${counter}`);
    registerHook('pages', 'updateList', appendAs('explicit'), { id: String(counter + 2) });
    expect(() => registerHook('pages', 'updateList', appendAs('auto'))).not.toThrow();
    expect(runUpdateHook('updateList', [], undefined)).toEqual(['first', 'explicit', 'auto']);
  });

  it('refuses a pilet named "shell", whose name is the shell\'s own', () => {
    const context = { on() {}, readState: (read: (state: unknown) => unknown) => read({ modules: [{ name: 'pages' }, { name: 'shell' }] }) };
    const plugin = silverstripePlugin(context);
    expect(() => plugin({}, { name: 'pages' })).not.toThrow();
    expect(() => plugin({}, { name: 'shell' })).toThrow('cannot be named "shell"');
  });

});

describe('async after handlers', () => {
  it('returns before async after handlers settle, and they finish in their own time, not run order', async () => {
    const finished: Array<string> = [];
    registerHook('a', 'onAfterSave', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished.push('first');
    });
    registerHook('b', 'onAfterSave', async () => {
      finished.push('second');
    });
    runAfterHook('onAfterSave', {});
    expect(finished).toEqual(['second']);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(finished).toEqual(['second', 'first']);
  });
});

describe('before handlers', () => {
  it('treats only false as a cancel, so a handler resolving 0, null or "no" lets the action go ahead', async () => {
    registerHook('a', 'onBeforeSave', () => 0 as unknown as boolean);
    registerHook('b', 'onBeforeSave', () => null as unknown as boolean);
    expect(await runBeforeHook('onBeforeSave', {})).toBe(true);
  });

  it('runs a handler disposed while an earlier handler is awaited, since the run holds the list it started with', async () => {
    const ran: Array<string> = [];
    let disposeLater = () => undefined as void;
    registerHook('a', 'onBeforeSave', async () => {
      disposeLater();
      ran.push('a');
    });
    disposeLater = registerHook('b', 'onBeforeSave', () => {
      ran.push('b');
    });
    await runBeforeHook('onBeforeSave', {});
    expect(ran).toEqual(['a', 'b']);
  });
});
