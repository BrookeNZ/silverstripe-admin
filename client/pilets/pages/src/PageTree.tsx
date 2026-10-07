/**
 * The page tree: headless-tree for the WAI-ARIA tree pattern (roles, levels, roving focus, arrow keys,
 * Home and End) over a flat list of the visible rows, virtualised with @tanstack/react-virtual so only
 * the rows in view are in the DOM. Being flat, the rows carry `aria-level`, `aria-setsize` and
 * `aria-posinset` instead of nesting in `role="group"` elements.
 *
 * Activating a page row (click or Enter) asks the section to navigate; the expander arrow and Left and
 * Right open and close nodes, so selecting a page never toggles it. The current page comes from the
 * route, is marked `aria-selected`, and is opened to and scrolled into view when it changes.
 *
 * Given a `mover`, pages drag to a new place: by the handle on the current page's row (Figma 2:3552), or
 * from the keyboard on any focused row with Control+Shift+D, then the arrow keys, Enter to drop and Escape
 * to cancel, announced through a status region. A drop is offered only where move.ts's rules allow it, and
 * between siblings only when the parent's children are all loaded, since the server renumbers the siblings
 * it is sent. The row moves at once and goes back if the server refuses.
 */
import * as React from 'react';
import {
  AssistiveDndState,
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core';
import type { DragTarget, ItemInstance, TreeInstance } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CollapsedIcon, ExpandedIcon, PageTypeIcon, ReorderIcon } from '@silverstripe/admin-patterns';
import type { PageNode } from './api';
import { canDragPage, canDropPage, movePage } from './move';
import type { MoveApi, MoveHints, MoveSteps } from './move';
import { childItemIds, entryFor, entryName, pageItemId, rootItemId } from './treeEntries';
import type { TreeEntry } from './treeEntries';
import './PageTree.css';
import { rootId } from './treeStore';
import type { TreeStore } from './treeStore';

export interface PageTreeMover {
  client: MoveApi;
  notify: MoveSteps['notify'];
}

export interface PageTreeProps {
  store: TreeStore;
  currentId: number | null;
  onSelect(id: number): void;
  onRevealError?(error: unknown): void;
  hidden?: boolean;
  /** Without one, pages cannot be dragged */
  mover?: PageTreeMover;
  dragDisabled?: boolean;
  /** Drawn at the start of each page row, before the expander */
  rowStart?(node: PageNode): React.ReactNode;
}

const typeaheadResetMs = 500;

// Rows are measured once rendered; this only sizes the scrollbar before then
const rowEstimatePx = 30;

// The design tints a page with unpublished changes; other flags keep the plain row
const changedFlagKeys = new Set(['addedtodraft', 'modified']);

// Must match --pages-tree-indent in PageTree.css, in px; headless-tree reads it to place a drop by the pointer
const indentPx = 20;

function pageOf(item: ItemInstance<TreeEntry> | undefined): PageNode | null {
  const entry = item?.getItemData();
  return entry?.kind === 'page' ? entry.node : null;
}

/** The page a drop lands under, null for the top level, or undefined for a row that holds no pages */
function dropParent(target: DragTarget<TreeEntry>): PageNode | null | undefined {
  const entry = target.item.getItemData();
  if (entry?.kind === 'root') {
    return null;
  }
  return entry?.kind === 'page' ? entry.node : undefined;
}

function isBetweenRows(target: DragTarget<TreeEntry>): target is Extract<DragTarget<TreeEntry>, { childIndex: number }> {
  return 'childIndex' in target;
}

function describeTarget(target: DragTarget<TreeEntry> | null | undefined): string {
  if (!target) {
    return '';
  }
  const parent = dropParent(target);
  if (!isBetweenRows(target)) {
    return parent ? `Inside ${parent.title}` : 'At the end of the top level';
  }
  const place = `Position ${target.insertionIndex + 1}`;
  return parent ? `${place} under ${parent.title}` : `${place} at the top level`;
}

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

interface TreeRowContentProps {
  item: ItemInstance<TreeEntry>;
  showHandle: boolean;
  rowStart?: PageTreeProps['rowStart'];
}

const TreeRowContent = ({ item, showHandle, rowStart }: TreeRowContentProps) => {
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
      {rowStart?.(entry.node)}
      <span className="pages-tree__toggle" aria-hidden="true" onClick={item.isFolder() ? toggle : undefined}>
        {item.isFolder() && (item.isExpanded() ? <ExpandedIcon /> : <CollapsedIcon />)}
      </span>
      <span className="pages-tree__label">
        <span className="pages-tree__icons">
          {showHandle && (
            <span {...item.getDragHandleProps()} className="pages-tree__handle" aria-hidden="true" title="Drag to move">
              <ReorderIcon />
            </span>
          )}
          <PageTypeIcon className="pages-tree__icon" />
        </span>
        <span className="pages-tree__text">
          <span className="pages-tree__title">{entry.node.title}</span>
          {entry.node.statusFlags.map((flag) => (
            <span className="pages-tree__flag" key={flag.key} title={flag.title ?? undefined}>
              {flag.text}
            </span>
          ))}
        </span>
      </span>
    </>
  );
};

