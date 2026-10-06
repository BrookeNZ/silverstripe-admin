/**
 * The page tree: headless-tree for the WAI-ARIA tree pattern (roles, levels, roving focus, arrow keys,
 * Home and End) over a flat list of the visible rows, virtualised with @tanstack/react-virtual so only
 * the rows in view are in the DOM. Being flat, the rows carry `aria-level`, `aria-setsize` and
 * `aria-posinset` instead of nesting in `role="group"` elements.
 *
 * Activating a page row (click or Enter) asks the section to navigate; the expander arrow and Left and
 * Right open and close nodes, so selecting a page never toggles it. The current page comes from the
 * route, is marked `aria-selected`, and is opened to and scrolled into view when it changes.
 */
import * as React from 'react';
import { hotkeysCoreFeature, syncDataLoaderFeature } from '@headless-tree/core';
import type { ItemInstance, TreeInstance } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { childItemIds, entryFor, entryName, pageItemId, rootItemId } from './treeEntries';
import type { TreeEntry } from './treeEntries';
import './PageTree.css';
import type { TreeStore } from './treeStore';

export interface PageTreeProps {
  store: TreeStore;
  currentId: number | null;
  onSelect(id: number): void;
  onRevealError(error: unknown): void;
  hidden?: boolean;
}

const typeaheadResetMs = 500;

// Rows are measured once rendered; this only sizes the scrollbar before then
const rowEstimatePx = 32;

function useTypeahead() {
  const buffer = React.useRef({ text: '', at: 0 });
  return React.useCallback((event: KeyboardEvent, tree: TreeInstance<TreeEntry>) => {
    const now = Date.now();
    const typed = now - buffer.current.at > typeaheadResetMs ? event.key : buffer.current.text + event.key;
    buffer.current = { text: typed.toLowerCase(), at: now };
    const items = tree.getItems();
    const start = tree.getFocusedItem().getItemMeta().index;
    const searchFrom = buffer.current.text.length === 1 ? start + 1 : start;
    for (let offset = 0; offset < items.length; offset++) {
      const item = items[(searchFrom + offset) % items.length];
      const entry = item.getItemData();
      if (entry?.kind === 'page' && entry.node.title.toLowerCase().startsWith(buffer.current.text)) {
        item.setFocused();
        tree.updateDomFocus();
        return;
      }
    }
  }, []);
}

function activate(store: TreeStore, entry: TreeEntry, onSelect: (id: number) => void): void {
  switch (entry.kind) {
    case 'page':
      onSelect(entry.node.id);
      break;
    case 'more':
      void store.loadMore(entry.parentId);
      break;
    case 'error':
      void store.retry(entry.parentId);
      break;
    default:
  }
}

const TreeRowContent: React.FC<{ item: ItemInstance<TreeEntry> }> = ({ item }) => {
  const entry = item.getItemData();
  if (entry.kind !== 'page') {
    return <span className="pages-tree__note">{entryName(entry)}</span>;
  }
  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    item.setFocused();
    if (item.isExpanded()) {
      item.collapse();
    } else {
      item.expand();
    }
  };
  return (
    <>
      <span className="pages-tree__toggle" aria-hidden="true" onClick={item.isFolder() ? toggle : undefined}>
        {item.isFolder() ? (item.isExpanded() ? '▾' : '▸') : ''}
      </span>
      <span className="pages-tree__title">{entry.node.title}</span>
      {entry.node.statusFlags.map((flag) => (
        <span className="pages-tree__flag" key={flag.key} title={flag.title ?? undefined}>
          {flag.text}
        </span>
      ))}
    </>
  );
};

