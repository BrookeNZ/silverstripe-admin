import * as React from 'react';

export const menuCollapsedKey = 'ss-admin-shell.menu-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(menuCollapsedKey) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      window.localStorage.setItem(menuCollapsedKey, '1');
    } else {
      window.localStorage.removeItem(menuCollapsedKey);
    }
  } catch {
    // Storage can be blocked; the state then lasts until the page reloads
  }
}

/** Whether the desktop menu is the icon rail, remembered per browser */
export function useMenuCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  const update = React.useCallback((next: boolean) => {
    writeCollapsed(next);
    setCollapsed(next);
  }, []);
  return [collapsed, update];
}
