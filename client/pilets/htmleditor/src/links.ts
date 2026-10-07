/**
 * The link kinds the editor's link dialog offers, after the legacy `sslink*` TinyMCE plugins: each one names
 * the `ModalController` form that collects its values (`link_modal_form_factories`, sent to the client as
 * `form.<name>.schemaUrl` on the LeftAndMain section), reads an existing link's attributes back into that
 * form's field values, and turns the values the server accepted into the link's attributes.
 *
 * Pages and files are stored as shortcodes in `href` (`[sitetree_link,id=4]`, `[file_link,id=9]`), which
 * the server resolves when it renders the content, so the anchor survives a page move.
 */

export interface LinkAttributes {
  href: string;
  target?: string;
  title?: string;
}

export type LinkValues = Record<string, string>;

export interface LinkKind {
  /** The form's key in `link_modal_form_factories` */
  name: string;
  label: string;
  /** Whether an existing link's href is this kind */
  matches(href: string): boolean;
  values(link: LinkAttributes): LinkValues;
  attributes(values: Readonly<Record<string, unknown>>): LinkAttributes;
}

const shortcodePattern = (name: string) => new RegExp(`^\\[${name}[,\\s]+id=["']?(\\d+)["']?\\s*\\]$`);
const pageShortcode = shortcodePattern('sitetree_link');
const fileShortcode = shortcodePattern('file_link');

const scriptScheme = /^[\x00-\x20]*(?:javascript|vbscript|data):/i;
// A dotted name before the colon is a host with a port, not a scheme: `example.com:8080/x`
const scheme = /^(?![a-z\d-]+(?:\.[a-z\d-]+)+:\d)[a-z][a-z\d+.-]*:/i;

