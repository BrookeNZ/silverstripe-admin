import { describe, expect, it } from 'vitest';
import { resolveFieldComponent } from './resolve';

const registry = (...names: Array<string>) => (name: string) => names.includes(name);

describe('resolveFieldComponent', () => {
  it('takes the first registered candidate, most specific first', () => {
    const field = {
      component: 'SearchableDropdownField',
      schemaType: 'MultiSelect',
      componentCandidates: ['SilverStripe\\Forms\\SearchableMultiDropdownField', 'SearchableDropdownField'],
    };
    expect(resolveFieldComponent(field, registry('SearchableDropdownField'))).toEqual({ name: 'SearchableDropdownField' });
    expect(
      resolveFieldComponent(field, registry('SearchableDropdownField', 'SilverStripe\\Forms\\SearchableMultiDropdownField')),
    ).toEqual({ name: 'SilverStripe\\Forms\\SearchableMultiDropdownField' });
  });

  it('tries a componentless field\'s own class, then its type default, then its parent classes', () => {
    const field = {
      component: null,
      schemaType: 'Datetime',
      componentCandidates: ['SilverStripe\\Forms\\DatetimeField', 'SilverStripe\\Forms\\TextField', 'SilverStripe\\Forms\\FormField'],
    };
    expect(resolveFieldComponent(field, registry('DatetimeField', 'SilverStripe\\Forms\\TextField'))).toEqual({
      name: 'DatetimeField',
    });
    expect(resolveFieldComponent(field, registry('DatetimeField', 'SilverStripe\\Forms\\DatetimeField'))).toEqual({
      name: 'SilverStripe\\Forms\\DatetimeField',
    });
    expect(resolveFieldComponent(field, registry('SilverStripe\\Forms\\TextField'))).toEqual({
      name: 'SilverStripe\\Forms\\TextField',
    });
  });

  it('falls back to the schemaType default only when no component is named', () => {
    expect(resolveFieldComponent({ component: null, schemaType: 'Text' }, registry('TextField'))).toEqual({ name: 'TextField' });
    expect(
      resolveFieldComponent(
        { component: null, schemaType: 'Text', componentCandidates: ['SilverStripe\\Forms\\TextField'] },
        registry('TextField'),
      ),
    ).toEqual({ name: 'TextField' });
  });

  it('never gives a named but unregistered component the type default', () => {
    const field = {
      component: 'TreeDropdownField',
      schemaType: 'SingleSelect',
      componentCandidates: ['SilverStripe\\Forms\\TreeDropdownField', 'TreeDropdownField'],
    };
    expect(resolveFieldComponent(field, registry('SingleSelectField'))).toEqual({
      name: null,
      tried: field.componentCandidates,
    });
  });

  it('puts an instance component missing from the candidates first', () => {
    expect(
      resolveFieldComponent(
        { component: 'MarkdownField', schemaType: 'Text', componentCandidates: ['SilverStripe\\Forms\\TextField'] },
        registry('MarkdownField', 'SilverStripe\\Forms\\TextField'),
      ),
    ).toEqual({ name: 'MarkdownField' });
  });

  it('reports a field with neither component nor known type as missing', () => {
    expect(resolveFieldComponent({ component: null, schemaType: null }, registry('TextField'))).toEqual({ name: null, tried: [] });
  });

  it('renders a field with server HTML through the transitional field when nothing else resolves', () => {
    const field = {
      component: null,
      schemaType: null,
      componentCandidates: ['SilverStripe\\Forms\\GridField\\GridField', 'SilverStripe\\Forms\\FormField'],
      fallback: { html: '<div></div>' },
    };
    expect(resolveFieldComponent(field, registry('ServerHtmlField'))).toEqual({ name: 'ServerHtmlField' });
    expect(resolveFieldComponent(field, registry('ServerHtmlField', 'SilverStripe\\Forms\\GridField\\GridField'))).toEqual({
      name: 'SilverStripe\\Forms\\GridField\\GridField',
    });
  });

  it('shows the notice when the transitional field is unregistered or there is no HTML', () => {
    expect(resolveFieldComponent({ component: null, schemaType: null, fallback: { html: '<p></p>' } }, registry())).toEqual({
      name: null,
      tried: ['ServerHtmlField'],
    });
    expect(resolveFieldComponent({ component: null, schemaType: null, fallback: { html: '' } }, registry('ServerHtmlField'))).toEqual({
      name: null,
      tried: [],
    });
  });
});
