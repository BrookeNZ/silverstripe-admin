/**
 * The hooks registry: handlers pilets (and the shell, as owner "shell") register by hook name, run in a
 * settled order wherever the shell reaches a hook point. It replaces the legacy Injector's transforms;
 * there is no Injector adapter, PILET-API.md maps each transform to its successor.
 *
 * Order: `before`/`after` constraints first (a topological sort), then the owner's place in the feed
 * (the shell ahead of every pilet), then registration order. A cycle in the constraints is logged with
 * the pilets in it; the handlers it leaves unordered run after the rest, in feed order.
 *
 * Every handler runs in isolation. An `updateX` handler that throws, returns a promise (which an
 * update cannot wait for) or returns undefined is logged and the previous value passes on; in
 * development builds each handler gets deep-frozen copies of the plain objects and arrays in its value
 * and context, so a handler that mutates instead of returning fails loudly there. An `onBeforeX`
 * handler that throws is logged and the error rejects the run, which cancels whatever was about to
 * happen and lets the caller show why. `onAfterX` errors are logged.
 *
 * A handler that runs the update or after hook it belongs to is not run again: the inner run warns and
 * hands back the value it was given. Before hooks are left out because they are awaited, so two runs of
 * one may overlap legitimately (two forms saving).
 *
 * The registry is module state rather than Piral global state, so shell components can run hooks
 * without a Piral context; the Pilet API plugin supplies the feed order and clears a pilet's handlers
 * when it unloads.
 */
import * as React from 'react';
import type { AfterHookName, BeforeHookName, HookContext, HookHandler, HookOptions, HookValue, UpdateHookName } from './types';

export type HookKind = 'update' | 'onBefore' | 'onAfter';

export const shellHookOwner = 'shell';

type StoredHandler = (...args: ReadonlyArray<unknown>) => unknown;

export interface HookRegistration {
  /** `<owner>:<id>`, what `before` and `after` name */
  key: string;
  owner: string;
  handler: StoredHandler;
  before: ReadonlyArray<string>;
  after: ReadonlyArray<string>;
  sequence: number;
}

const registrations = new Map<string, ReadonlyArray<HookRegistration>>();
const listeners = new Set<() => void>();
const running = new Map<string, number>();
const orderCache = new Map<string, { source: ReadonlyArray<HookRegistration>; feed: ReadonlyArray<string>; ordered: ReadonlyArray<HookRegistration> }>();
const noRegistrations: ReadonlyArray<HookRegistration> = [];
const noPilets: ReadonlyArray<string> = [];
let readFeedOrder: () => ReadonlyArray<string> = () => noPilets;
let sequence = 0;

const freezeInputs = process.env.NODE_ENV !== 'production';

export function hookKind(name: string): HookKind | null {
  const match = /^(update|onBefore|onAfter)[A-Z]/.exec(name);
  return match ? (match[1] as HookKind) : null;
}

