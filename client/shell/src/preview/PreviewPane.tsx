import * as React from 'react';
import { setPreviewBarSlot } from './barSlot';
import './preview.css';

export const PreviewPane = ({ url, title, full }: { url: string; title: string; full: boolean }) => (
  <aside className={full ? 'shell-preview shell-preview--full' : 'shell-preview'} aria-label="Preview">
    <iframe className="shell-preview__frame" src={url} title={`Preview of ${title}`} />
    {full && <div ref={setPreviewBarSlot} />}
  </aside>
);
