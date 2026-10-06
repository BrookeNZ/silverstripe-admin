/**
 * The asset-admin file edit form, rendered by the shell's FormSchema renderer as the first form slice
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import type { PageComponentProps } from 'piral-core';
import { FormSchemaForm } from './forms/FormSchemaForm';
import { fieldTitle } from './forms/fields/FieldHolder';

const assetAdmin = 'SilverStripe\\AssetAdmin\\Controller\\AssetAdmin';

export const FileEditPage: React.FC<PageComponentProps<{ id: string }>> = ({ match, piral }) => {
  const schemaUrl = piral.getConfig().sections.find((section) => section.name === assetAdmin)?.form?.fileEditForm?.schemaUrl;
  return (
    <div className="shell-page">
      <p>
        <Link className="shell-page__link" to="/assets">
          Files
        </Link>
      </p>
      {schemaUrl ? (
        <FormSchemaForm
          schemaUrl={schemaUrl + encodeURIComponent(match.params.id)}
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