/** Pilet names in feed order; read whenever an order is settled */
export function setHookFeedOrder(read: () => ReadonlyArray<string>): void {
  readFeedOrder = read;
  orderCache.clear();
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function store(name: string, list: ReadonlyArray<HookRegistration>): void {
  if (list.length > 0) {
    registrations.set(name, list);
  } else {
    registrations.delete(name);
    orderCache.delete(name);
  }
}

export function registerHook<N extends string>(owner: string, name: N, handler: HookHandler<N>, options: HookOptions = {}): () => void {
  if (!hookKind(name)) {
    throw new Error(`Hook "${name}" from "${owner}" is not an updateX, onBeforeX or onAfterX name`);
  }
  sequence += 1;
  // The `#` keeps a counter id apart from any id a pilet chooses, numeric ones included
  const key = `${owner}:${options.id ?? `#${sequence}`}`;
  const existing = registrations.get(name) ?? noRegistrations;
  if (existing.some((registration) => registration.key === key)) {
    throw new Error(`Hook "${name}" already has a handler registered as "${key}"`);
  }
  const registration: HookRegistration = {
    key,
    owner,
    handler: handler as StoredHandler,
    before: options.before ?? [],
    after: options.after ?? [],
    sequence,
  };
  store(name, [...existing, registration]);
  notify();
  return () => {
    const list = registrations.get(name) ?? noRegistrations;
    if (list.includes(registration)) {
      store(name, list.filter((candidate) => candidate !== registration));
      notify();
    }
  };
}

export function clearHooksOf(owner: string): void {
  let changed = false;
  for (const [name, list] of registrations) {
    const remaining = list.filter((registration) => registration.owner !== owner);
    if (remaining.length !== list.length) {
      store(name, remaining);
      changed = true;
    }
  }
  if (changed) {
    notify();
  }
}

export function resetHooks(): void {
  registrations.clear();
  orderCache.clear();
  running.clear();
  readFeedOrder = () => noPilets;
  notify();
}

export function subscribeHooks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function feedRank(feed: ReadonlyArray<string>, owner: string): number {
  if (owner === shellHookOwner) {
    return -1;
  }
  const index = feed.indexOf(owner);
  return index === -1 ? feed.length : index;
}

function settleOrder(name: string, list: ReadonlyArray<HookRegistration>, feed: ReadonlyArray<string>): ReadonlyArray<HookRegistration> {
  const base = [...list].sort((a, b) => feedRank(feed, a.owner) - feedRank(feed, b.owner) || a.sequence - b.sequence);
  const byKey = new Map(base.map((registration) => [registration.key, registration]));
  const following = new Map<HookRegistration, Array<HookRegistration>>(base.map((registration) => [registration, []]));
  const waitingOn = new Map<HookRegistration, number>(base.map((registration) => [registration, 0]));
  const constrain = (first: HookRegistration | undefined, second: HookRegistration | undefined) => {
    if (first && second && first !== second) {
      following.get(first)!.push(second);
      waitingOn.set(second, waitingOn.get(second)! + 1);
    }
  };
  for (const registration of base) {
    registration.before.forEach((key) => constrain(registration, byKey.get(key)));
    registration.after.forEach((key) => constrain(byKey.get(key), registration));
  }

  const ordered: Array<HookRegistration> = [];
  const ready = base.filter((registration) => waitingOn.get(registration) === 0);
  while (ready.length > 0) {
    // `ready` stays in base order, so constraints aside the feed order decides
    const next = ready.shift()!;
    ordered.push(next);
    for (const later of following.get(next)!) {
      const remaining = waitingOn.get(later)! - 1;
      waitingOn.set(later, remaining);
      if (remaining === 0) {
        ready.push(later);
        ready.sort((a, b) => base.indexOf(a) - base.indexOf(b));
      }
    }
  }
  if (ordered.length === base.length) {
    return ordered;
  }
  const unordered = base.filter((registration) => !ordered.includes(registration));
  const inCycle = unordered.filter((registration) => reachesItself(registration, following));
  const looped = [...new Set(inCycle.map((registration) => registration.owner))];
  console.warn(
    `The before and after options of hook "${name}" form a cycle between ${looped.map((owner) => `"${owner}"`).join(', ')}; the handlers it leaves unordered run last, in feed order`,
  );
  return [...ordered, ...unordered];
}

function reachesItself(start: HookRegistration, following: Map<HookRegistration, Array<HookRegistration>>): boolean {
  const seen = new Set<HookRegistration>();
  const pending = [...following.get(start)!];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next === start) {
      return true;
    }
    if (!seen.has(next)) {
      seen.add(next);
      pending.push(...following.get(next)!);
    }
  }
  return false;
}

/** The handlers of a hook in the order they run; the same array until a registration or the feed changes */
export function orderedHooks(name: string): ReadonlyArray<HookRegistration> {
  const source = registrations.get(name) ?? noRegistrations;
  if (source.length === 0) {
    return noRegistrations;
  }
  const feed = readFeedOrder();
  const cached = orderCache.get(name);
  if (cached && cached.source === source && cached.feed === feed) {
    return cached.ordered;
  }
  const ordered = settleOrder(name, source, feed);
  orderCache.set(name, { source, feed, ordered });
  return ordered;
}

