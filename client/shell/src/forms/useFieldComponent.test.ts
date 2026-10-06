import { describe, expect, it } from 'vitest';
import { createSilverstripeApi } from '../api/silverstripe';
import { resolveInRegistry } from './useFieldComponent';

// Piral's own registry needs the app codegen a piral build produces, so a map stands in for it
function fakeShell() {
  const extensions: Record<string, Array<unknown>> = {};
  const context = { on() {}, readState: (read: (state: unknown) => unknown) => read({ registry: { extensions } }) };
  const piletApi = {
    registerExtension(slot: string, component: unknown) {
      extensions[slot] = [...(extensions[slot] ?? []), component];
      return () => {
        extensions[slot] = extensions[slot].filter((registered) => registered !== component);
      };
    },
  };
  const api = (createSilverstripeApi() as any)(context)(piletApi, { name: 'fields' });
  return { api, extensions: () => ({ ...extensions }) as any };
}

describe('resolveInRegistry', () => {
  it('re-resolves a field when a pilet registers its component late, and again when it is disposed', () => {
    const shell = fakeShell();
    const field = {
      component: 'TreeDropdownField',
      schemaType: 'SingleSelect',
      componentCandidates: ['SilverStripe\\Forms\\TreeDropdownField', 'TreeDropdownField'],
    };
    shell.api.registerSilverstripeComponent('SingleSelectField', () => null);
    expect(resolveInRegistry(field, shell.extensions()).name).toBeNull();

    const dispose = shell.api.registerSilverstripeComponent('TreeDropdownField', () => null);
    expect(resolveInRegistry(field, shell.extensions()).name).toBe('TreeDropdownField');

    dispose();
    expect(resolveInRegistry(field, shell.extensions()).name).toBeNull();
  });
});
