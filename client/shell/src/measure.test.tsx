// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useMeasuredHeight } from './measure';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const token = '--test-offset';

const Measured = ({ height }: { height: number }) => {
  const measure = useMeasuredHeight<HTMLDivElement>(token);
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        node.getBoundingClientRect = () => ({ height }) as DOMRect;
      }
      measure(node);
    },
    [measure, height],
  );
  return <div ref={ref} />;
};

let root: Root;
let container: HTMLDivElement;

function render(element: React.ReactElement) {
  act(() => root.render(element));
}

const published = () => document.documentElement.style.getPropertyValue(token);

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useMeasuredHeight', () => {
  it('publishes the tallest measured element and removes the token when none is left', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    render(<Measured height={61} />);
    expect(published()).toBe('61px');
    render(
      <>
        <Measured height={61} />
        <Measured height={104} />
      </>,
    );
    expect(published()).toBe('104px');
    render(<Measured height={61} />);
    expect(published()).toBe('61px');
    render(<></>);
    expect(published()).toBe('');
  });
});
