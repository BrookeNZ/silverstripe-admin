# Tree View Component

A navigation tree of hierarchical records, such as the site tree. The tree loads the children of each parent when
they are first shown. The state of each tree is kept by `treeId` for the life of the page, so a tree that mounts again
renders as the user left it, scrolled to where the user left it and then just enough to show the current item. An
element around the tree scrolls it, as for the legacy tree, and the tree keeps the scroll offset of that element. A
tree with no scrolling element around it keeps no scroll offset, but still scrolls the page to show a new current item.

The tree does not use the Redux store of the admin. The store, the reducer, the selectors and the actions of the tree
are in this folder, not in `client/src/state`.

The public API of the tree is the `TreeView` properties, the fields of an item and the signatures of `getMenuItems`,
`onMove` and `canDrop`. Every other file in this folder is internal and can change.

## Example
```js
const props = {
  treeId: 'pages',
  label: 'Site pages',
  titleRowText: 'My site',
  currentId: 6,
  fetchChildren: (parentId) => fetch(`tree/children/${parentId}`).then((response) => response.json()),
  fetchPath: (id) => fetch(`tree/path/${id}`).then((response) => response.json()),
  onOpen: (item) => loadRecord(item.id),
};
<TreeView {...props} />
```

## Properties

 * `treeId` (string, required): The key of the stored state. Trees mounted with the same `treeId` share one state,
   the current item included, so give those trees the same `currentId`.
 * `fetchChildren` (function, required): Called with a parent id, or `0` for the top level. Returns a promise of an
   array of items. When the promise rejects or the value is not an array of items, the tree shows a failed item with
   a retry. A parent whose children are loaded keeps them. A drag that stays on the row of a collapsed parent for
   500 ms expands the parent, which can call this function.
 * `fetchPath` (function): Called with an item id to reveal a current item that is not loaded yet. Returns a promise
   of the ancestor ids, top level first, without the item. The tree stores an id sent as a string as a number. After
   a failure, the tree calls it again on the next mount or reload.
 * `currentId` (number or string): The id of the current item. The tree reveals the item when the id changes.
 * `reloadKey` (number or string): The tree loads the top-level items and all the shown children again when this
   value differs from the value the tree last loaded with. A tree that mounts again with the same value does not
   reload. It still calls `fetchPath` and `fetchChildren` to reveal a new current item.
 * `onOpen` (function): Called with the item and the event on a plain click on an item that the member can view. The
   tree stops the click from following `editUrl`. Without `onOpen`, the click follows `editUrl`. The clicked item
   stays highlighted until `currentId` changes, unless the function returns `false`, or returns a promise that
   rejects or resolves to `false`. The highlight does not move `aria-current`, which follows `currentId`.
 * `onShowAsList` (function): Called with the item and the event on a plain click on the "show as list" link of an item
   with too many children to show. The tree stops the click from following `listViewUrl`. Without `onShowAsList`, the
   click follows `listViewUrl`.
 * `getMenuItems` (function): Called with an item and `{ open }` when the user asks for the context menu of the item
   with a right-click, the context menu key or Shift+F10 on its link. Returns the `items` of a `ContextMenu`, whose
   `onSelect` gets the item. `open(item, event)` opens the item as a plain click on it does, with the event the menu
   passes to `onSelect`. The tree view mounts a new menu each time it shows one, so an item with `loadItems` loads its
   submenu items each time. With no function, or no items, the browser shows its own menu. Focus goes back to the link
   after Escape, Tab, an action that does not move focus, or a dismiss while focus is in the menu. The menu closes
   when the tree no longer shows the item, for example after a reload removes the item. With `onMove`, the tree adds
   a "Move" item after the items of the function, except on an item the member cannot view or edit. The tree adds no
   "Move" when the function returns no items for the item. "Move" is disabled while a move is pending. With `onMove`,
   a long press on touch starts a drag and opens no menu.
 * `onMove` (function): Called with an item and `{ parentId, position, targetId, siblingIds }` when the user drops the
   item on the row of another item, after a drag with the mouse or by touch, or after a keyboard move. On touch, a drag
   starts after a hold of 250 ms, and a touch that moves more than 5px before then scrolls the tree. Without this
   function, items do not drag.
   `position` is `'before'`, `'after'` or `'inside'` the item `targetId`, from the top, the bottom or the middle third
   of its row. `parentId` is the new parent, or `0` for the top level. `siblingIds` is the new order of the loaded
   children of that parent, the moved item included, or `null` when those children are not loaded. A drop inside an item
   puts the moved item last and expands the item. Returns a promise. No new drag starts until the promise settles. The
   tree does not change or reload after a move, so the host changes `reloadKey` when the move is done, before or after
   the promise settles, and also when the move fails. When the first reload after the move completes, the moved item
   takes the Tab stop where the tree now shows it. Focus moves to the item only when focus is in the tree. A promise
   that resolves to `false` means nothing moved, for example after a cancelled prompt, and needs no reload. "Move" in
   the context menu of the item starts a keyboard move of the item. Keyboard moves need `getMenuItems`, because "Move"
   is the only way to start one and the drag instructions name it. The up and down arrows step through the places that
   the tree and `canDrop` allow, Home and End go to the first and the last place, Right expands a collapsed parent and
   Left collapses a parent. Enter or Space drops, and Escape, Tab or a focus change cancels. After "Move", a click on
   the row of another item drops there, and a press outside the tree cancels.
 * `canDrop` (function): Called with an item and `{ parentId, position, targetItem }` on each pointer move of a drag,
   for each position that the tree allows at the pointer, in order, until it allows one. In a keyboard move it is called
   on each key that marks a place, for the positions the key passes. It must be quick and synchronous. Returns `true` to
   allow that position. Any falsy value, `undefined` included, refuses it. The drop calls it again for the position of
   the marker, so a reload or a new answer during the drag can refuse the drop. The tree itself refuses a drop on the
   item, a drop in the branch of the item and a drop that leaves the item where it is. A drop inside the parent of the
   item moves the item last, and tries no other position.
 * `label` (string, required): The accessible name of the tree.
 * `titleRowText` (string): The text of the title row. A tree without a title has no title row. Trees that share a
   `treeId` must all have a title row or all have none. Otherwise, while the title row is collapsed, the tree without a
   title row does not scroll to the current item, closes its context menu at once, and loses the children of its
   expanded items on a reload.
 * `isSidePanel` (boolean): Whether the tree has the narrow layout of a side panel.

