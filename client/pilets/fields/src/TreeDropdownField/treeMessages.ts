/**
 * The field's translated status lines: the level the list shows, read out when it changes, and what
 * an empty list says.
 */
import i18n from '../legacy/i18n';

/** "Photography, level 2" for the level a breadcrumb trail ends at */
export function levelMessage(crumbs) {
  if (!crumbs.length) {
    return i18n._t('Admin.TREEDROPDOWN_TOP_LEVEL', 'Top level');
  }
  return i18n.inject(i18n._t('Admin.TREEDROPDOWN_LEVEL', '{title}, level {level}'), {
    title: crumbs[crumbs.length - 1].title,
    level: crumbs.length + 1,
  });
}

export function noOptionsMessage(inputValue, visibleTree, failed) {
  // Only show failed message for the currently visible tree or root
  if (failed.indexOf(visibleTree.id || 0) >= 0) {
    return i18n._t('Admin.TREEDROPDOWN_FAILED', 'Failed to load');
  }
  // If there was a search or this is the root level, say "no options"
  if (inputValue || !visibleTree.id) {
    return i18n._t('Admin.TREEDROPDOWN_NO_OPTIONS', 'No options');
  }
  // If this is inside a tree and there was no search, say "no children"
  return i18n._t('Admin.TREEDROPDOWN_NO_CHILDREN', 'No children');
}
