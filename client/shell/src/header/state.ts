/**
 * The section header's content, held in Piral global state: one header at a time, set by whichever
 * page is showing (a pilet through `setSectionHeader`, the shell's own pages through
 * `useSectionHeaderEffect`). Each set gets an id, and its disposer clears the header only while that id
 * is still current, so a page unmounting after the next page has set its header leaves the new one alone.
 * Unloading a pilet clears a header it owns.
 */
import * as React from 'react';
import type { Disposable, GlobalStateContext } from 'piral-core';
import { useGlobalState, useGlobalStateContext } from 'piral-core';

export interface SectionHeaderView {
  key: string;
  label: string;
  /** A router path, as for react-router's Link */
  to: string;
  current?: boolean;
}

export interface SectionHeader {
  /** Rendered as the page's h1 */
  title: string;
  /** A router path; no back button without it */
  backTo?: string;
  /** The back button's accessible name; "Back" when not given */
  backLabel?: string;
  views?: Array<SectionHeaderView>;
}

export interface SectionHeaderState {
  current: Readonly<SectionHeader> | null;
  id: number;
  /** The pilet (or "shell") that set the current header */
  owner: string | null;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomState {
    sectionHeader: SectionHeaderState;
  }
}

export const initialSectionHeader: SectionHeaderState = { current: null, id: 0, owner: null };

let lastId = 0;

export function setSectionHeader(context: GlobalStateContext, owner: string, header: SectionHeader): Disposable {
  const id = ++lastId;
  context.dispatch((state) => ({ ...state, sectionHeader: { current: header, id, owner } }));
  return () => {
    if (context.readState((state) => state.sectionHeader.id) === id) {
      context.dispatch((state) => ({ ...state, sectionHeader: { ...initialSectionHeader, id } }));
    }
  };
}

export function clearSectionHeaderOf(context: GlobalStateContext, owner: string): void {
  if (context.readState((state) => state.sectionHeader.owner) === owner) {
    context.dispatch((state) => ({ ...state, sectionHeader: { ...initialSectionHeader, id: ++lastId } }));
  }
}

export function useSectionHeader(): Readonly<SectionHeader> | null {
  return useGlobalState((state) => state.sectionHeader.current);
}

/** Sets the header for as long as the calling component is mounted; a changed header replaces it */
export function useSectionHeaderEffect(header: SectionHeader | null, owner: string): void {
  const context = useGlobalStateContext();
  const key = JSON.stringify(header);
  React.useEffect(() => (header ? setSectionHeader(context, owner, header) : undefined), [context, owner, key]);
}
