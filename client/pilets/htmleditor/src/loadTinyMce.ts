/**
 * Loads TinyMCE once per page, when the first editor asks for it.
 *
 * The first choice is this pilet's own chunk (`tinymceBundle.ts`): one request for the core, theme, model,
 * icons and default plugins, which would otherwise be a dozen and more separate files. When that chunk
 * cannot load, the core `tinymce.min.js` from the server's `baseURL` is the fallback, and TinyMCE then
 * fetches the rest by URL as it does without the bundle.
 *
 * Neither path uses the server's combined `data.editorjs` file: it embeds the Silverstripe insert plugins,
 * which read legacy admin globals (Injector, jQuery, React) when they run and throw before the theme and
 * the "already loaded" marks in that file.
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

export const importBundle = (): Promise<unknown> => import(/* webpackChunkName: "tinymce" */ './tinymceBundle');

function loadScript(baseUrl: string): Promise<TinyMCE> {
  const existing = document.querySelector<HTMLScriptElement>(`script[${scriptMarker}]`);
  const script = existing ?? document.createElement('script');
  const promise = new Promise<TinyMCE>((resolve, reject) => {
    const fail = () => {
      script.remove();
      reject(new Error('The HTML editor could not be loaded'));
    };
    script.addEventListener('load', () => (window.tinymce ? resolve(window.tinymce) : fail()), { once: true });
    script.addEventListener('error', fail, { once: true });
  });
  if (!existing) {
    script.src = tinyMceScriptUrl(baseUrl);
    script.setAttribute(scriptMarker, '');
    document.head.append(script);
  }
  return promise;
}

async function loadBundle(bundle: () => Promise<unknown>): Promise<TinyMCE> {
  await bundle();
  if (!window.tinymce) {
    throw new Error('The TinyMCE bundle did not define tinymce');
  }
  return window.tinymce;
}

export function loadTinyMce(baseUrl: string, bundle: () => Promise<unknown> = importBundle): Promise<TinyMCE> {
  if (window.tinymce) {
    return Promise.resolve(window.tinymce);
  }
  if (loading !== null) {
    return loading;
  }
  const promise = loadBundle(bundle)
    .catch(() => loadScript(baseUrl))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  loading = promise;
  return promise;
}

/** For tests: forget a load in progress */
export function resetTinyMceLoader(): void {
  loading = null;
}
