// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TabStrip } from './TabStrip';
import { Tabs } from './structure';
import type { FieldDescriptor, FieldProps } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

function render(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
  return container.firstElementChild as HTMLElement;
}

afterEach(() => container.remove());

describe('TabStrip', () => {
  it('renders link items as anchors and marks the current one', () => {
    const list = render(
      <TabStrip
        items={[
          { key: 'content', label: 'Content', href: '/content', current: true },
          { key: 'settings', label: 'Settings', href: '/settings' },
        ]}
      />,
    );
    expect(list.tagName).toBe('UL');
    expect(list.className).toBe('admin-tab-strip');
    const links = list.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/content');
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[0].className).toBe('admin-tab-strip__tab admin-tab-strip__tab--current');
    expect(links[1].hasAttribute('aria-current')).toBe(false);
    expect(links[1].className).toBe('admin-tab-strip__tab');
    expect(list.querySelector('li')?.hasAttribute('role')).toBe(false);
  });

  it('renders links through renderLink when given one', () => {
    const list = render(
      <TabStrip
        items={[{ key: 'a', label: 'A', href: '/a', current: true }]}
        renderLink={({ href, ...link }) => <a {...link} href={`/admin${href}`} data-router="yes" />}
      />,
    );
    const link = list.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/a');
    expect(link.dataset.router).toBe('yes');
    expect(link.className).toBe('admin-tab-strip__tab admin-tab-strip__tab--current');
  });

  it('renders other items as buttons with their props, and presentational items under a role', () => {
    const list = render(
      <TabStrip
        role="tablist"
        items={[
          { key: 'a', label: 'A', current: true, buttonProps: { role: 'tab', 'aria-selected': true, id: 'a_tab' } },
          { key: 'b', label: 'B', buttonProps: { role: 'tab', 'aria-selected': false } },
        ]}
      />,
    );
    expect(list.getAttribute('role')).toBe('tablist');
    const buttons = list.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('type')).toBe('button');
    expect(buttons[0].getAttribute('role')).toBe('tab');
    expect(buttons[0].id).toBe('a_tab');
    expect(buttons[0].className).toBe('admin-tab-strip__tab admin-tab-strip__tab--current');
    expect(buttons[1].className).toBe('admin-tab-strip__tab');
    expect(list.querySelector('a')).toBeNull();
    list.querySelectorAll('li').forEach((item) => expect(item.getAttribute('role')).toBe('presentation'));
  });
});

describe('Tabs', () => {
  const tab = (id: string, title: string): FieldDescriptor => ({ id, name: id, title, children: [] }) as unknown as FieldDescriptor;
  const field = { id: 'Root', name: 'Root', title: '', children: [tab('Main', 'Main'), tab('Seo', 'SEO'), tab('Hero', 'Hero')] } as unknown as FieldDescriptor;
  const props = { field, renderFields: () => null } as unknown as FieldProps;

  it('draws the tablist through the tab strip and moves selection with the arrow keys', () => {
    const root = render(<Tabs {...props} />);
    const list = root.querySelector('[role="tablist"]') as HTMLElement;
    expect(list.className).toBe('admin-tab-strip admin-tab-strip--lined');
    const tabs = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs().map((button) => button.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs()[0].getAttribute('aria-controls')).toMatch(/Main$/);
    expect(tabs()[0].className).toBe('admin-tab-strip__tab admin-tab-strip__tab--current');

    act(() => {
      tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(tabs().map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1].className).toBe('admin-tab-strip__tab admin-tab-strip__tab--current');
    const panel = (index: number) => document.getElementById(tabs()[index].getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(panel(1).hidden).toBe(false);
    expect(panel(0).hidden).toBe(true);

    act(() => {
      tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it('labels each panel by its own tab when two tab sets share schema ids, as a block form inside the page form does', () => {
    const pageField = { ...field, children: [tab('Root_Main', 'Main content')] } as unknown as FieldDescriptor;
    const blockField = { ...field, children: [tab('Root_Main', 'Content')] } as unknown as FieldDescriptor;
    render(
      <div>
        <Tabs {...props} field={pageField} />
        <Tabs {...props} field={blockField} />
      </div>,
    );
    const names = Array.from(container.querySelectorAll('[role="tabpanel"]')).map(
      (panel) => document.getElementById(panel.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(names).toEqual(['Main content', 'Content']);
  });
});
