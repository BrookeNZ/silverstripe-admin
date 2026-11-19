# Context Menu Component

A menu of actions that opens at a pointer or below an element. The menu is open while it is mounted. The parent
unmounts the menu after the menu calls `onClose`, and decides where focus goes next.

## Example
```js
const props = {
  label: 'Actions for About us',
  anchor: { x: event.clientX, y: event.clientY },
  subject: page,
  items: [
    { id: 'edit', label: 'Edit', onSelect: (subject) => editPage(subject) },
    { id: 'add', label: 'Add page', items: [
      { id: 'page', label: 'Page', onSelect: (subject) => addPage(subject, 'Page') },
    ] },
  ],
  onClose: (reason) => closeMenu(reason),
};
<ContextMenu {...props} />
```

## Properties

 * `items` (array, required): The items of the menu. Each item has an `id` (string or number) and a `label`, and can
   have `onSelect`, `disabled` and `iconClassName`. The menu calls `onSelect(subject, event)` before it closes, never
   for a disabled item. An item with `items` opens a submenu and has no `onSelect`. A submenu cannot nest further.
 * `anchor` (object or element, required): A point `{ x, y }` in viewport coordinates, such as the `clientX` and
   `clientY` of a pointer event, or an element to open below.
 * `onClose` (function, required): Called with the reason the menu closes: `select`, `escape`, `tab`, `outside` (a
   pointer press outside the menu) or `dismiss` (a scroll, a resize or a blur of the window). These strings are the
   values of the `CLOSE_REASON` export.
 * `label` (string, required): The accessible name of the menu.
 * `subject` (any): The value that the menu acts on. The menu passes it to the `onSelect` of each item.