function text(value: unknown): string {
  return value == null || value === false ? '' : String(value).trim();
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function splitHash(href: string): [string, string] {
  const at = href.indexOf('#');
  return at === -1 ? [href, ''] : [href.slice(0, at), href.slice(at + 1)];
}

function withAnchor(href: string, anchor: unknown): string {
  const name = text(anchor).replace(/^#+/, '');
  return name ? `${href}#${name}` : href;
}

function shared({ title, target }: LinkAttributes, withTarget = true): LinkValues {
  return {
    ...(title ? { Description: title } : {}),
    ...(withTarget && target ? { TargetBlank: '1' } : {}),
  };
}

function common(values: Readonly<Record<string, unknown>>, href: string, withTarget = true): LinkAttributes {
  return {
    href,
    title: text(values.Description) || undefined,
    target: withTarget && checked(values.TargetBlank) ? '_blank' : undefined,
  };
}

function shortcodeId(pattern: RegExp, href: string): string {
  return pattern.exec(splitHash(href)[0])?.[1] ?? '';
}

const page: LinkKind = {
  name: 'editorInternalLink',
  label: 'Page',
  matches: (href) => pageShortcode.test(href),
  values: (link) => ({ PageID: shortcodeId(pageShortcode, link.href), ...shared(link) }),
  attributes: (values) => {
    const id = Number(values.PageID) || 0;
    return common(values, id ? `[sitetree_link,id=${id}]` : '');
  },
};

const anchor: LinkKind = {
  name: 'editorAnchorLink',
  label: 'Anchor',
  matches: (href) => href.startsWith('#') || (pageShortcode.test(splitHash(href)[0]) && splitHash(href)[1] !== ''),
  values: (link) => {
    const [base, hash] = splitHash(link.href);
    const id = shortcodeId(pageShortcode, base);
    return { ...(id ? { PageID: id } : {}), Anchor: hash, ...shared(link) };
  },
  // With no page chosen the anchor is on the page the content belongs to
  attributes: (values) => {
    const id = Number(values.PageID) || 0;
    return common(values, withAnchor(id ? `[sitetree_link,id=${id}]` : '', values.Anchor));
  },
};

const external: LinkKind = {
  name: 'EditorExternalLink',
  label: 'URL',
  matches: () => true,
  values: (link) => {
    const [base, hash] = splitHash(link.href);
    return { Link: base, ...(hash ? { Anchor: hash } : {}), ...shared(link) };
  },
  attributes: (values) => {
    let link = text(values.Link);
    // As the legacy plugin did: a URL typed without a scheme gets the admin's own
    if (link && !scheme.test(link)) {
      link = `${window.location.protocol}//${link}`;
    }
    if (/:\/\/$/.test(link) || scriptScheme.test(link)) {
      link = '';
    }
    return common(values, withAnchor(link, values.Anchor));
  },
};

const email: LinkKind = {
  name: 'EditorEmailLink',
  label: 'Email',
  matches: (href) => /^mailto:/i.test(href),
  values: (link) => {
    const [address, query = ''] = link.href.replace(/^mailto:/i, '').split('?');
    const subject = new URLSearchParams(query).get('subject');
    return { Link: address, ...(subject ? { Subject: subject } : {}), ...shared(link, false) };
  },
  attributes: (values) => {
    const address = text(values.Link).replace(/^mailto:/i, '');
    const subject = text(values.Subject);
    const href = address ? `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : '';
    return common(values, href, false);
  },
};

const phone: LinkKind = {
  name: 'EditorPhoneLink',
  label: 'Phone',
  matches: (href) => /^tel:/i.test(href),
  values: (link) => ({ Link: link.href.replace(/^tel:/i, ''), ...shared(link, false) }),
  attributes: (values) => {
    const number = text(values.Link).replace(/^tel:/i, '');
    return common(values, number ? `tel:${number}` : '', false);
  },
};

const file: LinkKind = {
  name: 'EditorFileLink',
  label: 'File',
  matches: (href) => fileShortcode.test(splitHash(href)[0]),
  values: (link) => ({ FileID: shortcodeId(fileShortcode, link.href), ...shared(link) }),
  attributes: (values) => {
    const id = Number(values.FileID) || 0;
    return common(values, id ? `[file_link,id=${id}]` : '');
  },
};

/** In the order the dialog offers them; an existing link opens on the first kind it matches, in `matchOrder` */
export const linkKinds: ReadonlyArray<LinkKind> = [page, anchor, external, email, phone, file];

const matchOrder: ReadonlyArray<LinkKind> = [anchor, page, file, email, phone, external];

export function kindForHref(href: string, available: ReadonlyArray<LinkKind> = linkKinds): LinkKind | undefined {
  return matchOrder.find((kind) => available.includes(kind) && kind.matches(href)) ?? available.find((kind) => kind === external) ?? available[0];
}

export interface LinkFormSection {
  form?: Record<string, { schemaUrl?: string } | undefined>;
}

/**
 * The kinds the server offers a form for, with each form's schema URL for the given item (`:pageid` is the
 * record the content belongs to, which only the anchor form reads)
 */
export function availableKinds(section: LinkFormSection | undefined): Array<{ kind: LinkKind; schemaUrl: string }> {
  return linkKinds.flatMap((kind) => {
    const schemaUrl = section?.form?.[kind.name]?.schemaUrl;
    return schemaUrl ? [{ kind, schemaUrl }] : [];
  });
}

export function linkSchemaUrl(
  schemaUrl: string,
  { itemId = 0, requireText = false, editing = false, values = {} }: { itemId?: number; requireText?: boolean; editing?: boolean; values?: LinkValues },
): string {
  const query = new URLSearchParams(values);
  if (editing) {
    query.set('editing', '1');
  }
  if (requireText) {
    query.set('requireLinkText', '1');
  }
  const search = query.toString();
  return `${schemaUrl.replace(/:pageid/, String(itemId))}${search ? `?${search}` : ''}`;
}

/** A FormSchema state's field values by name */
export function stateValues(state: { fields?: ReadonlyArray<{ name?: string; value?: unknown }> } | undefined): Record<string, unknown> {
  return Object.fromEntries((state?.fields ?? []).flatMap((field) => (field.name ? [[field.name, field.value]] : [])));
}
