import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance, Piral } from 'piral-core';
import { createNotificationsApi } from 'piral-notifications';
import { createSilverstripeApi } from './api/silverstripe';
import { FileEditPage } from './assets';
import { registerBuiltInFields } from './forms/fields';
import { createLayout, createRouter, errors, Home, readMenu } from './layout';
import { initialUnsavedChanges } from './unsaved';
import '@silverstripe/admin-patterns/styles.css';
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
      ...createLayout(readMenu(root), adminPath),
      Router: createRouter(adminPath),
    },
    errorComponents: errors,
    routes: {
      '/': Home,
    },
    unsavedChanges: initialUnsavedChanges,
  },
  plugins: [createNotificationsApi({ defaultOptions: { type: 'info', autoClose: 8000 } }), createSilverstripeApi()],
  requestPilets() {
    return fetch(feedUrl, { credentials: 'same-origin' }).then((res) => {
      if (res.redirected || !res.ok) {
        throw new Error(`The pilet feed answered ${res.status} from ${res.url}`);
      }
      return res.json().then((feed) => feed.items);
    });
  },
});

registerBuiltInFields(instance.root);
instance.root.registerPage('/assets/edit/:id', FileEditPage);

createRoot(root).render(<Piral instance={instance} />);
