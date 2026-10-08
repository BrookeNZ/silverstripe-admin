/**
 * The shell's view of a CMS section no pilet owns: the section's server-defined EditForm, rendered by
 * FormSchemaForm, under the section header with the section title and, for a ModelAdmin, the model tabs
 * as its views. A GridField item URL in the section renders that record's edit form (RecordEditPage).
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
import { useSectionHeaderEffect } from '../header/state';
import { shellOwner } from '../unsaved';
import type { SilverstripeMenuItem } from '../silverstripe';
import { SectionLoadError } from './LoadError';
import { RecordEditPage } from './RecordEditPage';
import type { Notify } from './RecordEditPage';
import { recordRoute, recordSchemaUrl } from './record';
import { editFormSchemaUrl, menuSections, piletOwnsSection, resolveSectionRoute, sectionHeader } from './resolve';
import type { SectionRoute, ShellSection } from './resolve';

const SectionView = ({ route }: { route: SectionRoute }) => {
  const { section, unhandled } = route;
  const schemaUrl = editFormSchemaUrl(route);
  useSectionHeaderEffect(sectionHeader(route), shellOwner);
  return (
    <div className="shell-page">
      {unhandled.length > 0 && (
        <p className="shell-page__inset" role="note">
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

/**
 * Builds the not_found view for the shell's menu; paths it does not render go to the fallback. A record
 * page reports its saves through `notify`
 */
export function createSectionPage(menu: Array<SilverstripeMenuItem>, Fallback: React.ComponentType<{ owned?: boolean }>, notify: Notify) {
  let sections: Array<ShellSection> | null = null;
  const SectionPage = () => {
    sections ??= menuSections(menu, window.ss?.config?.sections ?? []);
    const { pathname } = useLocation();
    const pages = useGlobalState((state) => state.registry.pages);
    const route = resolveSectionRoute(pathname, sections);
    if (!route) {
      return <Fallback />;
    }
    if (piletOwnsSection(Object.keys(pages), route.section)) {
      return <Fallback owned />;
    }
    const record = recordRoute(route);
    return record ? <RecordEditPage key={recordSchemaUrl(record)} route={record} notify={notify} /> : <SectionView route={route} />;
  };
  SectionPage.displayName = 'SectionPage';
  return SectionPage;
}
