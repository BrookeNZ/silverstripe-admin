/**
 * The Pilet API additions this pilet uses, `registerBeforeSubmit`, header crumbs and FormSchemaForm's headless mode,
 * copied from `client/shell/src/forms/types.ts` and `api/silverstripe.ts` so the pilet builds against an
 * emulator that predates them. On a shell without the verb, page Save does not save dirty blocks first
 */
import type { FieldComponentProps, FormSchemaResponse, PiletApi, SectionHeader } from '@silverstripe/admin-shell';

export interface BeforeSubmitContext {
  action: string;
}

export type BeforeSubmitHandler = (context: BeforeSubmitContext) => boolean | void | Promise<boolean | void>;

export interface FormSchemaSubmitResult {
  /** True when the server accepted the submission with no errors */
  ok: boolean;
  response?: FormSchemaResponse;
  /** Why it failed, when the request itself failed */
  message?: string;
}

export interface FormSchemaFormHandle {
  submit(action?: string): Promise<FormSchemaSubmitResult>;
  isDirty(): boolean;
}

export type HeaderWithCrumbs = SectionHeader & { crumbs?: Array<{ label: string; to: string }> };

export type ElementalPiletApi = Omit<PiletApi, 'setSectionHeader'> & {
  registerBeforeSubmit?(formId: string, handler: BeforeSubmitHandler): () => void;
  setSectionHeader(header: HeaderWithCrumbs): () => void;
};

export type AreaFieldProps = FieldComponentProps<unknown> & { formId?: string };
