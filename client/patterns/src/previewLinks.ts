/**
 * A record's preview URLs, read from the SilverStripeNavigator field CMSMain adds to a page's edit and
 * settings forms and a block's item form carries: a LiteralField whose state value is the navigator's
 * HTML, with one link per stage (`?stage=Stage` for draft, `?stage=Live` for published; a select's
 * `data-link` once there are five or more). The record endpoints carry no link of their own. Like the
 * legacy preview panel, the URL loaded gets `CMSPreview=1`.
 */
export type PreviewStage = 'draft' | 'live';

export type PreviewLinks = Partial<Record<PreviewStage, string>>;

export const navigatorField = 'SilverStripeNavigator';

const stageParams: Record<string, PreviewStage> = { Stage: 'draft', Live: 'live' };

/** `base` resolves the relative links PreviewLink() can return */
export function previewLinks(fields: ReadonlyArray<{ name: string; value: unknown }>, base: string): PreviewLinks {
  const html = fields.find((field) => field.name === navigatorField)?.value;
  if (typeof html !== 'string') {
    return {};
  }
  const links: PreviewLinks = {};
  const navigator = new DOMParser().parseFromString(html, 'text/html');
  for (const element of navigator.querySelectorAll('a[href], option[data-link]')) {
    const href = element.getAttribute('href') ?? element.getAttribute('data-link') ?? '';
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    const stage = stageParams[url.searchParams.get('stage') ?? ''];
    if (stage && !url.searchParams.has('archiveDate')) {
      url.searchParams.set('CMSPreview', '1');
      links[stage] ??= url.href;
    }
  }
  return links;
}
