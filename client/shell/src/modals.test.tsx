// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { PiletApi, PiletMetadata } from 'piral-base';
import { StateContext } from 'piral-core';
import type { GlobalState } from 'piral-core';
import { removePilet } from 'piral-core/lib/actions/app';
import { Modals } from 'piral-modals';
import type { ModalComponentProps } from 'piral-modals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createShellModalsApi } from './modals';
import type { ShellModalsApi } from './modals';
import { fakeGlobalContext } from './test/fakeGlobalContext';
import type { FakeGlobalContext } from './test/fakeGlobalContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let context: FakeGlobalContext;
let extend: (api: PiletApi, meta: PiletMetadata) => Partial<PiletApi>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  // Piral's createInstance needs its build-time codegen, so the plugin runs on the fake context
  context = fakeGlobalContext({
    modules: [],
    app: { wrap: false },
    components: {},
    registry: { extensions: {}, wrappers: {} },
  } as unknown as Partial<GlobalState>);
  const withActions = context as unknown as Record<string, unknown> & { defineActions: (actions: object) => void };
  withActions.converters = {};
  withActions.defineActions = (actions) => {
    Object.entries(actions).forEach(([name, action]) => {
      withActions[name] = (...args: Array<unknown>) => action(context, ...args);
    });
  };
  extend = createShellModalsApi()(context) as unknown as typeof extend;
  act(() =>
    root.render(
      <StateContext.Provider value={context}>
        <button type="button">Opener</button>
        <Modals />
      </StateContext.Provider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function pilet(name: string): PiletApi {
  const meta = { name } as PiletMetadata;
  const api = { meta } as unknown as PiletApi;
  return Object.assign(api, extend(api, meta));
}

const Confirm = ({ onClose, options, piral }: ModalComponentProps<{ subject: string }>) => {
  (piral as unknown as ShellModalsApi).useModalFrame({
    footer: (
      <button type="button" onClick={onClose}>
        Done
      </button>
    ),
  });
  return <p className="confirm-body">{options?.subject}</p>;
};

const dialog = () => container.querySelector('dialog');

describe('named modals', () => {
  it('opens a modal another pilet registered, in the shell Dialog with its layout header and frame footer', () => {
    act(() => {
      pilet('owner').registerModal('ConfirmModal', Confirm, undefined, { header: 'Confirm' });
    });
    act(() => {
      pilet('caller').showModal('ConfirmModal', { subject: 'Archive' });
    });
    expect(dialog()?.classList.contains('admin-dialog')).toBe(true);
    expect(dialog()?.querySelector('.admin-dialog__title')?.textContent).toBe('Confirm');
    expect(dialog()?.querySelector('.confirm-body')?.textContent).toBe('Archive');
    expect(dialog()?.querySelector('.admin-dialog__actions button')?.textContent).toBe('Done');
  });

  it('closes from the returned handle', () => {
    act(() => {
      pilet('owner').registerModal('ConfirmModal', Confirm);
    });
    let close = () => undefined as void;
    act(() => {
      close = pilet('caller').showModal('ConfirmModal');
    });
    act(() => close());
    expect(dialog()).toBeNull();
  });

  it('drops the modal when its pilet unloads', () => {
    act(() => {
      pilet('owner').registerModal('ConfirmModal', Confirm);
    });
    act(() => {
      pilet('caller').showModal('ConfirmModal');
    });
    expect(dialog()).not.toBeNull();
    act(() => {
      void removePilet(context, 'owner');
    });
    expect(dialog()).toBeNull();
    act(() => {
      pilet('caller').showModal('ConfirmModal');
    });
    expect(dialog()).toBeNull();
  });

  it('focuses the heading for focusHeading, and returns focus to the opener on Escape', () => {
    const opener = container.querySelector<HTMLButtonElement>('button')!;
    act(() => {
      pilet('owner').registerModal('ConfirmModal', Confirm, undefined, { header: 'Confirm', focusHeading: true });
    });
    act(() => opener.focus());
    act(() => {
      pilet('caller').showModal('ConfirmModal');
    });
    expect(document.activeElement).toBe(dialog()?.querySelector('.admin-dialog__title'));
    act(() => {
      dialog()!.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
