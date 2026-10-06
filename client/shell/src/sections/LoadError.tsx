/**
 * What a section or record page shows when its form cannot be loaded
 */
import * as React from 'react';
import { FormSchemaRequestError } from '../forms/schema';
import type { ShellSection } from './resolve';

const SessionEnded = () => (
  <p className="shell-form__alert" role="alert">
    Your CMS session has ended:{' '}
    <a className="shell-page__link" href={window.ss?.config?.adminUrl ?? '/admin/'}>
      log in again
    </a>
    .
  </p>
);

const ServerProblem = ({ error, subject }: { error: unknown; subject: string }) => (
  <div className="shell-form__alert" role="alert">
    <p>
      {subject} is not available in the shell: its form could not be loaded
      {error instanceof FormSchemaRequestError ? ` (the server answered ${error.status})` : ''}.
    </p>
    {error instanceof FormSchemaRequestError && error.serverMessage && (
      <p>
        The server said: <code>{error.serverMessage}</code>
      </p>
    )}
  </div>
);

export const SectionLoadError = ({ error, section }: { error: unknown; section: ShellSection }) => {
  if (error instanceof FormSchemaRequestError && error.sessionEnded) {
    return <SessionEnded />;
  }
  if (error instanceof FormSchemaRequestError && error.status === 403) {
    return (
      <p className="shell-form__alert" role="alert">
        You do not have permission to use {section.title}.
      </p>
    );
  }
  if (error instanceof FormSchemaRequestError && error.status === 404) {
    return (
      <p className="shell-form__alert" role="alert">
        {section.title} has no edit form.
      </p>
    );
  }
  return <ServerProblem error={error} subject={section.title} />;
};

export const RecordLoadError = ({ error, title }: { error: unknown; title: string }) => {
  if (error instanceof FormSchemaRequestError && error.sessionEnded) {
    return <SessionEnded />;
  }
  if (error instanceof FormSchemaRequestError && error.status === 403) {
    return (
      <p className="shell-form__alert" role="alert">
        You do not have permission to open this record.
      </p>
    );
  }
  if (error instanceof FormSchemaRequestError && error.status === 404) {
    return (
      <p className="shell-form__alert" role="alert">
        This record does not exist. It may have been deleted.
      </p>
    );
  }
  return <ServerProblem error={error} subject={title} />;
};
