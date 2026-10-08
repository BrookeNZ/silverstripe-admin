/**
 * What the combobox draws for a tree: each option's title with its search highlight, its place in the
 * tree while searching and the pointer target into its children, and the breadcrumb row above a
 * nested level.
 */
import type React from 'react';
import { BackIcon, CollapsedIcon } from '@silverstripe/admin-patterns';
import i18n from '../legacy/i18n';
import { mapHighlight } from '../legacy/castStringToElement';

const Highlight = ({ children }) => (
  <span className="treedropdownfield__option-title--highlighted">{children}</span>
);

export function formatOptionLabel(option, search) {
  const title = option.title || '';

  return search.length
    ? mapHighlight(title, search, Highlight)
    : title;
}

export interface TreeOptionProps {
  node: any;
  /** The field's search, else what is typed in the input */
  search: string;
  searching: boolean;
  /** Shown as the place in the tree of a top-level search match */
  emptyContext: string | null;
  onNavigate: (event: React.MouseEvent, id: unknown) => void;
}

/**
 * Keyboard users open a node with the right arrow, and the hidden hint says it has children
 */
export const TreeOption = ({ node, search, searching, emptyContext, onNavigate }: TreeOptionProps) => {
  const subtitle = searching ? node.contextString || emptyContext : null;
  const hasChildren = Boolean(node.count) && !searching;

  return (
    <>
      <span className="treedropdownfield__option-title-box">
        <span className="treedropdownfield__option-title">{formatOptionLabel(node, search)}</span>
        {subtitle && <span className="treedropdownfield__option-context">{subtitle}</span>}
      </span>
      {hasChildren && (
        // A pointer shortcut inside the option, which is the control; the right arrow does the same from the keyboard
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <span className="treedropdownfield__option-children" onClick={(event) => onNavigate(event, node.id)}>
          <CollapsedIcon />
          <span className="treedropdownfield__option-hint">
            {i18n._t('Admin.TREEDROPDOWN_HAS_CHILDREN', 'has children')}
          </span>
        </span>
      )}
    </>
  );
};

export interface TreeBreadcrumbsProps {
  crumbs: string;
  searching: boolean;
  onBack: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Steps back up one level. Tab reaches it from the input while the list is open; the left arrow does
 * the same from an option. While searching it is only a label
 */
export const TreeBreadcrumbs = ({ crumbs, searching, onBack }: TreeBreadcrumbsProps) => {
  if (searching) {
    return <div className="treedropdownfield__breadcrumbs">{crumbs}</div>;
  }

  return (
    <button type="button" className="treedropdownfield__breadcrumbs" onClick={onBack}>
      <BackIcon size="sm" label={i18n._t('Admin.TREEDROPDOWN_BACK', 'Back')} />
      {crumbs}
    </button>
  );
};
