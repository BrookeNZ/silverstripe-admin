// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TinyMCE } from 'tinymce';
import { loadTinyMce, resetTinyMceLoader, tinyMceScriptUrl } from './loadTinyMce';

const fake = { majorVersion: '6' } as unknown as TinyMCE;

// happy-dom answers a script request at once: "load" when it treats disabled loading as success, else "error"
function scriptLoads(success: boolean) {
  const settings = (window as unknown as { happyDOM: { settings: Record<string, boolean> } }).happyDOM.settings;
  settings.disableJavaScriptFileLoading = true;
  settings.handleDisabledFileLoadingAsSuccess = success;
}

// Runs before the loader's own listener, as the real script defines the global before its load event
const defineGlobal = () => {
  window.tinymce = fake;
};

beforeEach(() => {
  document.addEventListener('load', defineGlobal, true);
});

afterEach(() => {
  document.removeEventListener('load', defineGlobal, true);
  delete window.tinymce;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  resetTinyMceLoader();
});

describe('loadTinyMce', () => {
  it('adds the core script once and resolves with the global it defines', async () => {
    scriptLoads(true);
    expect(await loadTinyMce('/tinymce/')).toBe(fake);
    expect(await loadTinyMce('/tinymce')).toBe(fake);
    const scripts = document.head.querySelectorAll('script[data-silverstripe-tinymce]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute('src')).toBe('/tinymce/tinymce.min.js');
  });

  it('uses TinyMCE already on the page', async () => {
    window.tinymce = fake;
    expect(await loadTinyMce('/tinymce')).toBe(fake);
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('fails, removes its script and allows a retry when the script does not load', async () => {
    scriptLoads(false);
    await expect(loadTinyMce('/tinymce')).rejects.toThrow('could not be loaded');
    expect(document.head.querySelector('script')).toBeNull();
    scriptLoads(true);
    expect(await loadTinyMce('/tinymce')).toBe(fake);
  });

  it('builds the core script URL from the base URL', () => {
    expect(tinyMceScriptUrl('/_resources/x/tinymce')).toBe('/_resources/x/tinymce/tinymce.min.js');
  });
});
