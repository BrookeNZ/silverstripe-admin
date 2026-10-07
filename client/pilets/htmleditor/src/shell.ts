/**
 * The Pilet API addition this pilet uses, `registerBeforeSubmit`, copied from
 * `client/shell/src/forms/beforeSubmit.ts` so the pilet builds against an emulator that predates it. On a
 * shell without the verb the editor still writes its content into the form on blur and after typing stops
 */
import type { FieldComponentProps, PiletApi } from '@silverstripe/admin-shell';

export type BeforeSubmitHandler = (context: { action: string }) => boolean | void | Promise<boolean | void>;

export type HtmlEditorPiletApi = PiletApi & {
  registerBeforeSubmit?(formId: string, handler: BeforeSubmitHandler): () => void;
};

export type HtmlEditorFieldProps = FieldComponentProps<string | null> & { formId?: string };
