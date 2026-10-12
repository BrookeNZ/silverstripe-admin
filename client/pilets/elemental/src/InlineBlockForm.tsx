import type * as React from 'react';
import { Button } from '@silverstripe/admin-patterns';
import type { FormSchemaFormHandle, FormSchemaFormProps } from './shell';

export interface InlineBlockFormProps {
  /** The shell's FormSchemaForm, from the component registry */
  FormSchemaForm: React.ComponentType<FormSchemaFormProps>;
  schemaUrl: string;
  regionId: string;
  title: string;
  handleRef: React.RefCallback<FormSchemaFormHandle>;
  dirty: boolean;
  saving: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: () => void;
  onSaved: () => void;
}

/**
 * A block's own form inside the page form: the shell renders it headless (no nested form element, no
 * action bar), and Save posts it through the handle. Save is solid only while the block has changes,
 * because the server writes a new version even for an unchanged block
 */
export const InlineBlockForm = ({
  FormSchemaForm,
  schemaUrl,
  regionId,
  title,
  handleRef,
  dirty,
  saving,
  onDirtyChange,
  onSave,
  onSaved,
}: InlineBlockFormProps) => (
  <div id={regionId} role="group" aria-label={`Edit ${title}`}>
    <FormSchemaForm
      schemaUrl={schemaUrl}
      headless
      handleRef={handleRef}
      onDirtyChange={onDirtyChange}
      onSubmitted={onSaved}
      trackUnsavedChanges
    />
    <div className="elemental-block__form-actions">
      <Button
        variant={dirty ? 'primary' : 'secondary'}
        loading={saving}
        aria-disabled={!dirty || undefined}
        onClick={() => {
          if (dirty) {
            onSave();
          }
        }}
      >
        {dirty ? 'Save block' : 'Saved'}
      </Button>
    </div>
  </div>
);
