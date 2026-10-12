/**
 * What a section or record page shows when its form cannot be loaded
 */
import { Alert } from '@silverstripe/admin-patterns';
import { FormSchemaRequestError } from '../forms/schema';
import type { ShellSection } from './resolve';
import { reloginUrl } from '../state/serverRequest';

export const SessionEnded = () => (
  <Alert type="error" className="shell-form__alert">
    Your CMS session has ended:{' '}
    <a className="shell-page__link" href={reloginUrl()}>
      log in again
    </a>
    .
  </Alert>
);

const ServerProblem = ({ error, subject }: { error: unknown; subject: string }) => (
  <Alert type="error" className="shell-form__alert">
    <p>
      {subject} is not available in the shell: its form could not be loaded
      {error instanceof FormSchemaRequestError ? ` (the server answered ${error.status})` : ''}.
    </p>
    {error instanceof FormSchemaRequestError && error.serverMessage && (
      <p>
        The server said: <code>{error.serverMessage}</code>
      </p>
    )}
  </Alert>
);

export const SectionLoadError = ({ error, section }: { error: unknown; section: ShellSection }) => {
  if (error instanceof FormSchemaRequestError && error.sessionExpired) {
    return <SessionEnded />;
  }
  if (error instanceof FormSchemaRequestError && error.status === 403) {
    return (
      <Alert type="error" className="shell-form__alert">
        You do not have permission to use {section.title}.
      </Alert>
    );
  }
  if (error instanceof FormSchemaRequestError && error.status === 404) {
    return (
      <Alert type="error" className="shell-form__alert">
        {section.title} has no edit form.
      </Alert>
    );
  }
  return <ServerProblem error={error} subject={section.title} />;
};

export const RecordLoadError = ({ error, title }: { error: unknown; title: string }) => {
  if (error instanceof FormSchemaRequestError && error.sessionExpired) {
    return <SessionEnded />;
  }
  if (error instanceof FormSchemaRequestError && error.status === 403) {
    return (
      <Alert type="error" className="shell-form__alert">
        You do not have permission to open this record.
      </Alert>
    );
  }
  if (error instanceof FormSchemaRequestError && error.status === 404) {
    return (
      <Alert type="error" className="shell-form__alert">
        This record does not exist. It may have been deleted.
      </Alert>
    );
  }
  return <ServerProblem error={error} subject={title} />;
};