export const PageTree: React.FC<PageTreeProps> = ({ store, currentId, onSelect, onRevealError, hidden }) => {
  const [expandedItems, setExpandedItems] = React.useState<Array<string>>([]);
  const [focusedItem, setFocusedItem] = React.useState<string | null>(null);
  const [, rerender] = React.useReducer((count: number) => count + 1, 0);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollToIndex = React.useRef<(index: number) => void>(() => undefined);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;
  const onRevealErrorRef = React.useRef(onRevealError);
  onRevealErrorRef.current = onRevealError;
  const typeahead = useTypeahead();

  const tree = useTree<TreeEntry>({
    rootItemId,
    state: { expandedItems, focusedItem },
    setExpandedItems,
    setFocusedItem,
    getItemName: (item) => entryName(item.getItemData()),
    isItemFolder: (item) => {
      const entry = item.getItemData();
      return entry?.kind === 'page' && entry.node.hasChildren;
    },
    dataLoader: {
      getItem: (itemId) => entryFor(store, itemId),
      getChildren: (itemId) => childItemIds(store, itemId),
    },
    onPrimaryAction: (item) => activate(store, item.getItemData(), (id) => onSelectRef.current(id)),
    scrollToItem: (item) => scrollToIndex.current(item.getItemMeta().index),
    hotkeys: {
      customActivate: {
        hotkey: 'Enter',
        preventDefault: true,
        handler: (_event, instance) => instance.getFocusedItem().primaryAction(),
      },
      customTypeahead: {
        hotkey: 'LetterOrNumber',
        handler: typeahead,
      },
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  React.useEffect(
    () =>
      store.subscribe(() => {
        tree.rebuildTree();
        rerender();
      }),
    [store, tree],
  );

  const items = tree.getItems();
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimatePx,
    overscan: 10,
    getItemKey: (index) => items[index]?.getId() ?? index,
  });
  scrollToIndex.current = (index) => virtualizer.scrollToIndex(index, { align: 'auto' });

  const [revealed, setRevealed] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (currentId === null) {
      return undefined;
    }
    let cancelled = false;
    store
      .revealPath(currentId)
      .then((path) => {
        if (cancelled) {
          return;
        }
        setExpandedItems((open) => [...new Set([...open, ...path.map(pageItemId)])]);
        setRevealed(currentId);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onRevealErrorRef.current(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [store, currentId]);

  React.useEffect(() => {
    if (revealed === null) {
      return;
    }
    const index = items.findIndex((item) => item.getId() === pageItemId(revealed));
    if (index >= 0) {
      setRevealed(null);
      setFocusedItem(pageItemId(revealed));
      virtualizer.scrollToIndex(index, { align: 'center' });
    }
  });

  const { ref: registerContainer, ...containerProps } = tree.getContainerProps('Pages');
  // A new callback each render would unmount and remount the tree's key handlers between a keydown and its keyup
  const setContainer = React.useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      (registerContainer as (element: HTMLElement | null) => void)(element);
    },
    [tree],
  );

  return (
    <div {...containerProps} ref={setContainer} className="pages-tree" hidden={hidden}>
      {/* Inline custom properties carry measured positions and levels; the stylesheet does the styling */}
      <div
        className="pages-tree__canvas"
        role="presentation"
        style={{ '--pages-tree-canvas-height': `${virtualizer.getTotalSize()}px` } as React.CSSProperties}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          if (!item) {
            return null;
          }
          const { ref: registerItem, onClick: _toggleOnClick, ...itemProps } = item.getProps();
          const entry = item.getItemData();
          const current = entry?.kind === 'page' && entry.node.id === currentId;
          return (
            <div
              {...itemProps}
              key={row.key}
              ref={(element) => {
                (registerItem as (element: HTMLElement | null) => void)(element);
                virtualizer.measureElement(element);
              }}
              data-index={row.index}
              aria-selected={entry?.kind === 'page' ? current : undefined}
              className={current ? 'pages-tree__item pages-tree__item--current' : 'pages-tree__item'}
              style={
                {
                  '--pages-tree-item-level': item.getItemMeta().level,
                  '--pages-tree-item-start': `${row.start}px`,
                } as React.CSSProperties
              }
              onClick={() => {
                item.setFocused();
                item.primaryAction();
              }}
            >
              <TreeRowContent item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
