import { describe, expect, it } from 'vitest';
import type { GlobalState, GlobalStateContext } from 'piral-core';
import { clearSectionHeaderOf, initialSectionHeader, setSectionHeader } from './state';

function fakeContext(): GlobalStateContext {
  let state = { sectionHeader: initialSectionHeader } as unknown as GlobalState;
  return {
    dispatch: (update: (current: GlobalState) => GlobalState) => {
      state = update(state);
    },
    readState: <S>(select: (current: GlobalState) => S) => select(state),
  } as unknown as GlobalStateContext;
}

const current = (context: GlobalStateContext) => context.readState((state) => state.sectionHeader.current);

describe('section header state', () => {
  it('sets the header and clears it on dispose', () => {
    const context = fakeContext();
    const dispose = setSectionHeader(context, 'shell', { title: 'Security', backTo: '/security/' });
    expect(current(context)).toEqual({ title: 'Security', backTo: '/security/' });
    dispose();
    expect(current(context)).toBeNull();
  });

  it('replaces the header, and an earlier disposer leaves the replacement alone', () => {
    const context = fakeContext();
    const disposeFirst = setSectionHeader(context, 'shell', { title: 'Security' });
    const disposeSecond = setSectionHeader(context, 'silverstripe-cms-pages', { title: 'Home' });
    expect(current(context)?.title).toBe('Home');
    disposeFirst();
    expect(current(context)?.title).toBe('Home');
    disposeSecond();
    expect(current(context)).toBeNull();
  });

  it('clears the header only for the pilet that owns it', () => {
    const context = fakeContext();
    setSectionHeader(context, 'silverstripe-cms-pages', { title: 'Home' });
    clearSectionHeaderOf(context, 'hello');
    expect(current(context)?.title).toBe('Home');
    clearSectionHeaderOf(context, 'silverstripe-cms-pages');
    expect(current(context)).toBeNull();
  });

  it('keeps a disposer from clearing a header set after the owner was unloaded', () => {
    const context = fakeContext();
    const dispose = setSectionHeader(context, 'hello', { title: 'Hello' });
    clearSectionHeaderOf(context, 'hello');
    setSectionHeader(context, 'shell', { title: 'Settings' });
    dispose();
    expect(current(context)?.title).toBe('Settings');
  });
});
