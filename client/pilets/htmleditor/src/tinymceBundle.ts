/**
 * TinyMCE as one lazy chunk of this pilet: the core, the silver theme, the dom model, the default icons
 * and the plugins `SilverStripe\TinyMCE\TinyMCEConfig` enables by default. Each registers itself on the
 * global `tinymce` the core defines, so the core import must stay first.
 *
 * TinyMCE skips the request for anything already registered, so the server's `theme_url` and
 * `external_plugins` entries for these names cost nothing, nor does the help plugin's English keyboard
 * guide. A plugin outside this list, the skin, other languages and the emoticons database still load
 * from `base_url`: the database stays separate because a config may name another one under the same id.
 *
 * The npm `tinymce` version must match the one `silverstripe/htmleditor-tinymce` ships, as the skin and
 * any plugin loaded from `base_url` come from there.
 */
import 'tinymce';
import 'tinymce/themes/silver';
import 'tinymce/models/dom';
import 'tinymce/icons/default';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/code';
import 'tinymce/plugins/emoticons';
import 'tinymce/plugins/help';
import 'tinymce/plugins/help/js/i18n/keynav/en';
import 'tinymce/plugins/image';
import 'tinymce/plugins/importcss';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/table';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/wordcount';
