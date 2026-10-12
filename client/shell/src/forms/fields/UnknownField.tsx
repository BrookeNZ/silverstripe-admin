import { fieldTitle } from '@silverstripe/admin-patterns';
import { isValueField } from '../schema';
import type { FieldComponentProps } from '../types';
import './unknown-field.css';

/** The end of the resolution chain: names what is missing instead of failing the form */
export const UnknownField = ({ field }: FieldComponentProps) => (
  <div className="shell-unknown-field" id={field.holderId} role="note">
    <p className="shell-unknown-field__title">{fieldTitle(field) || field.name}</p>
    <p className="shell-unknown-field__detail">
      No component is registered for <code className="shell-unknown-field__code">{field.component ?? field.componentCandidates?.[0] ?? field.schemaType ?? 'no type'}</code>{' '}
      (field <code className="shell-unknown-field__code">{field.name}</code>, schemaType{' '}
      <code className="shell-unknown-field__code">{field.schemaType ?? 'none'}</code>).
      {isValueField(field) && ' Its current value is kept and posted back.'}
    </p>
  </div>
);
