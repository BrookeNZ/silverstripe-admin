// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Alert } from './Alert';
import type { AlertType } from './Alert';
import { mount } from './test/render';

describe('Alert', () => {
  it.each<[AlertType, string, string]>([
    ['info', 'Information', 'status'],
    ['success', 'Success', 'status'],
    ['warning', 'Warning', 'alert'],
    ['error', 'Error', 'alert'],
  ])('draws the %s icon, named %s, as a %s', (type, label, role) => {
    const alert = mount(<Alert type={type}>Saved</Alert>);
    expect(alert.className).toBe(`admin-alert admin-alert--${type}`);
    expect(alert.getAttribute('role')).toBe(role);
    const icon = alert.querySelector('svg.admin-alert__icon')!;
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe(label);
    expect(alert.querySelector('.admin-alert__message')?.textContent).toBe('Saved');
  });
});
