/**
 * The shell's view of a CMS section no pilet owns: the section's server-defined EditForm, rendered by
 * FormSchemaForm, under the section header with the section title and, for a ModelAdmin, the model tabs
 * as its views.
 *
 * It is the router's not_found view, so any page a pilet registers wins over it, including a page that
 * registers after the first render (Piral re-evaluates its routes when the page registry changes). A
 * section with even one pilet page is left to that pilet and gets the given fallback, as does a path
 * outside every menu section.
 */
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { useGlobalState } from 'piral-core';
import { FormSchemaForm } from '../forms/FormSchemaForm';
import { FormSchemaRequestError } from '../forms/schema';
import { useSectionHeaderEffect } from '../header/state';
import { shellOwner } from '../unsaved';
import type { SilverstripeMenuItem } from '../silverstripe';
import { editFormSchemaUrl, menuSections, piletOwnsSection, resolveSectionRoute, sectionHeader } from './resolve';
import type { SectionRoute, ShellSection } from './resolve';

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

const SectionView: React.FC<{ route: SectionRoute }> = ({ route }) => {
  const { section, unhandled } = route;
  const schemaUrl = editFormSchemaUrl(route);
  useSectionHeaderEffect(sectionHeader(route), shellOwner);
  return (
    <div className="shell-page">
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
