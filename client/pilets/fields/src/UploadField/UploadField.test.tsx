// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PiletApi } from '@silverstripe/admin-shell';
import { connectConfig } from '../legacy/Config';
import UploadField from './UploadField';
import type { UploadFieldValue } from './UploadField';
import { fileMeta, uploadFile, UploadError } from './uploadFile';

vi.mock('./uploadFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./uploadFile')>()),
  uploadFile: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const upload = vi.mocked(uploadFile);
let container: HTMLDivElement;

const existing = { id: 5, title: 'Templates', extension: 'png', size: 40789, category: 'image', exists: true, smallThumbnail: '/assets/t.png' };

function field(data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    id: 'Form_EditForm_HeroImage',
    name: 'HeroImage',
    key: 'HeroImage',
    title: 'Hero image',
    description: 'JPG, PNG or SVG',
    schemaType: 'Custom',
    component: 'UploadField',
    value: null,
    message: null,
    source: [],
    children: [],
    data: { endpoints: { createFile: { url: 'admin/pages/edit/EditForm/15/field/HeroImage/upload/' } }, multi: false, canUpload: true, maxFilesize: 2, files: [], ...data },
    ...extra,
  } as any;
}

const Harness = ({ initial, schema, onValue, error }: { initial: UploadFieldValue; schema: any; onValue?(value: UploadFieldValue): void; error?: string }) => {
  const [value, setValue] = React.useState<UploadFieldValue | null>(initial);
  return (
    <UploadField
      field={schema}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next as UploadFieldValue);
      }}
      onBlur={() => undefined}
      error={error}
      submitting={false}
      renderFields={() => null}
      autofill={() => undefined}
    />
  );
};

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
  return container;
}

async function chooseFile(root: HTMLElement, file: File) {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  connectConfig({ getConfig: () => ({ SecurityID: 'token' }) } as unknown as PiletApi);
  upload.mockReset();
});

afterEach(() => container.remove());

describe('UploadField', () => {
  it('lists the attached files from the schema state, named for the controls that act on them', () => {
    const root = render(<Harness initial={{ Files: [5] }} schema={field({ files: [existing] })} />);
    const group = root.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-labelledby')).toBe('Form_EditForm_HeroImage_label');
    expect(document.getElementById('Form_EditForm_HeroImage_label')?.textContent).toBe('Hero image');
    expect(group.getAttribute('aria-describedby')).toBe('Form_EditForm_HeroImage_description');
    expect(root.querySelector('.upload-field__name')?.textContent).toBe('Templates');
    expect(root.querySelector('.upload-field__meta')?.textContent).toBe('PNG, 40 KB');
    expect(root.querySelector('.upload-field__file img')?.getAttribute('src')).toBe('/assets/t.png');
    expect(root.querySelector('button.upload-field__action svg')?.getAttribute('aria-label')).toBe('Remove Templates');
    expect(root.querySelector('a.upload-field__action')?.getAttribute('href')).toMatch(/admin\/assets\/edit\/5$/);
    // A single-file field with a file has no room for another
    expect(root.querySelector('.upload-field__dropzone')).toBeNull();
  });

  it('uploads a chosen file to the field endpoint, busy while it runs, and posts its id', async () => {
    let finish: (file: any) => void = () => undefined;
    upload.mockImplementation((_url, _file, _token, onProgress) => {
      onProgress(0.5);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const onValue = vi.fn();
    const root = render(<Harness initial={{ Files: [] }} schema={field()} onValue={onValue} />);
    expect(root.querySelector('.upload-field__upload')?.textContent).toBe('Upload new');

    await chooseFile(root, new File(['x'], 'fields-test.png', { type: 'image/png' }));
    expect(upload).toHaveBeenCalledWith('admin/pages/edit/EditForm/15/field/HeroImage/upload/', expect.any(File), 'token', expect.any(Function));
    expect(root.querySelector('[role="group"]')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('progress')?.getAttribute('aria-label')).toBe('Uploading fields-test.png');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Uploading fields-test.png');

    await act(async () => finish({ id: 64, name: 'fields-test.png', extension: 'png', size: 73, category: 'image' }));
    expect(onValue).toHaveBeenLastCalledWith({ Files: [64] });
    expect(root.querySelector('[role="group"]')?.hasAttribute('aria-busy')).toBe(false);
    expect(root.querySelector('.upload-field__name')?.textContent).toBe('fields-test.png');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Uploaded fields-test.png');
  });

  it('shows the server refusal as the field message and describes the group with it', async () => {
    upload.mockRejectedValue(new UploadError("Extension 'json' is not allowed"));
    const onValue = vi.fn();
    const root = render(<Harness initial={{ Files: [] }} schema={field()} onValue={onValue} />);
    await chooseFile(root, new File(['{}'], 'schema.json'));
    const message = document.getElementById('Form_EditForm_HeroImage_message');
    expect(message?.textContent).toBe("Extension 'json' is not allowed");
    expect(root.querySelector('[role="group"]')?.getAttribute('aria-describedby')).toContain('Form_EditForm_HeroImage_message');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('refuses a file over the size limit without posting it', async () => {
    const root = render(<Harness initial={{ Files: [] }} schema={field({ maxFilesize: 0.000001 })} />);
    await chooseFile(root, new File(['too big'], 'big.png'));
    expect(upload).not.toHaveBeenCalled();
    expect(document.getElementById('Form_EditForm_HeroImage_message')?.textContent).toBe('big.png is larger than 0.000001 MB');
  });

  it('detaches a removed file and moves focus to the upload button', async () => {
    const onValue = vi.fn();
    const root = render(<Harness initial={{ Files: [5] }} schema={field({ files: [existing] })} onValue={onValue} />);
    await act(async () => root.querySelector<HTMLButtonElement>('button.upload-field__action')!.click());
    expect(onValue).toHaveBeenLastCalledWith({ Files: [] });
    expect(root.querySelector('.upload-field__file')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('.upload-field__upload'));
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Removed Templates');
  });

  it('offers no upload or remove on a read-only field', () => {
    const root = render(<Harness initial={{ Files: [5] }} schema={field({ files: [existing], multi: true }, { readOnly: true })} />);
    expect(root.querySelector('.upload-field__dropzone')).toBeNull();
    expect(root.querySelector('button.upload-field__action')).toBeNull();
    expect(root.querySelector('a.upload-field__action')).not.toBeNull();
  });

  it('shows a validation error the form hands it', () => {
    render(<Harness initial={{ Files: [] }} schema={field()} error="Hero image is required" />);
    expect(document.getElementById('Form_EditForm_HeroImage_message')?.textContent).toBe('Hero image is required');
  });
});

describe('fileMeta', () => {
  it('formats the extension and size as the design meta line', () => {
    expect(fileMeta({ extension: 'jpg', size: 185344 })).toBe('JPG, 181 KB');
    expect(fileMeta({ extension: 'png', size: 73 })).toBe('PNG, 73 B');
    expect(fileMeta({ size: 3 * 1024 * 1024 })).toBe('3.0 MB');
  });
});
