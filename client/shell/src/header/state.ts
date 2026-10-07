/**
 * The section header's content, held in Piral global state and set by whichever page is showing (a
 * pilet through `setSectionHeader`, the shell's own pages through `useSectionHeaderEffect`). Headers
 * stack: the newest set is the one drawn, and disposing one removes only that entry, so a nested page
 * or a page unmounting after the next one has set its header restores whatever is still set below it.
 * Unloading a pilet removes the headers it owns.
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

export interface SectionHeaderCrumb {
  label: string;
  /** A router path, as for react-router's Link */
  to: string;
}

export interface SectionHeader {
  /** Rendered as the page's h1 */
  title: string;
  /** The page's ancestors, nearest last, drawn as a breadcrumb above the title; the page itself is the title only */
  crumbs?: Array<SectionHeaderCrumb>;
  /** The document title's first part when it should differ from the h1; the title otherwise */
  documentTitle?: string;
  /** A router path; the last crumb's when not given, and no back button without either */
  backTo?: string;
  /** The back button's accessible name; "Back", or "Back to <last crumb>" when back goes there */
  backLabel?: string;
  views?: Array<SectionHeaderView>;
}

export interface SectionHeaderEntry {
  header: Readonly<SectionHeader>;
  id: number;
  /** The pilet (or "shell") that set the header */
  owner: string;
}

export interface SectionHeaderState {
  /** The header drawn: the last entry's */
  current: Readonly<SectionHeader> | null;
  /** Oldest first */
  entries: ReadonlyArray<SectionHeaderEntry>;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomState {
    sectionHeader: SectionHeaderState;
  }
}

export const initialSectionHeader: SectionHeaderState = { current: null, entries: [] };

let lastId = 0;

function withEntries(context: GlobalStateContext, update: (entries: ReadonlyArray<SectionHeaderEntry>) => ReadonlyArray<SectionHeaderEntry>) {
  context.dispatch((state) => {
    const entries = update(state.sectionHeader.entries);
    return { ...state, sectionHeader: { current: entries[entries.length - 1]?.header ?? null, entries } };
  });
}

export function currentSectionHeader(state: SectionHeaderState): SectionHeaderEntry | null {
  return state.entries[state.entries.length - 1] ?? null;
}

export function setSectionHeader(context: GlobalStateContext, owner: string, header: SectionHeader): Disposable {
  const id = ++lastId;
  withEntries(context, (entries) => [...entries, { header, id, owner }]);
  return () => {
    if (context.readState((state) => state.sectionHeader.entries.some((entry) => entry.id === id))) {
      withEntries(context, (entries) => entries.filter((entry) => entry.id !== id));
    }
  };
}

export function clearSectionHeaderOf(context: GlobalStateContext, owner: string): void {
  if (context.readState((state) => state.sectionHeader.entries.some((entry) => entry.owner === owner))) {
    withEntries(context, (entries) => entries.filter((entry) => entry.owner !== owner));
  }
}

export function useSectionHeader(): SectionHeaderEntry | null {
  return useGlobalState((state) => currentSectionHeader(state.sectionHeader));
}

/** Sets the header for as long as the calling component is mounted; a changed header replaces it */
export function useSectionHeaderEffect(header: SectionHeader | null, owner: string): void {
  const context = useGlobalStateContext();
  const key = JSON.stringify(header);
  React.useEffect(() => (header ? setSectionHeader(context, owner, header) : undefined), [context, owner, key]);
}
