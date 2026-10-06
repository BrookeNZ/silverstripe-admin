import { describe, expect, it } from 'vitest';
import { errorMessage } from './request';

describe('errorMessage', () => {
  it('prefers the message of the JSON error envelope', () => {
    expect(errorMessage({ status: 'error', errors: [{ code: 403, value: 'No delete permissions' }] }, 403)).toBe('No delete permissions');
  });

  it('reads an ended session from a 401 or a 403 asking to reauthenticate', () => {
    expect(errorMessage(null, 401)).toMatch(/session may have expired/);
    expect(errorMessage(null, 403, true)).toMatch(/session may have expired/);
  });

  it('reads a plain 403 as a missing permission', () => {
    expect(errorMessage(null, 403)).toBe('You do not have permission to see this list.');
  });

  it('names the status for anything else', () => {
    expect(errorMessage(null, 500)).toBe('The grid could not be loaded (500).');
  });
});
