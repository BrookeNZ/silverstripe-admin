/** This pilet's own Pilet API types; everything else comes from the shell's emulator */
import type { FieldComponentProps, HookHandler, PiletApi } from '@silverstripe/admin-shell';

export type { SchemaFormDialogProps } from '@silverstripe/admin-shell';

export type UpdateFormValuesHandler = HookHandler<'updateFormValues'>;

export type HtmlEditorPiletApi = PiletApi;

export type HtmlEditorFieldProps = FieldComponentProps<string | null> & { formId?: string };
