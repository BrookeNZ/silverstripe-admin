// @vitest-environment happy-dom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Stack } from './Stack';
import { mount } from './test/render';



describe('Stack', () => {
  it('renders a div with only the block class by default', () => {
    const stack = mount(
      <Stack>
        <span>One</span>
        <span>Two</span>
      </Stack>,
    );
    expect(stack.tagName).toBe('DIV');
    expect(stack.className).toBe('admin-stack');
    expect(stack.children).toHaveLength(2);
  });

  it('adds no modifier for a prop given its default value', () => {
    const stack = mount(<Stack direction="column" align="stretch" justify="start" wrap />);
    expect(stack.className).toBe('admin-stack');
  });

  it.each([
    [{ direction: 'row' as const }, 'admin-stack--row'],
    [{ align: 'start' as const }, 'admin-stack--align-start'],
    [{ align: 'center' as const }, 'admin-stack--align-center'],
    [{ align: 'end' as const }, 'admin-stack--align-end'],
    [{ justify: 'center' as const }, 'admin-stack--justify-center'],
    [{ justify: 'end' as const }, 'admin-stack--justify-end'],
    [{ justify: 'between' as const }, 'admin-stack--justify-between'],
    [{ justify: 'around' as const }, 'admin-stack--justify-around'],
    [{ spacing: 'xs' as const }, 'admin-stack--gap-xs'],
    [{ spacing: 'md' as const }, 'admin-stack--gap-md'],
    [{ spacing: 'xxl' as const }, 'admin-stack--gap-xxl'],
    [{ wrap: false }, 'admin-stack--nowrap'],
  ])('maps %o to one modifier', (props, modifier) => {
    expect(mount(<Stack {...props} />).className).toBe(`admin-stack ${modifier}`);
  });

  it('composes modifiers in a fixed order with the host class last', () => {
    const stack = mount(<Stack className="host" wrap={false} spacing="sm" justify="end" align="center" direction="row" />);
    expect(stack.className).toBe('admin-stack admin-stack--row admin-stack--align-center admin-stack--justify-end admin-stack--gap-sm admin-stack--nowrap host');
  });

  it('renders as the given element with its attributes passed through', () => {
    const stack = mount(
      <Stack as="ul" spacing="sm" aria-label="Files" data-test="x">
        <li>One</li>
      </Stack>,
    );
    expect(stack.tagName).toBe('UL');
    expect(stack.getAttribute('aria-label')).toBe('Files');
    expect(stack.dataset.test).toBe('x');
    expect(stack.querySelector('li')?.textContent).toBe('One');
  });

  it('forwards its ref to the rendered element', () => {
    const ref = React.createRef<HTMLElement>();
    const stack = mount(<Stack as="fieldset" ref={ref} />);
    expect(ref.current).toBe(stack);
    expect(ref.current?.tagName).toBe('FIELDSET');
  });
});
