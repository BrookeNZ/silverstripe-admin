import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { Button, CollapsedIcon, ExpandedIcon, Link, Menu, ReorderIcon } from '@silverstripe/admin-patterns';
import type { Block } from './api';
import { blockStatus, blockTitle, statusLabels } from './blocks';
import type { ElementType } from './blocks';

export type BlockAction = 'publish' | 'unpublish' | 'archive' | 'duplicate' | 'moveUp' | 'moveDown';

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
  renderRouterLink(props: Record<string, unknown>): React.ReactElement;
  onToggle(): void;
  onAction(action: BlockAction): void;
  children?: React.ReactNode;
}

const menuItems: ReadonlyArray<{ action: BlockAction; label: string; allowed(row: BlockRowProps): boolean }> = [
  { action: 'publish', label: 'Publish', allowed: ({ block }) => block.canPublish && blockStatus(block) !== 'published' },
  { action: 'unpublish', label: 'Unpublish', allowed: ({ block }) => block.canUnpublish && block.isPublished },
  { action: 'duplicate', label: 'Duplicate', allowed: ({ block }) => block.canCreate },
  { action: 'moveUp', label: 'Move up', allowed: ({ index }) => index > 0 },
  { action: 'moveDown', label: 'Move down', allowed: ({ index, count }) => index < count - 1 },
  { action: 'archive', label: 'Archive', allowed: ({ block }) => block.canDelete },
];

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function menuId(block: Pick<Block, 'id'>): string {
  return `elemental-block-${block.id}-menu`;
}

export function handleId(block: Pick<Block, 'id'>): string {
  return `elemental-block-${block.id}-handle`;
}

export const BlockRow = (props: BlockRowProps) => {
  const { block, type, expanded, dirty, busy, editLink, renderRouterLink, onToggle, onAction, children } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: busy,
    transition: reducedMotion() ? null : undefined,
  });
  const title = blockTitle(block);
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

  const items = menuItems.filter((item) => item.allowed(props));

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'elemental-block elemental-block--dragging' : 'elemental-block'}
      style={position}
      aria-busy={busy || undefined}
    >
      <div className="elemental-block__row">
        <Button
          ref={setActivatorNodeRef as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
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
          {items.length > 0 && (
            <Menu id={menuId(block)} label={`More options for ${title}`}>
              {items.map((item) => (
                <Button key={item.action} variant="tertiary" aria-disabled={busy || undefined} onClick={() => !busy && onAction(item.action)}>
                  {item.label}
                </Button>
              ))}
            </Menu>
          )}
        </div>
      </div>
      {inline && children}
    </li>
  );
};
