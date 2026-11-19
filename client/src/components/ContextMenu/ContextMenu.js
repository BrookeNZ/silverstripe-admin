/**
 * `ContextMenu` renders a menu of actions at a pointer or below an element.
 *
 * The menu is open while the menu is mounted. The parent unmounts the menu after the menu calls `onClose`. The menu
 * does not return focus. The parent decides where focus goes next.
 *
 * A top-level item with `items` opens a submenu beside the item. A submenu renders inside the `li` of the parent item.
 * The top-level menu element then contains every level.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { createPopper } from '@popperjs/core';

export const CLOSE_REASON = {
  SELECT: 'select',
  ESCAPE: 'escape',
  TAB: 'tab',
  OUTSIDE: 'outside',
  // The reason for a scroll, a resize or a blur of the window. The page under the menu moved or lost focus.
  DISMISS: 'dismiss',
};

const getPointRect = (x, y) => ({ x, y, top: y, right: x, bottom: y, left: x, width: 0, height: 0 });

const focusQuietly = (element) => element && element.focus({ preventScroll: true });

const getItemElements = (menu) => Array.from(menu.querySelectorAll(':scope > li > [role="menuitem"]'));

// Focus the first enabled item in `menu`. The item elements have the order of `items`. An index into `items` then
// finds the matching element.
const focusFirstEnabledItem = (menu, items) => {
  const firstEnabled = items.findIndex((item) => !item.disabled);
  focusQuietly(getItemElements(menu)[Math.max(firstEnabled, 0)] || menu);
};

// Position `menu` at `reference` with Popper. The Popper listeners are off. The menu closes on scroll and resize.
// With `adaptive` off, the position is always a transform from the top left, whichever way the menu flips.
const positionMenu = (reference, menu, { placement, fallbackPlacements, strategy, skidding = 0 }) => (
  createPopper(reference, menu, {
    placement,
    strategy,
    modifiers: [
      { name: 'eventListeners', enabled: false },
      { name: 'offset', options: { offset: [skidding, 0] } },
      { name: 'flip', options: { fallbackPlacements } },
      { name: 'preventOverflow', options: { altAxis: true } },
      { name: 'computeStyles', options: { adaptive: false } },
    ],
  })
);

// The border plus the padding of `.context-menu` in ContextMenu.scss. The first item of a submenu then lines up with
// the parent item.
const SUBMENU_SKIDDING = -2;

const ContextMenuSubmenu = ({ label, children }) => {
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    // A submenu is the next sibling of the button of the parent item. `expandSubmenu` and `collapseSubmenu` also use that
    // sibling.
    const popper = positionMenu(menu.previousElementSibling, menu, {
      placement: 'right-start',
      fallbackPlacements: ['left-start'],
      strategy: 'absolute',
      skidding: SUBMENU_SKIDDING,
    });
    return () => popper.destroy();
  }, []);

  return <ul ref={menuRef} className="context-menu" role="menu" aria-label={label}>{children}</ul>;
};

ContextMenuSubmenu.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
};

const ContextMenu = ({ items, anchor, onClose, label, subject = null }) => {
  const menuRef = useRef(null);
  const [expandedId, setExpandedId] = useState(null);

  // Listeners that an effect adds once read the latest callback from `latestRef`. A new `onClose` on each render then
  // rebinds no listener.
  const latestRef = useRef({ items, onClose });
  useLayoutEffect(() => {
    latestRef.current = { items, onClose };
  });

  const anchorElement = anchor instanceof Element ? anchor : null;
  const x = anchorElement ? null : anchor.x;
  const y = anchorElement ? null : anchor.y;

  useLayoutEffect(() => {
    const reference = anchorElement || { getBoundingClientRect: () => getPointRect(x, y) };
    const popper = positionMenu(reference, menuRef.current, {
      placement: 'bottom-start',
      fallbackPlacements: ['bottom-end', 'top-start', 'top-end'],
      strategy: 'fixed',
    });
    return () => popper.destroy();
  }, [anchorElement, x, y]);

  // The menu takes focus on mount only. A later change to `items` must not move the focus.
  useLayoutEffect(() => {
    focusFirstEnabledItem(menuRef.current, latestRef.current.items);
  }, []);

  useEffect(() => {
    const close = (reason) => latestRef.current.onClose(reason);
    const isOutside = (event) => !menuRef.current.contains(event.target);
    const handlePointerDown = (event) => isOutside(event) && close(CLOSE_REASON.OUTSIDE);
    const handleScroll = (event) => isOutside(event) && close(CLOSE_REASON.DISMISS);
    const handleResizeOrBlur = () => close(CLOSE_REASON.DISMISS);

    // This listener uses the capture phase. A handler that stops propagation then cannot keep the menu open.
    document.addEventListener('pointerdown', handlePointerDown, true);
    // The scroll listener starts on the next frame. A scroll that the browser queued before the menu opened, such as
    // from the End key, then does not close the menu.
    const scrollFrame = window.requestAnimationFrame(() => {
      document.addEventListener('scroll', handleScroll, true);
    });
    window.addEventListener('resize', handleResizeOrBlur);
    // This listener does not use the capture phase. The blur of an element does not bubble. Only the blur of the
    // window then reaches this listener.
    window.addEventListener('blur', handleResizeOrBlur);
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResizeOrBlur);
      window.removeEventListener('blur', handleResizeOrBlur);
    };
  }, []);

  // Check whether `item` can open a submenu. Only a top-level item opens a submenu.
  const canExpandSubmenu = (item) => items.includes(item) && Array.isArray(item.items) && !item.disabled;

  // Open the submenu of `item`. `flushSync()` renders the submenu at once. The first item of the submenu can then take
  // focus in the same event.
  const expandSubmenu = (item, button) => {
    flushSync(() => setExpandedId(item.id));
    focusFirstEnabledItem(button.nextElementSibling, item.items);
  };

  const collapseSubmenu = (submenu) => {
    focusQuietly(submenu.previousElementSibling);
    setExpandedId(null);
  };

  const activateItem = (item, event) => {
    if (!item || item.disabled) {
      return;
    }
    if (canExpandSubmenu(item)) {
      expandSubmenu(item, event.target.closest('[role="menuitem"]'));
      return;
    }
    if (typeof item.onSelect === 'function') {
      item.onSelect(subject, event);
    }
    onClose(CLOSE_REASON.SELECT);
  };

  const findItemByFirstLetter = (elements, levelItems, from, letter) => {
    const order = [...elements.keys()].map((offset) => (from + 1 + offset) % elements.length);
    const match = order.find((index) => levelItems[index].label.trim().toLocaleLowerCase().startsWith(letter));
    return match === undefined ? null : elements[match];
  };

  const handleKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const menu = event.target.closest('[role="menu"]');
    const isInSubmenu = menu !== menuRef.current;
    const levelItems = isInSubmenu ? items.find((item) => item.id === expandedId).items : items;
    const elements = getItemElements(menu);
    const last = elements.length - 1;
    const index = elements.indexOf(event.target);
    // Stop a handled key here. A handler on a React ancestor of the portal then does not act on the key too.
    const consumeEvent = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const moveTo = (element) => {
      consumeEvent();
      if (!isInSubmenu) {
        setExpandedId(null);
      }
      focusQuietly(element);
    };

    switch (event.key) {
      case 'ArrowDown':
        moveTo(elements[index >= last ? 0 : index + 1]);
        break;
      case 'ArrowUp':
        moveTo(elements[index <= 0 ? last : index - 1]);
        break;
      case 'Home':
        moveTo(elements[0]);
        break;
      case 'End':
        moveTo(elements[last]);
        break;
      case 'ArrowRight':
        consumeEvent();
        if (!isInSubmenu && levelItems[index] && canExpandSubmenu(levelItems[index])) {
          expandSubmenu(levelItems[index], event.target);
        }
        break;
      case 'ArrowLeft':
        consumeEvent();
        if (isInSubmenu) {
          collapseSubmenu(menu);
        }
        break;
      case 'Enter':
      case ' ':
        consumeEvent();
        // Without this check, a held key opens a submenu and then chooses the first item of the submenu.
        if (!event.repeat) {
          activateItem(levelItems[index], event);
        }
        break;
      case 'Escape':
        consumeEvent();
        if (isInSubmenu) {
          collapseSubmenu(menu);
        } else {
          onClose(CLOSE_REASON.ESCAPE);
        }
        break;
      case 'Tab':
        consumeEvent();
        onClose(CLOSE_REASON.TAB);
        break;
      default:
        if (event.key.length === 1 && elements.length) {
          const match = findItemByFirstLetter(elements, levelItems, index, event.key.toLocaleLowerCase());
          if (match) {
            moveTo(match);
          }
        }
    }
  };

  // Prevent the browser menu on a right-click inside the menu. Stop the event before the event reaches the handler that
  // opened this menu.
  const handleContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleItemMouseEnter = (item, isTopLevel, event) => {
    focusQuietly(event.currentTarget);
    if (isTopLevel) {
      setExpandedId(canExpandSubmenu(item) ? item.id : null);
    }
  };

  const renderItems = (levelItems, isTopLevel) => levelItems.map((item) => {
    const isItemParent = isTopLevel && Array.isArray(item.items);
    const isExpanded = isItemParent && item.id === expandedId;
    return (
      <li key={item.id} role="none">
        <button
          type="button"
          className={classnames('context-menu__item', {
            'context-menu__item--disabled': item.disabled,
            'context-menu__item--parent': isItemParent,
          })}
          role="menuitem"
          tabIndex={-1}
          aria-disabled={item.disabled ? 'true' : undefined}
          aria-haspopup={isItemParent ? 'menu' : undefined}
          aria-expanded={isItemParent ? String(isExpanded) : undefined}
          onClick={(event) => activateItem(item, event)}
          onMouseEnter={(event) => handleItemMouseEnter(item, isTopLevel, event)}
        >
          {item.iconClassName && <span className={item.iconClassName} aria-hidden="true" />}
          {item.label}
        </button>
        {isExpanded && <ContextMenuSubmenu label={item.label}>{renderItems(item.items, false)}</ContextMenuSubmenu>}
      </li>
    );
  });

  return createPortal(
    <ul
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {renderItems(items, true)}
    </ul>,
    document.body
  );
};

const itemFields = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  label: PropTypes.string.isRequired,
  onSelect: PropTypes.func,
  disabled: PropTypes.bool,
  iconClassName: PropTypes.string,
};

const pointPropType = PropTypes.shape({
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
});

ContextMenu.propTypes = {
  /**
   * The items of the menu. The menu calls `onSelect(subject, event)` before the menu closes, never for a disabled item.
   * An item with `items` opens a submenu and calls no `onSelect`. The items of a submenu cannot nest further.
   */
  items: PropTypes.arrayOf(PropTypes.shape({
    ...itemFields,
    items: PropTypes.arrayOf(PropTypes.shape(itemFields)),
  })).isRequired,
  /**
   * A point in viewport coordinates, such as the `clientX` and `clientY` of a pointer event, or an element to open
   * below.
   */
  anchor: PropTypes.oneOfType([pointPropType, PropTypes.instanceOf(Element)]).isRequired,
  /** The function `(reason)`, with one of the `CLOSE_REASON` values. */
  onClose: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  /** The value that the menu acts on. The menu passes `subject` to the `onSelect` of each item. */
  subject: PropTypes.any,
};

export default ContextMenu;
