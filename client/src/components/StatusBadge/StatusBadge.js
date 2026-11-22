import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

export const STATUSES = [
  'archived',
  'draft',
  'modified',
];

const StatusBadge = ({ status, text, title }) => (
  <span
    className={classnames('status-badge', status && `status-badge--${status}`)}
    title={title}
  >
    {text}
  </span>
);

StatusBadge.propTypes = {
  status: PropTypes.oneOf(STATUSES),
  text: PropTypes.node.isRequired,
  title: PropTypes.string,
};

export default StatusBadge;
