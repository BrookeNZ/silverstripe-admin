/**
 * The Pilet API additions this pilet uses, copied from the shell so the pilet builds against an emulator
 * that predates them: `registerBeforeSubmit` (`client/shell/src/forms/beforeSubmit.ts`) and the props of the
 * shell's `SchemaFormDialog` (`client/shell/src/forms/types.ts`). On a shell without `registerBeforeSubmit`
 * the editor still writes its content into the form on blur and after typing stops
 */
import type * as React from 'react';
import type { FieldComponentProps, FormSchemaResponse, PiletApi } from '@silverstripe/admin-shell';

export type BeforeSubmitHandler = (context: { action: string }) => boolean | void | Promise<boolean | void>;

export type HtmlEditorPiletApi = PiletApi & {
  registerBeforeSubmit?(formId: string, handler: BeforeSubmitHandler): () => void;
};

export type HtmlEditorFieldProps = FieldComponentProps<string | null> & { formId?: string };

export interface SchemaFormDialogProps {
  open: boolean;
  header: React.ReactNode;
  intro?: React.ReactNode;
  schemaUrl: string;
  onClose(): void;
  onSubmitted?(response: FormSchemaResponse, action: unknown): void;
}
