# Status Badge Component

Badge component for displaying one status flag of a record, such as "Draft" or "Modified". The status flags of a
record come from `getStatusFlags()`. A flag key is not a `status` value: map each key to a `status` first, as
`TreeView` does.

## Example
```js
const props = {
  status: 'modified',
  text: 'Modified',
  title: 'Item has unpublished changes',
};
<StatusBadge {...props} />
```

## Properties

 * `status` (string): The colour of the badge: `archived`, `draft` or `modified`. A badge without a status has the
   default colours.
 * `text` (node, required): The text to display in the badge.
 * `title` (string): The `title` attribute of the badge, which browsers show as a tooltip. A badge without a title has
   no `title` attribute.
