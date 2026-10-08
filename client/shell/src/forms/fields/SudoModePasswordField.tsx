/**
 * The framework's SudoModePasswordField: a notice that a protected section is read-only, then a password
 * check that activates sudo mode through SudoModeController. The server builds a read-only form while
 * sudo mode is off, so on success this refetches everything on screen and the server returns the form
 * editable, without this field; legacy reloaded the panel or the protected grids for the same reason.
 *
 * Its `data-initially-collapsed` and `data-section-title` attributes come from the PHP field. The
 * password input has no name and its value never reaches the form, so the field cannot make it dirty.
 */
import * as React from 'react';
import { Button, FieldHolder } from '@silverstripe/admin-patterns';
import { invalidateShellServerCache } from '../../state/serverCache';
import { fetchJson, ServerRequestError } from '../../state/serverRequest';
import { sharedConfig } from '../../state/sharedState';
import type { FieldComponentProps } from '../types';
import './sudo-mode-password-field.css';

export const sudoModeControllerName = 'SilverStripe\\Admin\\SudoModeController';

interface SudoModeConfig {
  endpoints?: { activate?: string };
  helpLink?: string | null;
}

function sudoModeConfig(): SudoModeConfig {
  return (sharedConfig().sections.find((section) => section.name === sudoModeControllerName) ?? {}) as SudoModeConfig;
}

function verifyMessage(sectionTitle: string): string {
  return sectionTitle
    ? `"${sectionTitle}" is protected and is in read-only mode. Before editing please verify that it's you first.`
    : "This section is protected and is in read-only mode. Before editing please verify that it's you first.";
}

export const SudoModePasswordField = ({ field }: FieldComponentProps) => {
  const attributes = field.attributes ?? {};
  const [expanded, setExpanded] = React.useState(!attributes['data-initially-collapsed']);
  const [verifying, setVerifying] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [activating, setActivating] = React.useState(false);
  const [activated, setActivated] = React.useState(false);
  const { endpoints, helpLink } = sudoModeConfig();
  const inputId = `${field.id}_Password`;

  const verify = async () => {
    if (!endpoints?.activate) {
      setMessage('Sudo mode cannot be activated here.');
      return;
    }
    setActivating(true);
    try {
      await fetchJson(endpoints.activate, { method: 'POST', body: new URLSearchParams({ Password: password }) });
      setActivated(true);
      await invalidateShellServerCache();
    } catch (error) {
      setMessage(error instanceof ServerRequestError ? (error.serverMessage ?? error.message) : String(error));
    } finally {
      setActivating(false);
    }
  };

  if (activated) {
    return null;
  }

  const notice = (
    <p className="shell-sudo-mode__message">
      {verifyMessage(String(attributes['data-section-title'] ?? ''))}{' '}
      {helpLink && (
        <a className="admin-link" href={helpLink} target="_blank" rel="noopener noreferrer">
          What is this?
        </a>
      )}
    </p>
  );

  if (!expanded) {
    return (
      <div className="shell-sudo-mode" id={field.holderId}>
        {notice}
        <Button
          onClick={() => {
            setExpanded(true);
            setVerifying(true);
          }}
        >
          Verify
        </Button>
      </div>
    );
  }

  return (
    <div className="shell-sudo-mode" id={field.holderId}>
      {notice}
      {verifying ? (
        <FieldHolder field={{ id: inputId, title: 'Enter your password' }} error={message || undefined} labelFor={inputId}>
          <div className="shell-sudo-mode__verify">
            <input
              className="admin-field__control"
              id={inputId}
              type="password"
              autoComplete={String(attributes.autocomplete ?? 'off')}
              autoFocus
              value={password}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${inputId}_message` : undefined}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  void verify();
                }
              }}
            />
            <Button variant="primary" loading={activating} onClick={() => void verify()}>
              Verify
            </Button>
          </div>
        </FieldHolder>
      ) : (
        <Button onClick={() => setVerifying(true)}>Verify to continue</Button>
      )}
    </div>
  );
};
