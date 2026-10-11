/**
 * The form-level messages above the fields: server errors no field claims, client check failures and
 * the state's own messages, each an Alert. The types map as legacy's FormAlert mapped
 * ValidationResult's: good to success, info, warn or warning to warning, anything else to error.
 */
import { Alert } from '@silverstripe/admin-patterns';
import type { AlertType } from '@silverstripe/admin-patterns';
import { isGoodMessage } from './schema';
import type { SchemaMessage } from './types';

const otherAlertTypes: Record<string, AlertType> = { info: 'info', warn: 'warning', warning: 'warning' };

export function messageAlertType(message: SchemaMessage): AlertType {
  return isGoodMessage(message) ? 'success' : (otherAlertTypes[message.type] ?? 'error');
}

export const FormMessages = ({ messages }: { messages: Array<SchemaMessage> }) =>
  messages.map((message) => (
    <div className="shell-form__field" key={`${message.type}:${message.field ?? ''}:${message.value}`}>
      <Alert type={messageAlertType(message)}>{message.value}</Alert>
    </div>
  ));
