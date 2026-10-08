/**
 * The form-level messages above the fields: server errors no field claims, client check failures and
 * the state's own messages. Good news is a status, anything else an alert.
 */
import * as React from 'react';
import type { SchemaMessage } from './types';

const goodMessageTypes = new Set(['good', 'success']);

export const FormMessages = ({ messages }: { messages: Array<SchemaMessage> }) =>
  messages.map((message, index) => (
    <div className="shell-form__field" key={index}>
      {goodMessageTypes.has(message.type) ? (
        <p className="shell-form__alert shell-form__alert--good" role="status">
          {message.value}
        </p>
      ) : (
        <p className="shell-form__alert" role="alert">
          {message.value}
        </p>
      )}
    </div>
  ));