export const PageTree = ({
  store,
  currentId,
  onSelect,
  onRevealError,
  hidden,
  mover,
  dragDisabled,
  rowStart,
}: PageTreeProps) => {
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

  const [hints, setHints] = React.useState<MoveHints | null>(null);
  React.useEffect(() => {
    setHints(null);
    if (!mover) {
      return undefined;
    }
    let cancelled = false;
    mover.client
      .hints()
      .then((loaded) => !cancelled && setHints(loaded))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mover?.client]);
  const dragEnabled = Boolean(mover && hints?.canOrganise) && !dragDisabled;
  const moverRef = React.useRef(mover);
  moverRef.current = mover;

  const canDrag = (items: Array<ItemInstance<TreeEntry>>) => {
    const node = pageOf(items[0]);
    return dragEnabled && items.length === 1 && node !== null && canDragPage(hints, node);
  };

  const canDrop = (items: Array<ItemInstance<TreeEntry>>, target: DragTarget<TreeEntry>) => {
    const node = pageOf(items[0]);
    const parent = dropParent(target);
    if (!node || parent === undefined) {
      return false;
    }
    if (isBetweenRows(target)) {
      const parentId = parent?.id ?? rootId;
      const list = store.children(parentId);
      if (!store.isLoaded(parentId) || store.hasMore(parentId) || list.error || target.childIndex > list.ids.length) {
        return false;
      }
    }
    return canDropPage(hints, node, parent);
  };

  const drop = async (items: Array<ItemInstance<TreeEntry>>, target: DragTarget<TreeEntry>) => {
    const node = pageOf(items[0]);
    const parent = dropParent(target);
    const current = moverRef.current;
    if (!node || parent === undefined || !current) {
      return;
    }
    const parentId = parent?.id ?? rootId;
    const others = store.children(parentId).ids.filter((id) => id !== node.id);
    if (!isBetweenRows(target)) {
      await movePage({ ...current, store }, { id: node.id, parentId }, others.length);
      return;
    }
    const siblingIds = [...others];
    siblingIds.splice(target.insertionIndex, 0, node.id);
    const unchanged = node.parentId === parentId && store.children(parentId).ids.every((id, index) => siblingIds[index] === id);
    if (!unchanged) {
      await movePage({ ...current, store }, { id: node.id, parentId, siblingIds }, target.insertionIndex);
    }
  };

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
    seperateDragHandle: true,
    indent: indentPx,
    canDrag,
    canDrop,
    onDrop: drop,
    features: [syncDataLoaderFeature, hotkeysCoreFeature, dragAndDropFeature, keyboardDragAndDropFeature],
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
  // The sidebar scrolls as one panel, so the virtualiser measures from the tree's offset inside it
  const [scrollMargin, setScrollMargin] = React.useState(0);
  React.useLayoutEffect(() => {
    const tree = scrollRef.current;
    const pane = tree?.parentElement;
    if (!tree || !pane) {
      return;
    }
    setScrollMargin(tree.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop);
  });
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current?.parentElement ?? null,
    scrollMargin,
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
          onRevealErrorRef.current?.(error);
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

  const dnd = tree.getState().dnd;
  const draggedId = dnd?.draggedItems?.[0]?.getId();
  const dragLine = dnd ? tree.getDragLineData() : null;
  const assistive = tree.getState().assistiveDndState;
  const announcement =
    assistive === AssistiveDndState.Started
      ? `Moving ${pageOf(dnd?.draggedItems?.[0])?.title ?? 'page'}. Arrow keys choose where, Enter drops, Escape cancels. ${describeTarget(dnd?.dragTarget)}`
      : assistive === AssistiveDndState.Dragging
        ? describeTarget(dnd?.dragTarget)
        : '';

  return (
    <>
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
            const changed = entry?.kind === 'page' && entry.node.statusFlags.some((flag) => changedFlagKeys.has(flag.key));
            const className = [
              'pages-tree__item',
              current && 'pages-tree__item--current',
              changed && 'pages-tree__item--changed',
              item.isUnorderedDragTarget() && 'pages-tree__item--drop-target',
              item.getId() === draggedId && 'pages-tree__item--dragged',
            ]
              .filter(Boolean)
              .join(' ');
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
                className={className}
                style={
                  {
                    '--pages-tree-item-level': item.getItemMeta().level,
                    '--pages-tree-item-start': `${row.start - scrollMargin}px`,
                  } as React.CSSProperties
                }
                onClick={() => {
                  item.setFocused();
                  item.primaryAction();
                }}
              >
                <TreeRowContent
                  item={item}
                  showHandle={current && entry.kind === 'page' && dragEnabled && canDragPage(hints, entry.node)}
                  rowStart={rowStart}
                />
              </div>
            );
          })}
        </div>
        {dragLine && (
          <div
            className="pages-tree__drop-line"
            aria-hidden="true"
            style={
              {
                '--pages-tree-drop-line-top': `${dragLine.top}px`,
                '--pages-tree-drop-line-start': `${dragLine.left}px`,
                '--pages-tree-drop-line-width': `${dragLine.width}px`,
              } as React.CSSProperties
            }
          />
        )}
      </div>
      <div className="pages-tree__status" role="status">
        {announcement}
      </div>
    </>
  );
};
