import React from 'react';
import PropTypes from 'prop-types';
import i18n from 'i18n';

const TreeViewFailedItem = ({ focusKey, level, isTabStop, onRetry }) => (
  <li className="tree-view__item tree-view__item--failed" role="none">
    <button
      type="button"
      className="tree-view__link"
      role="treeitem"
      tabIndex={isTabStop ? 0 : -1}
      data-focus-key={focusKey}
      aria-selected="false"
      aria-level={level}
      aria-setsize={1}
      aria-posinset={1}
      onClick={onRetry}
    >
      {i18n._t('Admin.TREEVIEW_FAILED_RETRY', 'Failed to load. Try again')}
    </button>
  </li>
);

TreeViewFailedItem.propTypes = {
  focusKey: PropTypes.string.isRequired,
  level: PropTypes.number.isRequired,
  isTabStop: PropTypes.bool.isRequired,
  onRetry: PropTypes.func.isRequired,
};

export default TreeViewFailedItem;
