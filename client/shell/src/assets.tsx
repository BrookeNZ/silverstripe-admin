/**
 * The asset-admin file edit form, rendered by the shell's FormSchema renderer as the first form slice,
 * under the section header with the file's title and a back button to Files
 */
import * as React from 'react';
import type { PageComponentProps } from 'piral-core';
import { fieldTitle } from '@silverstripe/admin-patterns';
import { FormSchemaForm } from './forms/FormSchemaForm';
import type { FormSchemaState } from './forms/types';
import { useSectionHeaderEffect } from './header/state';
import { shellOwner } from './unsaved';

const assetAdmin = 'SilverStripe\\AssetAdmin\\Controller\\AssetAdmin';

// The form's own title heading, which the section header replaces
const omitFields = ['TitleHeader'];

/** The saved Title, or the file name when the title is blank */
export function fileTitle(state: FormSchemaState): string | null {
  for (const name of ['Title', 'Name']) {
    const value = state.fields.find((field) => field.name === name)?.value;
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

export const FileEditPage = ({ match, piral }: PageComponentProps<{ id: string }>) => {
  const schemaUrl = piral.getConfig().sections.find((section) => section.name === assetAdmin)?.form?.fileEditForm?.schemaUrl;
  const [title, setTitle] = React.useState<string | null>(null);
  useSectionHeaderEffect({ title: title ?? `File ${match.params.id}`, backTo: '/assets/', backLabel: 'Back to files' }, shellOwner);
  return (
    <div className="shell-page">
      {schemaUrl ? (
        <FormSchemaForm
          schemaUrl={schemaUrl + encodeURIComponent(match.params.id)}
          onStateChange={(state) => setTitle(fileTitle(state))}
          omitFields={omitFields}
          onSubmitted={(_response, action) =>
            piral.showNotification(`${fieldTitle(action)} succeeded`, { type: 'success' })
          }
        />
      ) : (
        <p>The asset admin section is not installed, so there is no file edit form.</p>
      )}
    </div>
  );
};
