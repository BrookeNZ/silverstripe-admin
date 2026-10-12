/**
 * The Pages section index: the page tree filling the content area under the section header, as legacy
 * CMSMain's index drew it, with no sidebar column and so no collapse button. Legacy's search button sits
 * at the end of the section header; the shell's header has no place for a section's own controls, so here
 * it ends the toolbar row, and opens the search above the toolbar as the sidebar header's button does.
 */
import * as React from 'react';
import { Button, SearchIcon } from '@silverstripe/admin-patterns';
import { PagesTreePane } from './PagesSidebar';
import type { PagesTreePaneProps } from './PagesSidebar';

export interface PagesIndexProps extends Omit<PagesTreePaneProps, 'titleId' | 'searchId' | 'searchOpen' | 'closeSearch' | 'toolbarEnd' | 'fill'> {
  sectionTitle: string;
}

const searchId = 'pages-index-search';

export const PagesIndex = ({ sectionTitle, ...pane }: PagesIndexProps) => {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchButtonRef = React.useRef<HTMLButtonElement | HTMLAnchorElement>(null);

  const closeSearch = React.useCallback(() => {
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  }, []);

  return (
    <PagesTreePane
      {...pane}
      fill
      searchId={searchId}
      searchOpen={searchOpen}
      closeSearch={closeSearch}
      toolbarEnd={
        <Button
          ref={searchButtonRef}
          variant="tertiary"
          iconOnly
          icon={<SearchIcon />}
          aria-expanded={searchOpen}
          aria-controls={searchId}
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          {`Search ${sectionTitle}`}
        </Button>
      }
    />
  );
};
