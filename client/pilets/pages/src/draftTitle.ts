/**
 * The open page's title as last committed in its edit form, before a save: the Title field sets it and the
 * section header shows it in place of the saved title, as legacy's Title change handler relabelled the
 * page's breadcrumb. The field clears it on unmount, so a page left without saving drops back to the saved
 * title.
 */
export interface DraftTitle {
  pageId: number;
  title: string;
}

export interface DraftTitleStore {
  get: () => DraftTitle | null;
  set: (draft: DraftTitle | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createDraftTitleStore(): DraftTitleStore {
  let draft: DraftTitle | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => draft,
    set: (next) => {
      if (next?.pageId === draft?.pageId && next?.title === draft?.title) {
        return;
      }
      draft = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