function isPlain(value: unknown): value is Record<string, unknown> | Array<unknown> {
  if (Array.isArray(value)) {
    return true;
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const frozenCopies = new WeakSet<object>();

// A copy, because the input may be state the shell or the form library still mutates. A frozen input is
// copied too, since its children may not be; only a copy made here is known to be frozen all the way down
function frozenCopy<T>(value: T): T {
  if (!isPlain(value) || frozenCopies.has(value)) {
    return value;
  }
  let copy: object;
  if (Array.isArray(value)) {
    copy = Object.freeze(value.map(frozenCopy));
  } else {
    const entries: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      entries[key] = frozenCopy(entry);
    }
    copy = Object.freeze(entries);
  }
  frozenCopies.add(copy);
  return copy as T;
}

function isolated<T>(value: T): T {
  return freezeInputs ? frozenCopy(value) : value;
}

/** Runs `run` unless `name` is already running further up the stack, in which case `reentered` answers */
function guarded<R>(name: string, run: () => R, reentered: () => R): R {
  const depth = running.get(name) ?? 0;
  if (depth > 0) {
    console.warn(`Hook "${name}" was run by one of its own handlers; the inner run is skipped`);
    return reentered();
  }
  running.set(name, depth + 1);
  try {
    return run();
  } finally {
    running.delete(name);
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function';
}

function logFailure(name: string, registration: HookRegistration, error: unknown, outcome: string): void {
  console.error(`Hook "${name}" handler "${registration.key}" from pilet "${registration.owner}" failed; ${outcome}`, error);
}

function applyUpdates<V>(name: string, handlers: ReadonlyArray<HookRegistration>, value: V, context: unknown): V {
  if (handlers.length === 0) {
    return value;
  }
  return guarded(
    name,
    () => {
      const given = isolated(context);
      let current = value;
      for (const registration of handlers) {
        try {
          const next = registration.handler(isolated(current), given);
          if (isThenable(next)) {
            throw new Error('an update handler must return its value, not a promise');
          }
          if (next === undefined) {
            throw new Error('an update handler must return its value, not undefined');
          }
          current = next as V;
        } catch (error) {
          logFailure(name, registration, error, 'the previous value passes on');
        }
      }
      return current;
    },
    () => value,
  );
}

export function runUpdateHook<N extends string>(name: N, value: HookValue<N>, context: HookContext<N>): HookValue<N> {
  return applyUpdates(name, orderedHooks(name), value, context);
}

/** Whether to go ahead: false as soon as a handler resolves false. A thrown error is logged and rejects */
export async function runBeforeHook<N extends string>(name: N, context: HookContext<N>): Promise<boolean> {
  const handlers = orderedHooks(name);
  const given = handlers.length > 0 ? isolated(context) : context;
  for (const registration of handlers) {
    try {
      if ((await registration.handler(given)) === false) {
        return false;
      }
    } catch (error) {
      logFailure(name, registration, error, 'cancelling');
      throw error;
    }
  }
  return true;
}

/** Async handlers are not awaited, so they settle in their own time and order */
export function runAfterHook<N extends string>(name: N, context: HookContext<N>): void {
  const handlers = orderedHooks(name);
  if (handlers.length === 0) {
    return;
  }
  guarded(
    name,
    () => {
      const given = isolated(context);
      for (const registration of handlers) {
        try {
          const result = registration.handler(given);
          if (isThenable(result)) {
            Promise.resolve(result).catch((error) => logFailure(name, registration, error, 'ignored'));
          }
        } catch (error) {
          logFailure(name, registration, error, 'ignored');
        }
      }
    },
    () => undefined,
  );
}

type HookRunArguments<N extends string> = N extends UpdateHookName ? [value: HookValue<N>, context: HookContext<N>] : [context: HookContext<N>];

type HookRunResult<N extends string> = N extends UpdateHookName ? HookValue<N> : N extends BeforeHookName ? Promise<boolean> : N extends AfterHookName ? void : never;

/** Runs a hook of any kind, decided by its name */
export function runHook<N extends string>(name: N, ...args: HookRunArguments<N>): HookRunResult<N> {
  // The name's kind decides which tuple HookRunArguments resolved to
  const update = args as ReadonlyArray<unknown> as [value: HookValue<N>, context: HookContext<N>];
  const [context] = args as ReadonlyArray<unknown> as [context: HookContext<N>];
  switch (hookKind(name)) {
    case 'update':
      return runUpdateHook(name, ...update) as HookRunResult<N>;
    case 'onBefore':
      return runBeforeHook(name, context) as HookRunResult<N>;
    case 'onAfter':
      return runAfterHook(name, context) as HookRunResult<N>;
    default:
      throw new Error(`Hook "${name}" is not an updateX, onBeforeX or onAfterX name`);
  }
}

function identity<V>(value: V): V {
  return value;
}

/**
 * An `updateX` hook for use during render: the returned function is stable while the hook's handlers
 * are, so it can sit in a memo's dependencies, and with no handlers it returns its input untouched
 */
export function useUpdateHook<N extends string>(name: N): (value: HookValue<N>, context: HookContext<N>) => HookValue<N> {
  const handlers = React.useSyncExternalStore(subscribeHooks, () => orderedHooks(name));
  return React.useMemo(
    () => (handlers.length === 0 ? identity : (value: HookValue<N>, context: HookContext<N>) => applyUpdates(name, handlers, value, context)),
    [name, handlers],
  );
}
