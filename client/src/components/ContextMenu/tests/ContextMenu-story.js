import React, { useRef, useState } from 'react';
import { action } from '@storybook/addon-actions';
import ContextMenu from '../ContextMenu';

const items = [
  { id: 'edit', label: 'Edit', onSelect: action('Edit') },
  {
    id: 'duplicate',
    label: 'Duplicate',
    items: [
      { id: 'duplicate-page', label: 'This page only', onSelect: action('This page only') },
      { id: 'duplicate-all', label: 'This page and subpages', onSelect: action('This page and subpages') },
    ],
  },
  { id: 'archive', label: 'Archive', onSelect: action('Archive'), disabled: true },
  { id: 'list', label: 'Show children as list', onSelect: action('Show children as list') },
];

const AtPointer = (args) => {
  const [anchor, setAnchor] = useState(null);
  const close = (reason) => {
    action('onClose')(reason);
    setAnchor(null);
  };
  const open = (event) => {
    event.preventDefault();
    setAnchor({ x: event.clientX, y: event.clientY });
  };
  return (
    <div className="border p-5" onContextMenu={open}>
      Right-click anywhere in this box
      {anchor && <ContextMenu {...args} anchor={anchor} onClose={close} />}
    </div>
  );
};

const AtElement = (args) => {
  const buttonRef = useRef(null);
  const [isOpen, setOpen] = useState(false);
  const close = (reason) => {
    action('onClose')(reason);
    setOpen(false);
    buttonRef.current.focus();
  };
  return (
    <>
      <button ref={buttonRef} type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Open the menu
      </button>
      {isOpen && <ContextMenu {...args} anchor={buttonRef.current} onClose={close} />}
    </>
  );
};

export default {
  title: 'Admin/ContextMenu',
  component: ContextMenu,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `A menu of actions opened at a pointer or below an element. It is open while mounted: the parent
        unmounts it when \`onClose\` is called with the reason, and moves focus back itself. "Archive" is disabled: it
        takes focus but does nothing.`,
      },
      canvas: {
        sourceState: 'hide',
      },
      story: {
        height: '400px',
      },
    },
  },
};

export const Pointer = AtPointer.bind({});
Pointer.args = {
  items,
  label: 'About Us',
  subject: { id: 6, treeTitle: 'About Us' },
};

export const BelowElement = AtElement.bind({});
BelowElement.args = {
  ...Pointer.args,
};
