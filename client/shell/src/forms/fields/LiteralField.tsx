/**
 * The framework's LiteralField: server-authored HTML, sanitised as server HTML is (see serverHtml.ts), since a
 * module can build it from record content. Its links are kept, as legacy rendered them
 */
import * as React from 'react';
import { sanitizeServerHtml } from '../serverHtml';
import type { FieldComponentProps } from '../types';

export const LiteralField = ({ field, value }: FieldComponentProps) => {
  const html = value == null ? '' : String(value);
  const fragment = React.useMemo(() => sanitizeServerHtml(html), [html]);
  const content = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    content.current?.replaceChildren(fragment.cloneNode(true));
  }, [fragment]);

  return <div className="admin-literal" id={field.id} ref={content} />;
};
