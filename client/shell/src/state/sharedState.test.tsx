// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GlobalStateContext, PiletApi, PiletMetadata } from 'piral-core';
import { createSilverstripeApi } from '../api/silverstripe';
import { previewModeStorageKey, resetPreviewMode, setPreviewMode } from '../preview/mode';
import { fakeGlobalContext } from '../test/fakeGlobalContext';
import { resetSharedConfig } from './sharedState';
import type { SharedState } from './sharedState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let context: GlobalStateContext;
let extend: (api: PiletApi, meta: PiletMetadata) => Partial<PiletApi>;

function piletApi(name: string): PiletApi {
  const api = { emit: context.emit, on: context.on, off: context.off } as unknown as PiletApi;
  return Object.assign(api, extend(api, { name } as PiletMetadata));
}

function unload(name: string) {
  context.emit('unload-pilet', { name });
}

beforeEach(() => {
  window.localStorage.clear();
  resetPreviewMode();
  resetSharedConfig();
  window.ss = { config: { sections: [], baseUrl: '/', absoluteBaseUrl: 'http://localhost/', adminUrl: 'admin/', environment: 'dev', debugging: false } } as unknown as typeof window.ss;
  context = fakeGlobalContext();
  extend = createSilverstripeApi()(context) as typeof extend;
});

describe('shared state', () => {
  it('starts with no record, no header, nothing unsaved and the frozen config', () => {
    const api = piletApi('pilet-a');
    let seen: SharedState | undefined;
    const Probe = () => {
      seen = api.useSharedState((state) => state);
      return null;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    expect(seen?.currentRecord).toBeNull();
    expect(seen?.header).toBeNull();
    expect(seen?.unsavedChanges).toBe(false);
    expect(seen?.viewMode).toBe('edit');
    expect(seen?.toasts).toEqual([]);
    expect(seen?.config).toBe(api.getConfig());
    expect(Object.isFrozen(seen)).toBe(true);
    act(() => root.unmount());
  });

  it('calls a subscriber when its selected value changes, not at once and not for other keys', () => {
    const api = piletApi('pilet-a');
    const calls: Array<[unknown, unknown]> = [];
    api.subscribeSharedState((state) => state.currentRecord, (value, previous) => calls.push([value, previous]));
    expect(calls).toEqual([]);

    api.setSectionHeader({ title: 'Pages' });
    expect(calls).toEqual([]);

    const dispose = api.setCurrentRecord({ recordClass: 'Page', id: 7 });
    expect(calls).toEqual([[{ recordClass: 'Page', id: 7 }, null]]);

    dispose();
    expect(calls[1]).toEqual([null, { recordClass: 'Page', id: 7 }]);
  });

  it('stops calling a subscriber once it is disposed', () => {
    const api = piletApi('pilet-a');
    const calls: Array<unknown> = [];
    const unsubscribe = api.subscribeSharedState((state) => state.unsavedChanges, (value) => calls.push(value));
    api.setUnsavedChanges('form', true);
    unsubscribe();
    api.setUnsavedChanges('form', false);
    expect(calls).toEqual([true]);
  });

  it('re-renders a component on a change to its selection only', () => {
    const api = piletApi('pilet-a');
    let renders = 0;
    const Probe = () => {
      renders += 1;
      const record = api.useSharedState((state) => state.currentRecord);
      return <output>{record ? `${record.recordClass}#${record.id}` : 'none'}</output>;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(container.textContent).toBe('none');
    const before = renders;

    act(() => {
      api.setSectionHeader({ title: 'Pages' });
    });
    expect(renders).toBe(before);

    act(() => {
      api.setCurrentRecord({ recordClass: 'Page', id: 3 });
    });
    expect(container.textContent).toBe('Page#3');
    act(() => root.unmount());
  });

  it('settles with a selector that builds a new object each call', () => {
    const api = piletApi('pilet-a');
    const Probe = () => {
      const { mode } = api.useSharedState((state) => ({ mode: state.viewMode }));
      return <output>{mode}</output>;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    act(() => setPreviewMode('split'));
    expect(container.textContent).toBe('split');
    act(() => root.unmount());
  });

  it('follows the preview mode and keeps it in storage', () => {
    const api = piletApi('pilet-a');
    const modes: Array<string> = [];
    api.subscribeSharedState((state) => state.viewMode, (mode) => modes.push(mode));
    setPreviewMode('preview');
    expect(modes).toEqual(['preview']);
    expect(window.localStorage.getItem(previewModeStorageKey)).toBe('preview');
  });

  it('keeps the latest record until it is disposed, then restores the one below', () => {
    const api = piletApi('pilet-a');
    const read = () => context.readState((state) => state.currentRecord.current);
    const disposePage = api.setCurrentRecord({ recordClass: 'Page', id: 1 });
    const disposeBlock = api.setCurrentRecord({ recordClass: 'Block', id: 2 });
    expect(read()).toEqual({ recordClass: 'Block', id: 2 });
    disposePage();
    expect(read()).toEqual({ recordClass: 'Block', id: 2 });
    disposeBlock();
    expect(read()).toBeNull();
  });

  it("clears what an unloaded pilet set and drops its subscriptions, leaving other pilets' alone", () => {
    const first = piletApi('pilet-a');
    const second = piletApi('pilet-b');
    const firstCalls: Array<unknown> = [];
    const secondCalls: Array<unknown> = [];
    first.subscribeSharedState((state) => state.unsavedChanges, (value) => firstCalls.push(value));
    second.subscribeSharedState((state) => state.unsavedChanges, (value) => secondCalls.push(value));
    second.setCurrentRecord({ recordClass: 'Page', id: 4 });
    first.setCurrentRecord({ recordClass: 'Page', id: 5 });

    unload('pilet-a');
    expect(context.readState((state) => state.currentRecord.current)).toEqual({ recordClass: 'Page', id: 4 });

    second.setUnsavedChanges('form', true);
    expect(firstCalls).toEqual([]);
    expect(secondCalls).toEqual([true]);
  });
});

afterEach(() => {
  resetPreviewMode();
});
