/**
 * ArchiveAdmin's "Select a content type" dropdown (OtherDropdown). Choosing a type loads that type's
 * archive, as the legacy admin's entwine handler did, rather than changing a form value. The load is a full
 * page load because the section's model tabs come from the page's client config, and the admin names the
 * chosen type as the "Other" tab only on the load that asks for it (ArchiveAdminShellExtension).
 */
import type { ComponentType } from 'react';
import type { FieldComponentProps } from '@silverstripe/admin-shell';

export const archiveTypeUrl = (baseUrl: string, className: string): string =>
  new URL(`${baseUrl.replace(/\/*$/, '/')}${className.replace(/\\/g, '-')}/`, document.baseURI).href;

export function createArchiveTypeField(
  SingleSelectField: ComponentType<FieldComponentProps>,
  go: (url: string) => void,
): ComponentType<FieldComponentProps> {
  const ArchiveTypeField = (props: FieldComponentProps) => {
    const configured = props.field.attributes?.['data-others-archive-url'];
    const baseUrl = typeof configured === 'string' ? configured : 'admin/archive/';
    return (
      <SingleSelectField
        {...props}
        onChange={(value) => {
          if (typeof value === 'string' && value !== '') {
            go(archiveTypeUrl(baseUrl, value));
          }
        }}
      />
    );
  };
  return ArchiveTypeField;
}
