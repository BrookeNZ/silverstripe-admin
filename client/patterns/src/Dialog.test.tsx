// @vitest-environment happy-dom
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
  return container;
}

afterEach(() => container.remove());

const noop = () => undefined;

describe('Dialog', () => {
  it('focuses the control marked data-autofocus when it opens', () => {
    const root = render(
      <Dialog
        open
        onClose={noop}
        header="Archive block?"
        footer={
          <>
            <button type="button">Archive</button>
            <button type="button" data-autofocus>
              Cancel
            </button>
          </>
        }
      />,
    );
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cancel');
  });

  it('focuses the heading when asked to, for a body still loading', () => {
    const root = render(<Dialog open focusHeading onClose={noop} header="Edit link" footer={<button type="button">Cancel</button>} />);
    expect(document.activeElement).toBe(root.querySelector('.admin-dialog__title'));
    expect(root.querySelector('.admin-dialog__title')?.getAttribute('tabindex')).toBe('-1');
  });

  it('shows an alert at the top of the body', () => {
    const root = render(<Dialog open onClose={noop} header="Add a block" alert="The block could not be added: Server error" body="Pick a type" />);
    const alert = root.querySelector('.admin-dialog__body')?.firstElementChild;
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('The block could not be added: Server error');
  });

  it('renders each slot in its region and is labelled by the header', () => {
    const root = render(<Dialog open onClose={noop} header="Delete page?" body="It goes for good." footer={<button type="button">Delete</button>} />);
    const dialog = root.querySelector('dialog')!;
    const title = dialog.querySelector('.admin-dialog__title')!;
    expect(title.tagName).toBe('H2');
    expect(title.textContent).toBe('Delete page?');
    expect(dialog.querySelector('.admin-dialog__body')?.textContent).toBe('It goes for good.');
    expect(dialog.querySelector('.admin-dialog__actions button')?.textContent).toBe('Delete');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.id).not.toBe('');
  });

  it('gives two dialogs distinct title ids', () => {
    const root = render(
      <>
        <Dialog open={false} onClose={noop} header="First" />
        <Dialog open={false} onClose={noop} header="Second" />
      </>,
    );
    const labels = Array.from(root.querySelectorAll('dialog')).map(
      (dialog) => document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(labels).toEqual(['First', 'Second']);
  });

  it('opens modally while open and closes when open turns false', () => {
    const Host = ({ open }: { open: boolean }) => <Dialog open={open} onClose={noop} header="Title" />;
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Host open />));
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    act(() => root.render(<Host open={false} />));
    expect(dialog.open).toBe(false);
  });

  it('calls onClose on Escape and stays open until the host closes it', () => {
    const onClose = vi.fn();
    const dialog = render(<Dialog open onClose={onClose} header="Title" />).querySelector('dialog')!;
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
  });
});

describe('UnsavedChangesDialog', () => {
  it('keeps its text and buttons, and Escape means stay', () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    const dialog = render(<UnsavedChangesDialog open onStay={onStay} onLeave={onLeave} />).querySelector('dialog')!;
    expect(dialog.querySelector('.admin-dialog__title')?.textContent).toBe('You have unsaved changes');
    expect(dialog.querySelector('.admin-dialog__body')?.textContent).toBe(
      'Your changes have not been saved. If you leave this page now, they will be lost.',
    );
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.admin-dialog__actions button'));
    expect(buttons.map((button) => [button.textContent, button.className])).toEqual([
      ['Stay on this page', 'admin-button admin-button--primary'],
      ['Leave without saving', 'admin-button'],
    ]);
    act(() => buttons[1].click());
    expect(onLeave).toHaveBeenCalledTimes(1);
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});
