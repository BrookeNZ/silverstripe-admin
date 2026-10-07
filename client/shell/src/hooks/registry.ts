/**
 * The hooks registry: handlers pilets (and the shell, as owner "shell") register by hook name, run in a
 * settled order wherever the shell reaches a hook point. It replaces the legacy Injector's transforms;
 * there is no Injector adapter, PILET-API.md maps each transform to its successor.
 *
 * Order: `before`/`after` constraints first (a topological sort), then the owner's place in the feed
 * (the shell ahead of every pilet), then registration order. A cycle in the constraints is logged with
 * the pilets involved and the handlers run in feed order instead.
 *
 * Every handler runs in isolation. An `updateX` handler that throws (or returns a promise, which an
 * update cannot wait for) is logged and the previous value passes on; in development builds each
 * handler gets a deep-frozen copy of its input, so a handler that mutates instead of returning fails
 * loudly there. An `onBeforeX` handler that throws is logged and the error rejects the run, which
 * cancels whatever was about to happen and lets the caller show why. `onAfterX` errors are logged.
 *
 * The registry is module state rather than Piral global state, so shell components can run hooks
 * without a Piral context; the Pilet API plugin supplies the feed order and clears a pilet's handlers
 * when it unloads.
 */
import * as React from 'react';
import type { HookContext, HookHandler, HookOptions, HookValue } from './types';

export type HookKind = 'update' | 'onBefore' | 'onAfter';

export const shellHookOwner = 'shell';

type AnyHandler = (...args: Array<any>) => unknown;

export interface HookRegistration {
  /** `<owner>:<id>`, what `before` and `after` name */
  key: string;
  owner: string;
  handler: AnyHandler;
  before: ReadonlyArray<string>;
  after: ReadonlyArray<string>;
  sequence: number;
}

const registrations = new Map<string, ReadonlyArray<HookRegistration>>();
const listeners = new Set<() => void>();
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
  }
}

export function registerHook<N extends string>(owner: string, name: N, handler: HookHandler<N>, options: HookOptions = {}): () => void {
  if (!hookKind(name)) {
    throw new Error(`Hook "${name}" from "${owner}" is not an updateX, onBeforeX or onAfterX name`);
  }
  sequence += 1;
  const key = `${owner}:${options.id ?? sequence}`;
  const existing = registrations.get(name) ?? noRegistrations;
  if (existing.some((registration) => registration.key === key)) {
    throw new Error(`Hook "${name}" already has a handler registered as "${key}"`);
  }
  const registration: HookRegistration = {
    key,
    owner,
    handler: handler as AnyHandler,
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
  const looped = [...new Set(base.filter((registration) => !ordered.includes(registration)).map((registration) => registration.owner))];
  console.warn(
    `The before and after options of hook "${name}" form a cycle between ${looped.map((owner) => `"${owner}"`).join(', ')}; its handlers run in feed order`,
  );
  return base;
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

// A copy, because the input may be state the shell or the form library still mutates
function frozenCopy<T>(value: T): T {
  if (!isPlain(value) || Object.isFrozen(value)) {
    return value;
  }
  const copy: any = Array.isArray(value) ? value.map(frozenCopy) : {};
  if (!Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = frozenCopy(entry);
    }
  }
  return Object.freeze(copy);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function';
}

function logFailure(name: string, registration: HookRegistration, error: unknown, outcome: string): void {
  console.error(`Hook "${name}" handler "${registration.key}" from pilet "${registration.owner}" failed; ${outcome}`, error);
}

function applyUpdates<V>(name: string, handlers: ReadonlyArray<HookRegistration>, value: V, context: unknown): V {
  let current = value;
  for (const registration of handlers) {
    try {
      const next = registration.handler(freezeInputs ? frozenCopy(current) : current, context);
      if (isThenable(next)) {
        throw new Error('an update handler must return its value, not a promise');
      }
      current = next as V;
    } catch (error) {
      logFailure(name, registration, error, 'the previous value passes on');
    }
  }
  return current;
}

export function runUpdateHook<N extends string>(name: N, value: HookValue<N>, context: HookContext<N>): HookValue<N> {
  return applyUpdates(name, orderedHooks(name), value, context);
}

/** Whether to go ahead: false as soon as a handler resolves false. A thrown error is logged and rejects */
export async function runBeforeHook<N extends string>(name: N, context: HookContext<N>): Promise<boolean> {
  for (const registration of orderedHooks(name)) {
    try {
      if ((await registration.handler(context)) === false) {
        return false;
      }
    } catch (error) {
      logFailure(name, registration, error, 'cancelling');
      throw error;
    }
  }
  return true;
}

export function runAfterHook<N extends string>(name: N, context: HookContext<N>): void {
  for (const registration of orderedHooks(name)) {
    try {
      const result = registration.handler(context);
      if (isThenable(result)) {
        Promise.resolve(result).catch((error) => logFailure(name, registration, error, 'ignored'));
      }
    } catch (error) {
      logFailure(name, registration, error, 'ignored');
    }
  }
}

type HookRunArguments<N extends string> = N extends `update${string}` ? [value: HookValue<N>, context: HookContext<N>] : [context: HookContext<N>];

type HookRunResult<N extends string> = N extends `update${string}`
  ? HookValue<N>
  : N extends `onBefore${string}`
    ? Promise<boolean>
    : void;

/** Runs a hook of any kind, decided by its name */
export function runHook<N extends string>(name: N, ...args: HookRunArguments<N>): HookRunResult<N> {
  const run = args as Array<any>;
  switch (hookKind(name)) {
    case 'update':
      return runUpdateHook(name, run[0], run[1]) as HookRunResult<N>;
    case 'onBefore':
      return runBeforeHook(name, run[0]) as HookRunResult<N>;
    case 'onAfter':
      return runAfterHook(name, run[0]) as HookRunResult<N>;
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
