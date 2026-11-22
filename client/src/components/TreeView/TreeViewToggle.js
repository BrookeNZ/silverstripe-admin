import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import i18n from 'i18n';

// Keep focus where it is when a pointer presses a toggle that takes no focus. Without this, the press moves focus to
// the page, and the next Tab leaves the tree.
const keepFocus = (event) => event.preventDefault();

// The arrow keys of the tree open and close the item of a toggle with `isMouseOnly`. That toggle is out of the Tab
// order and hidden from assistive technology.
const TreeViewToggle = ({ title = '', isExpanded, isMouseOnly = false, onClick }, ref) => (
  <button
    ref={ref}
    type="button"
    className="tree-view__toggle"
    tabIndex={isMouseOnly ? -1 : undefined}
    aria-hidden={isMouseOnly ? 'true' : undefined}
    aria-expanded={isExpanded}
    aria-label={i18n.inject(i18n._t('Admin.TREEVIEW_TOGGLE', 'Toggle children of {title}'), { title })}
    onClick={onClick}
    onMouseDown={isMouseOnly ? keepFocus : undefined}
  >
    <span className="font-icon-right-dir" aria-hidden="true" />
  </button>
);

const ForwardedTreeViewToggle = forwardRef(TreeViewToggle);

ForwardedTreeViewToggle.propTypes = {
  title: PropTypes.string,
  isExpanded: PropTypes.bool.isRequired,
  isMouseOnly: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};

export default ForwardedTreeViewToggle;
