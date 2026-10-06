/**
 * The shell's view of a CMS section no pilet owns: the section's server-defined EditForm, rendered by
 * FormSchemaForm, under the section title, a breadcrumb and, for a ModelAdmin, the model tabs as links.
 *
 * It is the router's not_found view, so any page a pilet registers wins over it, including a page that
 * registers after the first render (Piral re-evaluates its routes when the page registry changes). A
 * section with even one pilet page is left to that pilet and gets the given fallback, as does a path
 * outside every menu section.
 */
import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGlobalState } from 'piral-core';
import { FormSchemaForm } from '../forms/FormSchemaForm';
import { FormSchemaRequestError } from '../forms/schema';
import type { SilverstripeMenuItem } from '../silverstripe';
import {
  editFormSchemaUrl,
  menuSections,
  modelTabPath,
  piletOwnsSection,
  resolveSectionRoute,
} from './resolve';
import type { SectionRoute, ShellSection } from './resolve';
import './section.css';

const SectionLoadError: React.FC<{ error: unknown; section: ShellSection }> = ({ error, section }) => {
  const adminUrl = window.ss?.config?.adminUrl ?? '/admin/';
  if (error instanceof FormSchemaRequestError && error.sessionEnded) {
    return (
      <p className="shell-form__alert" role="alert">
        Your CMS session has ended:{' '}
        <a className="shell-page__link" href={adminUrl}>
          log in again
        </a>
        .
      </p>
    );
  }
  if (error instanceof FormSchemaRequestError && error.status === 403) {
    return (
      <p className="shell-form__alert" role="alert">
        You do not have permission to use {section.title}.
      </p>
    );
  }
  if (error instanceof FormSchemaRequestError && error.status === 404) {
    return (
      <p className="shell-form__alert" role="alert">
        {section.title} has no edit form.
      </p>
    );
  }
  return (
    <div className="shell-form__alert" role="alert">
      <p>
        {section.title} is not available in the shell: its form could not be loaded
        {error instanceof FormSchemaRequestError ? ` (the server answered ${error.status})` : ''}.
      </p>
      {error instanceof FormSchemaRequestError && error.serverMessage && (
        <p>
          The server said: <code>{error.serverMessage}</code>
        </p>
      )}
    </div>
  );
};

const ModelTabs: React.FC<{ route: SectionRoute }> = ({ route: { section, tab } }) => (
  <nav aria-label={`${section.title} models`}>
    <ul className="shell-section__list">
      {section.modelTabs.map((item) => (
        <li key={item.tab}>
          <Link
            className="shell-section__tab-link"
            to={modelTabPath(section, item)}
            aria-current={item.tab === tab?.tab ? 'page' : undefined}
          >
            {item.title}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
);

const SectionView: React.FC<{ route: SectionRoute }> = ({ route }) => {
  const { section, tab, unhandled } = route;
  const schemaUrl = editFormSchemaUrl(route);
  return (
    <div className="shell-page shell-section">
      <nav aria-label="Breadcrumb">
        <ol className="shell-section__list">
          <li>
            {tab ? (
              <Link className="shell-page__link" to={`/${section.route}/`}>
                {section.title}
              </Link>
            ) : (
              <span aria-current="page">{section.title}</span>
            )}
          </li>
          {tab && (
            <li>
              <span aria-hidden="true">/ </span>
              <span aria-current="page">{tab.title}</span>
            </li>
          )}
        </ol>
      </nav>
      <h1 className="shell-page__title">{section.title}</h1>
      {section.modelTabs.length > 1 && <ModelTabs route={route} />}
      {unhandled.length > 0 && (
        <p role="note">
          The shell has no view for “{unhandled.join('/')}” in {section.title} yet, so this is the section’s
          main form.
        </p>
      )}
      <FormSchemaForm
        key={schemaUrl}
        schemaUrl={schemaUrl}
        trackUnsavedChanges
        renderLoadError={(error) => <SectionLoadError error={error} section={section} />}
      />
    </div>
  );
};

/** Builds the not_found view for the shell's menu; paths it does not render go to the fallback */
export function createSectionPage(menu: Array<SilverstripeMenuItem>, Fallback: React.ComponentType): React.FC {
  let sections: Array<ShellSection> | null = null;
  const SectionPage: React.FC = () => {
    sections ??= menuSections(menu, window.ss?.config?.sections ?? []);
    const { pathname } = useLocation();
    const pages = useGlobalState((state) => state.registry.pages);
    const route = resolveSectionRoute(pathname, sections);
    if (!route || piletOwnsSection(Object.keys(pages), route.section)) {
      return <Fallback />;
    }
    return <SectionView route={route} />;
  };
  SectionPage.displayName = 'SectionPage';
  return SectionPage;
}
