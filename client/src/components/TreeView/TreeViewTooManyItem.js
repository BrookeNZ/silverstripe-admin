import React from 'react';
import PropTypes from 'prop-types';
import i18n from 'i18n';
import { isPlainClick, itemPropType } from './treeViewUtils';

const TreeViewTooManyItem = ({ item, focusKey, level, isTabStop, onShowAsList }) => {
  const handleClick = (event) => {
    if (isPlainClick(event)) {
      onShowAsList(item, event);
    }
  };
  const text = i18n._t('Admin.TREEVIEW_TOO_MANY', 'Too many records ({link})');
  // The link replaces `{link}`, so a translation can place the link and its brackets. Text without `{link}` gets the
  // link at the end.
  const [beforeLink, ...afterLink] = text.includes('{link}') ? text.split('{link}') : [`${text} `];
  const linkText = i18n._t('Admin.TREEVIEW_SHOW_AS_LIST', 'show as list');

  return (
    <li className="tree-view__item tree-view__item--too-many" role="none">
      {beforeLink}
      <a
        className="tree-view__link"
        role="treeitem"
        href={item.listViewUrl}
        tabIndex={isTabStop ? 0 : -1}
        data-focus-key={focusKey}
        aria-label={`${beforeLink}${linkText}${afterLink.join('')}`}
        aria-selected="false"
        aria-level={level}
        aria-setsize={1}
        aria-posinset={1}
        onClick={handleClick}
      >
        {linkText}
      </a>
      {afterLink.join('')}
    </li>
  );
};

TreeViewTooManyItem.propTypes = {
  item: itemPropType.isRequired,
  focusKey: PropTypes.string.isRequired,
  level: PropTypes.number.isRequired,
  isTabStop: PropTypes.bool.isRequired,
  onShowAsList: PropTypes.func.isRequired,
};

export default TreeViewTooManyItem;
