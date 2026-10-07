/**
 * The props of the shell's `SchemaFormDialog`, copied from `client/shell/src/forms/types.ts` so the pilet
 * builds against an emulator that predates it
 */
import type { ReactNode } from 'react';
import type { FormField, FormSchemaResponse } from '@silverstripe/admin-shell';

export interface SchemaFormDialogProps {
  open: boolean;
  header: ReactNode;
  schemaUrl: string;
  onClose(): void;
  onSubmitted?(response: FormSchemaResponse, action: FormField): void;
}
