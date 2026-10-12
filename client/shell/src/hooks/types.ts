/**
 * The hook points the shell runs and the handler shapes `registerHook` takes, published to pilets with
 * the form types. A hook's kind is decided by its name: `updateX` passes a value through every handler,
 * `onBeforeX` may cancel what is about to happen, `onAfterX` hears that it happened. A name not listed
 * in `HookPoints` can still be registered and run; its value and context are then `unknown`. A pilet that
 * runs a hook point of its own types it by augmenting the interface:
 * `declare module '@silverstripe/admin-shell' { interface HookPoints { updateX: { value; context } } }`.
 */
import type { FormValues } from '../forms/schema';
import type { FieldComponentProps, FormField, FormSchemaResponse, FormSchemaTree } from '../forms/types';
import type { GridColumn } from '../grid/types';

/** Client validation messages keyed by the field's posted name; a field with no entry, or an empty list, is valid */
export type FormValidationErrors = Record<string, ReadonlyArray<string>>;

/** A form's values keyed by the field's posted name, as `updateFormValues` hands them round */
export type FormValuesByName = Record<string, unknown>;

export interface FormHookContext {
  /** The form element's id (`Form_EditForm`), which every field receives as `formId` */
  formId: string;
}

export interface FormActionHookContext extends FormHookContext {
  /** The pressed action's name, such as `action_save` or `action_publish` */
  action: string;
}

export interface HookPoints {
  updateFormSchema: { value: FormSchemaTree; context: FormHookContext };
  updateFormValues: { value: FormValuesByName; context: FormActionHookContext };
  updateFormValidation: { value: FormValidationErrors; context: { values: FormValues; schema: FormSchemaTree } };
  updateFieldProps: { value: FieldComponentProps; context: { field: FormField; schema: FormSchemaTree } };
  updateGridColumns: { value: ReadonlyArray<GridColumn>; context: { name: string; rowsUrl: string } };
  onBeforeFormAction: { context: FormActionHookContext };
  onBeforeFormSubmit: { context: FormActionHookContext & { values: FormValues } };
  onAfterFormSubmit: { context: FormActionHookContext & { response: FormSchemaResponse } };
}

/** A name the shell runs as an update hook: `update` then a capital, so `updatefoo` is refused */
export type UpdateHookName = `update${Capitalize<string>}`;

export type BeforeHookName = `onBefore${Capitalize<string>}`;

export type AfterHookName = `onAfter${Capitalize<string>}`;

type HookPoint<N extends string> = N extends keyof HookPoints ? HookPoints[N] : { value: unknown; context: unknown };

export type HookValue<N extends string> = HookPoint<N> extends { value: infer V } ? V : never;

export type HookContext<N extends string> = HookPoint<N>['context'];

/** Returning `undefined` counts as a failure: it is logged and the previous value passes on */
export type UpdateHookHandler<V, C> = (value: V, context: C) => V;

/** Resolving `false` cancels; anything else, `0` and `null` included, lets it go ahead */
export type BeforeHookHandler<C> = (context: C) => boolean | void | Promise<boolean | void>;

export type AfterHookHandler<C> = (context: C) => void | Promise<void>;

export type HookHandler<N extends string> = N extends UpdateHookName
  ? UpdateHookHandler<HookValue<N>, HookContext<N>>
  : N extends BeforeHookName
    ? BeforeHookHandler<HookContext<N>>
    : N extends AfterHookName
      ? AfterHookHandler<HookContext<N>>
      : never;

export interface HookOptions {
  /** Names this registration `<pilet>:<id>` for other registrations' `before` and `after`; `#<counter>` when omitted */
  id?: string;
  /** Registrations (`<pilet>:<id>`) this handler runs before */
  before?: ReadonlyArray<string>;
  /** Registrations (`<pilet>:<id>`) this handler runs after */
  after?: ReadonlyArray<string>;
}
