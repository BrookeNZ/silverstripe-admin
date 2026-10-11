/**
 * The CMS module's SiteTreeURLSegmentField: the page's full URL as a link, with an Edit button that
 * swaps it for the segment input and its OK and Cancel buttons (Figma "Page edit elements", Type=Link
 * `2:6112`, draws only the preview; the edit state follows the legacy template).
 *
 * As in legacy, the input is the posted field, so a typed segment is saved with the page even without
 * OK. OK asks the field's `suggest` action for the segment the server would store (filtered, and made
 * unique among its siblings) and adopts it; Cancel puts back the value from before Edit. The prefix,
 * suffix, help text and suggest URL come from the admin module's schema decoration
 * (`FieldComponentCandidates::urlSegmentData()`); a schema without them falls back to the field's
 * `data-prefix` and `data-suffix` attributes, and OK then keeps the typed segment.
 */
import * as React from 'react';
import { Button, FieldHolder, fieldTitle, Link } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import type { JsonRequest } from './api';
import { decoded, failureMessage, isAbort, siteTreeURLSegmentFieldClass, suggestSegment, text } from './urlSegment';
import './site-tree-url-segment-field.css';

export { siteTreeURLSegmentFieldClass };
export const siteTreeURLSegmentFieldReadonlyClass = `${siteTreeURLSegmentFieldClass}_Readonly`;

export const createSiteTreeURLSegmentField = (request: JsonRequest) => {
  const SiteTreeURLSegmentField = ({ field, value, onChange, onBlur, error }: FieldComponentProps) => {
    const data = field.data;
    const attributes = field.attributes ?? {};
    const prefix = text(data.urlPrefix ?? attributes['data-prefix']);
    const suffix = text(data.urlSuffix ?? attributes['data-suffix']);
    const helpText = text(data.helpText);
    const suggestUrl = text(data.suggestUrl);
    const segment = text(value);
    const readOnly = field.readOnly || field.disabled;

    const [editing, setEditing] = React.useState(false);
    const [checking, setChecking] = React.useState(false);
    const [suggestError, setSuggestError] = React.useState('');
    const original = React.useRef('');
    const inputRef = React.useRef<HTMLInputElement>(null);
    const editRef = React.useRef<HTMLButtonElement | HTMLAnchorElement>(null);
    const focusEdit = React.useRef(false);
    const pending = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
      if (editing) {
        inputRef.current?.focus();
      } else if (focusEdit.current) {
        focusEdit.current = false;
        editRef.current?.focus();
      }
    }, [editing]);

    React.useEffect(() => () => pending.current?.abort(), []);

    const close = () => {
      pending.current?.abort();
      setChecking(false);
      setSuggestError('');
      focusEdit.current = true;
      setEditing(false);
    };

    const startEditing = () => {
      original.current = segment;
      setSuggestError('');
      setEditing(true);
    };

    const cancel = () => {
      if (segment !== original.current) {
        onChange(original.current);
      }
      close();
    };

    const accept = async () => {
      if (segment === original.current || !suggestUrl) {
        onBlur();
        close();
        return;
      }
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setChecking(true);
      setSuggestError('');
      try {
        onChange(await suggestSegment(request, suggestUrl, segment, controller.signal));
        onBlur();
        close();
      } catch (failure) {
        if (isAbort(failure)) {
          return;
        }
        setChecking(false);
        setSuggestError(failureMessage(failure));
        inputRef.current?.focus();
      }
    };

    const fullUrl = decoded(prefix + segment, decodeURI);
    const href = encodeURI(fullUrl + suffix);
    const inputId = field.id;
    const message = suggestError || error;
    const helpId = `${field.id}_help`;
    const messageId = `${field.id}_message`;

    if (!editing) {
      return (
        <FieldHolder field={field} error={error}>
          <div className="pages-url-segment">
            <Link className="pages-url-segment__link" href={href} external title="View the draft page">
              {fullUrl}
            </Link>
            {!readOnly && (
              <Button ref={editRef} size="sm" tone="accent" aria-label={`Edit ${fieldTitle(field) || 'URL segment'}`} onClick={startEditing}>
                Edit
              </Button>
            )}
          </div>
        </FieldHolder>
      );
    }

    return (
      <FieldHolder field={field} error={message || undefined} labelFor={inputId}>
        <div className="pages-url-segment">
          <input
            ref={inputRef}
            className="admin-field__control pages-url-segment__input"
            id={inputId}
            name={field.name}
            type="text"
            maxLength={typeof data.maxlength === 'number' ? data.maxlength : undefined}
            value={segment}
            aria-invalid={message ? true : undefined}
            aria-describedby={[helpText && helpId, message && messageId].filter(Boolean).join(' ') || undefined}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                void accept();
              }
            }}
          />
          <Button variant="primary" size="sm" loading={checking} onClick={() => void accept()}>
            OK
          </Button>
          <Button size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
        {helpText && (
          <p className="admin-field__description" id={helpId}>
            {helpText}
          </p>
        )}
      </FieldHolder>
    );
  };
  return SiteTreeURLSegmentField;
};
