// First, so the package tokens precede every stylesheet that reads them
import '@silverstripe/admin-patterns/styles.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance, Piral } from 'piral-core';
import { createSilverstripeApi } from './api/silverstripe';
import { FileEditPage } from './assets';
import { registerBuiltInFields } from './forms/fields';
import { registerGridComponents } from './grid';
import { initialSectionHeader } from './header/state';
import { createLayout, createRouter, errors, Home, readMenu, SectionWithoutPilet } from './layout';
import { createShellNotificationsApi } from './notifications';
import { readTopBar } from './topbar/TopBar';
import { chosenPreviewMode } from './preview/mode';
import { createSectionPage } from './sections/SectionPage';
import { createServerCacheApi } from './state/serverCache';
import { initialCurrentRecord } from './state/sharedState';
import { initialUnsavedChanges } from './unsaved';
import './style.css';

const root = document.querySelector<HTMLElement>('#ss-admin-shell');

if (!root) {
  throw new Error('The shell template must render #ss-admin-shell');
}

const feedUrl = new URL(root.dataset.feedUrl ?? 'admin/pilets/', document.baseURI).href;
const adminPath = new URL(root.dataset.adminUrl ?? 'admin/', document.baseURI).pathname.replace(/\/$/, '');

const instance = createInstance({
  state: {
    components: {
      ...createLayout(readMenu(root), adminPath, readTopBar(root)),
      Router: createRouter(adminPath),
    },
    errorComponents: {
      ...errors,
      not_found: createSectionPage(readMenu(root), SectionWithoutPilet, (message, type) =>
        instance.root.showNotification(message, { type }),
      ),
    },
    routes: {
      '/': Home,
    },
    currentRecord: initialCurrentRecord,
    sectionHeader: initialSectionHeader,
    unsavedChanges: initialUnsavedChanges,
    viewMode: chosenPreviewMode(),
  },
  plugins: [createShellNotificationsApi(8000), createSilverstripeApi(), createServerCacheApi()],
  requestPilets() {
    return fetch(feedUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    }).then((res) => {
      if (res.redirected || !res.ok) {
        throw new Error(`The pilet feed answered ${res.status} from ${res.url}`);
      }
      return res.json().then((feed) => feed.items);
    });
  },
});

registerBuiltInFields(instance.root);
registerGridComponents(instance.root);
instance.root.registerPage('/assets/edit/:id', FileEditPage);

createRoot(root).render(<Piral instance={instance} />);
