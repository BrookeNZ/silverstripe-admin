import type { PiletApi } from '@silverstripe/admin-shell';
import { createAnchorSelectorField } from './AnchorSelectorField';
import { createHtmlEditorField, editorAnchors } from './HtmlEditorField';
import { InsertLinkModal, insertLinkModal } from './LinkDialog';
import './htmleditor.css';

// The schema component `SilverStripe\TinyMCE\TinyMCEConfig` declares; a project config class with its own name registers that
export const editorComponent = 'TinyMceHtmlEditorField';

export function setup(api: PiletApi) {
  api.registerSilverstripeComponent(editorComponent, createHtmlEditorField({ api }));
  api.registerSilverstripeComponent('AnchorSelectorField', createAnchorSelectorField(() => editorAnchors.current));
  api.registerModal(insertLinkModal, InsertLinkModal, undefined, { header: 'Insert link', focusHeading: true });
}
