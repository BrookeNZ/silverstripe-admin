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

  it('lets a class registration reach subclasses that name no component', () => {
    const field = {
      component: null,
      schemaType: 'Text',
      componentCandidates: ['App\\Forms\\SlugField', 'SilverStripe\\Forms\\TextField', 'SilverStripe\\Forms\\FormField'],
    };
    expect(resolveFieldComponent(field, registry('TextField', 'SilverStripe\\Forms\\TextField'))).toEqual({
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
});
