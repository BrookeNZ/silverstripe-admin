import type { PiletApi } from '@silverstripe/admin-shell';
import { createHtmlEditorField } from './HtmlEditorField';
import type { HtmlEditorPiletApi } from './shell';
import './htmleditor.css';

// The schema component `SilverStripe\TinyMCE\TinyMCEConfig` declares; a project config class with its own name registers that
export const editorComponent = 'TinyMceHtmlEditorField';

export function setup(api: PiletApi) {
  api.registerSilverstripeComponent(editorComponent, createHtmlEditorField({ api: api as HtmlEditorPiletApi }));
}