Keep the same `fetchChildren`, `onOpen` and `onShowAsList` functions across renders. A new function in any of them
renders every item again.

## Items

Each item from `fetchChildren` is an object with an `id` that is a positive whole number. The tree stores an `id`
sent as a string as a number. The tree reads these fields, except `canBeRoot`:

 * `id` (number, required): The id of the record.
 * `treeTitle` (string): The title of the item.
 * `tooltip` (string): The `title` attribute of the link.
 * `editUrl` (string): The `href` of the link.
 * `recordClass` (string): The class of the record, rendered as `data-recordtype`.
 * `classes` (string): Extra class names for the item.
 * `iconClasses` (string): The class names of the icon.
 * `statusFlags` (array): The status flags of the record, each with a `key`, a `text` and a `title`, which can be
   null. Each flag renders as a `StatusBadge`, with the `title` as its tooltip.
 * `hasChildren` (boolean): Whether the item has children to load.
 * `limited` (boolean): Whether the item has too many children to show. The tree shows a "show as list" link in
   place of the children.
 * `listViewUrl` (string): The `href` of the "show as list" link.
 * `canView` (boolean): `false` shows the item as disabled and stops a plain click on it. The browser handles any
   other click as for a link.
 * `canEdit` (boolean): `false` shows the item as disabled. A click still opens the item.
 * `canBeRoot` (boolean): Whether the item can be at the top level. The tree does not read it. `canDrop` can.

The tree does not read a `parentId` field. It records each item under the parent whose children it requested.
