// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TinyMCE } from 'tinymce';
import { loadTinyMce, resetTinyMceLoader } from './loadTinyMce';

const fake = { majorVersion: '6' } as unknown as TinyMCE;

// happy-dom answers a script request at once: "load" when it treats disabled loading as success, else "error"
function scriptLoads(success: boolean) {
  const settings = (window as unknown as { happyDOM: { settings: Record<string, boolean> } }).happyDOM.settings;
  settings.disableJavaScriptFileLoading = true;
  settings.handleDisabledFileLoadingAsSuccess = success;
}

const noBundle = () => Promise.reject(new Error('The chunk could not be loaded'));

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
  it('loads the bundle once and resolves with the global it defines, without a script', async () => {
    const bundle = vi.fn(async () => {
      defineGlobal();
    });
    const [first, second] = await Promise.all([loadTinyMce('/tinymce', bundle), loadTinyMce('/tinymce', bundle)]);
    expect(first).toBe(fake);
    expect(second).toBe(fake);
    expect(await loadTinyMce('/tinymce', bundle)).toBe(fake);
    expect(bundle).toHaveBeenCalledTimes(1);
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('falls back to the core script when the bundle does not load', async () => {
    scriptLoads(true);
    expect(await loadTinyMce('/tinymce', noBundle)).toBe(fake);
    expect(document.head.querySelector('script[data-silverstripe-tinymce]')!.getAttribute('src')).toBe('/tinymce/tinymce.min.js');
  });

  it('falls back to the core script when the bundle loads without defining TinyMCE', async () => {
    scriptLoads(true);
    expect(await loadTinyMce('/tinymce', async () => undefined)).toBe(fake);
    expect(document.head.querySelectorAll('script[data-silverstripe-tinymce]')).toHaveLength(1);
  });

  it('adds the core script once and resolves with the global it defines', async () => {
    scriptLoads(true);
    expect(await loadTinyMce('/tinymce/', noBundle)).toBe(fake);
    expect(await loadTinyMce('/tinymce', noBundle)).toBe(fake);
    const scripts = document.head.querySelectorAll('script[data-silverstripe-tinymce]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute('src')).toBe('/tinymce/tinymce.min.js');
  });

  it('uses TinyMCE already on the page', async () => {
    window.tinymce = fake;
    expect(await loadTinyMce('/tinymce', noBundle)).toBe(fake);
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('fails, removes its script and allows a retry when neither the bundle nor the script loads', async () => {
    scriptLoads(false);
    await expect(loadTinyMce('/tinymce', noBundle)).rejects.toThrow('could not be loaded');
    expect(document.head.querySelector('script')).toBeNull();
    scriptLoads(true);
    expect(await loadTinyMce('/tinymce', noBundle)).toBe(fake);
  });
});
