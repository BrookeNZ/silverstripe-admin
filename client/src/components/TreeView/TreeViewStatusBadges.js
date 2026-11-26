import React from 'react';
import PropTypes from 'prop-types';
import StatusBadge from 'components/StatusBadge/StatusBadge';

// The `StatusBadge` status for each status flag key that cms sends. A flag from an extension has no entry and renders a
// badge with no status.
const BADGE_STATUS_BY_FLAG_KEY = {
  addedtodraft: 'draft',
  archived: 'archived',
  deletedonlive: 'archived',
  modified: 'modified',
  removedfromdraft: 'archived',
};

/**
 * The status badges of an item, one for each status flag.
 */
const TreeViewStatusBadges = ({ statusFlags = null }) => (Array.isArray(statusFlags) ? statusFlags : []).map((flag) => (
  <StatusBadge
    key={flag.key}
    status={BADGE_STATUS_BY_FLAG_KEY[flag.key]}
    text={flag.text}
    title={flag.title}
  />
));

TreeViewStatusBadges.propTypes = {
  statusFlags: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    text: PropTypes.string,
    title: PropTypes.string,
  })),
};

export default TreeViewStatusBadges;
