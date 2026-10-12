/**
 * The framework's HTMLReadonlyField, the read-only form of an HTML editor field: its HTML value under the
 * label, sanitised as server HTML is (see serverHtml.ts). Its schema type is structural and it is read-only,
 * so it posts nothing. Legacy rendered the value in a `<p>`; this uses a `<div>` because the value is
 * usually block content such as paragraphs, which cannot nest in a `<p>`
 */
import * as React from 'react';
import { FieldHolder } from '@silverstripe/admin-patterns';
import { sanitizeServerHtml } from '../serverHtml';
import type { FieldComponentProps } from '../types';

export const HtmlReadonlyField = ({ field, value }: FieldComponentProps) => {
  const html = value == null ? '' : String(value);
  const fragment = React.useMemo(() => sanitizeServerHtml(html), [html]);
  const content = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    content.current?.replaceChildren(fragment.cloneNode(true));
  }, [fragment]);

  return (
    <FieldHolder field={field}>
      <div className="admin-field__readonly" id={field.id} ref={content} />
    </FieldHolder>
  );
};
