/**
 * Loads TinyMCE once per page from the module's exposed dist, as a global script, so the server's
 * `external_plugins` URLs and `baseURL` keep working and nothing is bundled into the pilet.
 *
 * It loads the core `tinymce.min.js` from `baseURL` rather than the combined `data.editorjs` file: the
 * combined file embeds the Silverstripe insert plugins, which read legacy admin globals (Injector,
 * jQuery, React) when they run and throw before the theme and the "already loaded" marks in that file.
 * TinyMCE then fetches the theme, model, icons, skin and the remaining plugins by URL.
 */
import type { TinyMCE } from 'tinymce';

declare global {
  interface Window {
    tinymce?: TinyMCE;
  }
}

const scriptMarker = 'data-silverstripe-tinymce';

let loading: Promise<TinyMCE> | null = null;

export function tinyMceScriptUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/tinymce.min.js`;
}

export function loadTinyMce(baseUrl: string): Promise<TinyMCE> {
  if (window.tinymce) {
    return Promise.resolve(window.tinymce);
  }
  if (loading) {
    return loading;
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[${scriptMarker}]`);
  const script = existing ?? document.createElement('script');
  const promise = new Promise<TinyMCE>((resolve, reject) => {
    const fail = () => {
      loading = null;
      script.remove();
      reject(new Error('The HTML editor could not be loaded'));
    };
    script.addEventListener('load', () => (window.tinymce ? resolve(window.tinymce) : fail()), { once: true });
    script.addEventListener('error', fail, { once: true });
  });
  loading = promise;
  if (!existing) {
    script.src = tinyMceScriptUrl(baseUrl);
    script.setAttribute(scriptMarker, '');
    document.head.append(script);
  }
  return promise;
}

/** For tests: forget a load in progress */
export function resetTinyMceLoader(): void {
  loading = null;
}
