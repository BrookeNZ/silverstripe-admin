// @vitest-environment happy-dom
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { EditIcon } from './icons';
import { placeLayer } from './anchoredLayer';
import { Menu, Popover } from './Popover';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(element));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const trigger = () => container.querySelector<HTMLButtonElement>('#options')!;
const panel = () => container.querySelector<HTMLElement>('#options_Popover')!;
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  });

const ActionsMenu = ({ onPublish }: { onPublish?: () => void }) => (
  <Menu id="options" label="More options for Quote">
    <Button onClick={onPublish}>Publish</Button>
    <Button>Duplicate</Button>
    <Button>Archive</Button>
  </Menu>
);

describe('Popover and Menu', () => {
  it('opens the panel in the top layer, lined up with the button end and below by default', () => {
    render(<ActionsMenu />);
    expect(panel().getAttribute('popover')).toBe('manual');
    expect(panel().dataset.align).toBe('end');
    expect(panel().dataset.placement).toBe('bottom');
    expect(panel().hidden).toBe(true);
    expect(trigger().textContent).toBe('More options for Quote');
  });

  it('takes start alignment and top placement for a group', () => {
    render(
      <Popover id="options" label="Settings" align="start" placement="top">
        <p>Fields</p>
      </Popover>,
    );
    expect(panel().dataset.align).toBe('start');
    expect(panel().dataset.placement).toBe('top');
    expect(panel().getAttribute('role')).toBe('group');
  });

  it('draws a titled menu icon and caret hidden from assistive technology, leaving the title as its name', () => {
    render(
      <Menu id="options" label="View: Edit mode" title="Edit mode" icon={<EditIcon />}>
        <Button>Split mode</Button>
      </Menu>,
    );
    const icons = Array.from(trigger().querySelectorAll('svg'));
    expect(icons).toHaveLength(2);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(trigger().firstElementChild).toBe(icons[0]);
    expect(trigger().getAttribute('aria-label')).toBeNull();
    expect(trigger().textContent).toBe('Edit mode');
  });

  it('draws the given icon on an untitled menu in place of the options icon, named by its label', () => {
    render(
      <Menu id="options" label="Help" icon={<EditIcon className="given-icon" />}>
        <Button>Docs</Button>
      </Menu>,
    );
    const icons = Array.from(trigger().querySelectorAll('svg'));
    expect(icons).toHaveLength(1);
    expect(icons[0].classList.contains('given-icon')).toBe(true);
    expect(icons[0].getAttribute('aria-hidden')).toBe('true');
    expect(trigger().classList.contains('admin-button--icon-only')).toBe(true);
    expect(trigger().querySelector('.admin-button__label--hidden')?.textContent).toBe('Help');
  });

  it('keeps the options icon on an untitled menu without an icon', () => {
    render(<ActionsMenu />);
    const untitled = trigger().querySelector('svg')!.innerHTML;
    act(() =>
      root.render(
        <Menu id="options" label="More options for Quote" icon={<EditIcon />}>
          <Button>Publish</Button>
        </Menu>,
      ),
    );
    expect(trigger().querySelectorAll('svg')).toHaveLength(1);
    expect(trigger().querySelector('svg')!.innerHTML).not.toBe(untitled);
  });

  it('passes variant to the trigger, defaulting a titled menu to secondary', () => {
    render(
      <Menu id="options" label="View: Edit mode" title="Edit mode" variant="tertiary">
        <Button>Split mode</Button>
      </Menu>,
    );
    expect(trigger().classList.contains('admin-button--tertiary')).toBe(true);
    act(() =>
      root.render(
        <Menu id="options" label="View: Edit mode" title="Edit mode">
          <Button>Split mode</Button>
        </Menu>,
      ),
    );
    expect(trigger().classList.contains('admin-button--tertiary')).toBe(false);
  });

  it('opens a menu on the first item and moves with the arrow, Home and End keys', () => {
    render(<ActionsMenu />);
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    act(() => trigger().click());
    expect(panel().hidden).toBe(false);
    expect(panel().getAttribute('role')).toBe('menu');
    const items = Array.from(panel().querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((item) => [item.textContent, item.tabIndex])).toEqual([
      ['Publish', -1],
      ['Duplicate', -1],
      ['Archive', -1],
    ]);
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1], 'End');
    expect(document.activeElement).toBe(items[2]);
    key(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    key(items[2], 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('closes on Escape and returns focus to the button', () => {
    render(<ActionsMenu />);
    act(() => trigger().click());
    key(document.activeElement!, 'Escape');
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('runs an item, then closes and returns focus to the button', () => {
    const onPublish = vi.fn();
    render(<ActionsMenu onPublish={onPublish} />);
    act(() => trigger().click());
    act(() => (document.activeElement as HTMLElement).click());
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a pointer press outside', () => {
    render(<ActionsMenu />);
    act(() => trigger().click());
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(panel().hidden).toBe(true);
  });

  it('leaves buttons outside a menu as plain buttons', () => {
    render(<Button>Save</Button>);
    expect(container.querySelector('button')?.hasAttribute('role')).toBe(false);
  });
});

describe('placeLayer', () => {
  const anchor = { top: 100, bottom: 130, left: 400, right: 430, width: 30, height: 30 } as DOMRect;
  const layer = { width: 240, height: 160 };
  const viewport = { width: 1200, height: 1000 };

  it('puts an end-aligned panel under the button with its right edge on the button right edge', () => {
    expect(placeLayer(anchor, layer, 4, viewport, 'end', 'bottom')).toEqual({ top: 130, left: 190, placement: 'bottom' });
  });

  it('puts a start-aligned top panel above the button, clear of the gap', () => {
    expect(placeLayer({ ...anchor, top: 500, bottom: 530 } as DOMRect, layer, 4, viewport, 'start', 'top')).toEqual({ top: 332, left: 400, placement: 'top' });
  });

  it('flips to the side with room', () => {
    expect(placeLayer({ ...anchor, top: 900, bottom: 930 } as DOMRect, layer, 4, viewport, 'start', 'bottom').placement).toBe('top');
    expect(placeLayer(anchor, layer, 4, viewport, 'start', 'top').placement).toBe('bottom');
  });

  it('keeps the panel inside the viewport horizontally', () => {
    expect(placeLayer({ ...anchor, left: 10, right: 40 } as DOMRect, layer, 4, viewport, 'end', 'bottom').left).toBe(0);
    expect(placeLayer({ ...anchor, left: 1100, right: 1130 } as DOMRect, layer, 4, viewport, 'start', 'bottom').left).toBe(960);
  });
});

describe('useAnchoredLayer', () => {
  const observers: Array<{ callback: ResizeObserverCallback; targets: Array<Element>; disconnected: boolean }> = [];

  class FakeResizeObserver {
    private entry: (typeof observers)[number];

    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, targets: [], disconnected: false };
      observers.push(this.entry);
    }

    observe(target: Element) {
      this.entry.targets.push(target);
    }

    unobserve() {}

    disconnect() {
      this.entry.disconnected = true;
    }
  }

  afterEach(() => {
    observers.length = 0;
    vi.unstubAllGlobals();
  });

  it('re-places the panel when the panel or the button changes size, and stops watching once closed', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    render(
      <Menu id="options" label="More options" placement="top">
        <Button>Publish</Button>
      </Menu>,
    );
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue({ top: 500, bottom: 530, left: 400, right: 430, width: 30, height: 30 } as DOMRect);
    const size = vi.spyOn(panel(), 'getBoundingClientRect').mockReturnValue({ width: 240, height: 100 } as DOMRect);
    act(() => trigger().click());
    expect(panel().style.getPropertyValue('--admin-anchor-top')).toBe('400px');

    const [observer] = observers;
    expect(observer.targets).toEqual([panel(), trigger()]);
    size.mockReturnValue({ width: 240, height: 200 } as DOMRect);
    act(() => observer.callback([], observer as unknown as ResizeObserver));
    expect(panel().style.getPropertyValue('--admin-anchor-top')).toBe('300px');

    act(() => trigger().click());
    expect(observer.disconnected).toBe(true);
  });
});
