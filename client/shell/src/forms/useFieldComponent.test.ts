import { describe, expect, it } from 'vitest';
import type { GlobalState } from 'piral-core';
import { silverstripePlugin } from '../test/silverstripePlugin';
import { isFullWidthInRegistry, resolveInRegistry } from './useFieldComponent';

type RegistryExtensions = GlobalState['registry']['extensions'];

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
  const api = silverstripePlugin(context)(piletApi, { name: 'fields' });
  return { api, extensions: () => ({ ...extensions }) as unknown as RegistryExtensions };
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

describe('isFullWidthInRegistry', () => {
  // Piral keeps the registered component as the registration's reference
  function registrationShell() {
    const extensions: Record<string, Array<{ reference: unknown }>> = {};
    const context = { on() {}, readState: (read: (state: unknown) => unknown) => read({ registry: { extensions } }) };
    const piletApi = {
      registerExtension(slot: string, reference: unknown) {
        extensions[slot] = [...(extensions[slot] ?? []), { reference }];
        return () => {
          extensions[slot] = extensions[slot].filter((registration) => registration.reference !== reference);
        };
      },
    };
    const api = silverstripePlugin(context)(piletApi, { name: 'grid' });
    return { api, extensions: () => ({ ...extensions }) as unknown as RegistryExtensions };
  }

  const field = { component: 'GridField', schemaType: 'Custom', componentCandidates: ['GridField'] };

  it('follows the fullWidth flag of the latest registration', () => {
    const shell = registrationShell();
    expect(isFullWidthInRegistry(field, shell.extensions())).toBe(false);

    shell.api.registerSilverstripeComponent('GridField', Object.assign(() => null, { fullWidth: true }));
    expect(isFullWidthInRegistry(field, shell.extensions())).toBe(true);

    const dispose = shell.api.registerSilverstripeComponent('GridField', () => null);
    expect(isFullWidthInRegistry(field, shell.extensions())).toBe(false);

    dispose();
    expect(isFullWidthInRegistry(field, shell.extensions())).toBe(true);
  });
});
