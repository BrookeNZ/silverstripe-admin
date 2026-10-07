import * as React from 'react';

/**
 * Set by an open Menu for the buttons inside it: Button renders as a `menuitem` out of the tab order and
 * closes the menu once its click has run, so actions rendered from a schema (the bar's FormActions)
 * become menu items without knowing where they are
 */
export interface MenuItemContextValue {
  close(): void;
}

export const MenuItemContext = React.createContext<MenuItemContextValue | null>(null);
