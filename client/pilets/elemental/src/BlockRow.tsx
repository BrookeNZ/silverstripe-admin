import type * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { AddIcon, Button, CollapsedIcon, ExpandedIcon, Link, Menu, ReorderIcon } from '@silverstripe/admin-patterns';
import type { Block } from './api';
import { blockStatus, blockTitle, statusLabels } from './blocks';
import type { ElementType } from './blocks';

export type BuiltInBlockAction = 'publish' | 'unpublish' | 'archive' | 'duplicate' | 'moveUp' | 'moveDown';

/** An entry in a block's menu, as the `updateBlockActions` hook hands the list round */
export interface BlockAction {
  /** The built-in actions use their `BuiltInBlockAction` name, so a handler can find, reorder or drop one */
  id: string;
  label: string;
  onSelect: (block: Block) => void | Promise<void>;
  disabled?: boolean;
}

export interface BlockRowProps {
  block: Block;
  type: ElementType | undefined;
  index: number;
  count: number;
  expanded: boolean;
  dirty: boolean;
  /** A write for this block is in flight; its controls stay focusable but do nothing */
  busy: boolean;
  /** The router path of the block's edit page, or its absolute URL when it is outside the router */
  editLink: { to: string; inRouter: boolean } | null;
  renderRouterLink: (props: Record<string, unknown>) => React.ReactElement;
  onToggle: () => void;
  actions: ReadonlyArray<BlockAction>;
  /** Opens the add dialog to insert after this block; no control renders without it */
  onInsertAfter?: () => void;
  children?: React.ReactNode;
}

interface RowPlace {
  block: Block;
  index: number;
  count: number;
}

const menuItems: ReadonlyArray<{ action: BuiltInBlockAction; label: string; allowed: (row: RowPlace) => boolean }> = [
  { action: 'publish', label: 'Publish', allowed: ({ block }) => block.canPublish && blockStatus(block) !== 'published' },
  { action: 'unpublish', label: 'Unpublish', allowed: ({ block }) => block.canUnpublish && block.isPublished },
  { action: 'duplicate', label: 'Duplicate', allowed: ({ block }) => block.canCreate },
  { action: 'moveUp', label: 'Move up', allowed: ({ index }) => index > 0 },
  { action: 'moveDown', label: 'Move down', allowed: ({ index, count }) => index < count - 1 },
  { action: 'archive', label: 'Archive', allowed: ({ block }) => block.canDelete },
];

/** The built-in actions this row allows, each handing its name to `run` */
export function builtInActions(row: RowPlace, run: (action: BuiltInBlockAction) => void | Promise<void>): Array<BlockAction> {
  return menuItems.filter((item) => item.allowed(row)).map((item) => ({ id: item.action, label: item.label, onSelect: () => run(item.action) }));
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function menuId(block: Pick<Block, 'id'>): string {
  return `elemental-block-${block.id}-menu`;
}

export function handleId(block: Pick<Block, 'id'>): string {
  return `elemental-block-${block.id}-handle`;
}

export function insertId(block: Pick<Block, 'id'>): string {
  return `elemental-block-${block.id}-insert`;
}

export const BlockRow = (props: BlockRowProps) => {
  const { block, type, expanded, dirty, busy, editLink, renderRouterLink, onToggle, actions, onInsertAfter, children } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: busy,
    transition: reducedMotion() ? null : undefined,
  });
  const title = blockTitle(block, type);
  const status = blockStatus(block);
  const regionId = `elemental-block-${block.id}-form`;
  const inline = Boolean(type?.inlineEditable);

  // The drag offset is data for the stylesheet. Only a moving row gets a transform, which would otherwise
  // make every row a stacking context that the next row's paint covers an open menu with
  const position = (
    transform
      ? {
          '--elemental-block-transform': `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          '--elemental-block-transition': transition ?? 'none',
        }
      : undefined
  ) as React.CSSProperties | undefined;

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'elemental-block elemental-block--dragging' : 'elemental-block'}
      style={position}
      aria-busy={busy || undefined}
    >
      <div className="elemental-block__row">
        <Button
          ref={setActivatorNodeRef as React.ComponentProps<typeof Button>['ref']}
          {...attributes}
          {...listeners}
          id={handleId(block)}
          variant="tertiary"
          iconOnly
          icon={<ReorderIcon />}
          aria-label={`Reorder ${title}`}
          className="elemental-block__handle"
        />
        <div className="elemental-block__text">
          <span className="elemental-block__title">
            {title}
            {dirty && <span className="elemental-block__flag">Unsaved</span>}
            {status !== 'published' && <span className="elemental-block__flag">{statusLabels[status]}</span>}
          </span>
          <span className="elemental-block__meta">{type?.title || block.obsoleteClassName || 'Unknown block type'}</span>
          {block.blockSchema.content && <span className="elemental-block__summary">{block.blockSchema.content}</span>}
        </div>
        <div className="elemental-block__controls">
          {actions.length > 0 && (
            <Menu id={menuId(block)} label={`More options for ${title}`}>
              {actions.map((action) => (
                <Button
                  key={action.id}
                  variant="tertiary"
                  aria-disabled={busy || action.disabled || undefined}
                  onClick={() => !busy && !action.disabled && action.onSelect(block)}
                >
                  {action.label}
                </Button>
              ))}
            </Menu>
          )}
          {inline ? (
            <Button
              variant="tertiary"
              iconOnly
              icon={expanded ? <ExpandedIcon /> : <CollapsedIcon />}
              aria-label={`Edit ${title}`}
              aria-expanded={expanded}
              aria-controls={regionId}
              onClick={onToggle}
            />
          ) : (
            editLink && (
              <Link
                href={editLink.to}
                aria-label={`Edit ${title}`}
                renderLink={editLink.inRouter ? (linkProps) => renderRouterLink({ ...linkProps, to: editLink.to }) : undefined}
              >
                Edit
              </Link>
            )
          )}
        </div>
      </div>
      {inline && children}
      {onInsertAfter && (
        <div className="elemental-block__insert">
          <Button
            id={insertId(block)}
            variant="tertiary"
            size="sm"
            iconOnly
            icon={<AddIcon size="sm" />}
            aria-label={`Add a block after ${title}`}
            onClick={onInsertAfter}
          />
        </div>
      )}
    </li>
  );
};
