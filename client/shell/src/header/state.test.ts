import { describe, expect, it } from 'vitest';
import type { GlobalStateContext } from 'piral-core';
import { fakeGlobalContext } from '../test/fakeGlobalContext';
import { clearSectionHeaderOf, setSectionHeader } from './state';

const current = (context: GlobalStateContext) => context.readState((state) => state.sectionHeader.current);

describe('section header state', () => {
  it('sets the header and clears it on dispose', () => {
    const context = fakeGlobalContext();
    const dispose = setSectionHeader(context, 'shell', { title: 'Security', backTo: '/security/' });
    expect(current(context)).toEqual({ title: 'Security', backTo: '/security/' });
    dispose();
    expect(current(context)).toBeNull();
  });

  it('replaces the header, and an earlier disposer leaves the replacement alone', () => {
    const context = fakeGlobalContext();
    const disposeFirst = setSectionHeader(context, 'shell', { title: 'Security' });
    const disposeSecond = setSectionHeader(context, 'silverstripe-cms-pages', { title: 'Home' });
    expect(current(context)?.title).toBe('Home');
    disposeFirst();
    expect(current(context)?.title).toBe('Home');
    disposeSecond();
    expect(current(context)).toBeNull();
  });

  it('restores the header below when a later one is disposed', () => {
    const context = fakeGlobalContext();
    setSectionHeader(context, 'shell', { title: 'Security' });
    const disposeRecord = setSectionHeader(context, 'shell', { title: 'Admin' });
    expect(current(context)?.title).toBe('Admin');
    disposeRecord();
    expect(current(context)?.title).toBe('Security');
  });

  it('disposes only once', () => {
    const context = fakeGlobalContext();
    const dispose = setSectionHeader(context, 'shell', { title: 'Security' });
    setSectionHeader(context, 'shell', { title: 'Groups' });
    dispose();
    dispose();
    expect(context.readState((state) => state.sectionHeader.entries.map((entry) => entry.header.title))).toEqual(['Groups']);
  });

  it('clears the header only for the pilet that owns it', () => {
    const context = fakeGlobalContext();
    setSectionHeader(context, 'shell', { title: 'Pages' });
    setSectionHeader(context, 'silverstripe-cms-pages', { title: 'Home' });
    clearSectionHeaderOf(context, 'hello');
    expect(current(context)?.title).toBe('Home');
    clearSectionHeaderOf(context, 'silverstripe-cms-pages');
    expect(current(context)?.title).toBe('Pages');
  });

  it('keeps a disposer from clearing a header set after the owner was unloaded', () => {
    const context = fakeGlobalContext();
    const dispose = setSectionHeader(context, 'hello', { title: 'Hello' });
    clearSectionHeaderOf(context, 'hello');
    setSectionHeader(context, 'shell', { title: 'Settings' });
    dispose();
    expect(current(context)?.title).toBe('Settings');
  });
});
