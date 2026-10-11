/**
 * The upload queue: files picked or dropped into a folder, two posting at a time as legacy's Dropzone did, each
 * with its progress, or the reason it failed (refused here before posting, or by the server). It lives outside
 * the page, because opening or closing a file remounts the page while uploads carry on.
 *
 * A cancelled upload leaves the queue. A failed one stays until it is removed, as legacy's error tiles did. A
 * finished one stays until the folder's listing shows it (`dropListed`) or the folder, sort or page changes
 * (`purgeFinished`), so its tile does not blink out before the refetched listing draws the real one.
 */
import * as React from 'react';
import { checkUpload, createFile } from './createFile';
import type { CreatedFile, UploadRules } from './createFile';

export type UploadStatus = 'waiting' | 'uploading' | 'failed' | 'done';

export interface QueuedUpload {
  key: string;
  folderId: number;
  name: string;
  size: number;
  status: UploadStatus;
  /** 0 to 1 */
  progress: number;
  message: string | null;
  /** The new file's id once uploaded */
  fileId: number | null;
}

export interface UploadTarget {
  endpoint: string;
  folderId: number;
  rules: UploadRules;
  securityId: () => string;
  /** Called for each upload, refused, failed or done; not for one cancelled */
  onSettled: (upload: QueuedUpload) => void;
  /** Called once no upload into the folder is waiting or posting, with the files that arrived */
  onBatchDone: (folderId: number, created: ReadonlyArray<CreatedFile>) => void;
}

// Dropzone's default parallelUploads, which legacy left as it was
export const parallelUploads = 2;

let items: ReadonlyArray<QueuedUpload> = [];
const listeners = new Set<() => void>();
const pending = new Map<string, { file: File; target: UploadTarget }>();
const controllers = new Map<string, AbortController>();
const batches = new Map<number, Array<CreatedFile>>();
let nextKey = 0;

function emit(next: ReadonlyArray<QueuedUpload>) {
  items = next;
  listeners.forEach((listener) => listener());
}

function update(key: string, changes: Partial<QueuedUpload>) {
  emit(items.map((item) => (item.key === key ? { ...item, ...changes } : item)));
}

function find(key: string): QueuedUpload | undefined {
  return items.find((item) => item.key === key);
}

function finishBatch(target: UploadTarget) {
  const busy = items.some((item) => item.folderId === target.folderId && (item.status === 'waiting' || item.status === 'uploading'));
  if (!busy && batches.has(target.folderId)) {
    const created = batches.get(target.folderId) ?? [];
    batches.delete(target.folderId);
    target.onBatchDone(target.folderId, created);
  }
}

function settle(key: string, target: UploadTarget, changes: Partial<QueuedUpload>) {
  update(key, changes);
  const settled = find(key);
  if (settled) {
    target.onSettled(settled);
  }
}

function startNext() {
  const running = items.filter((item) => item.status === 'uploading').length;
  const waiting = items.filter((item) => item.status === 'waiting').slice(0, Math.max(0, parallelUploads - running));
  waiting.forEach((item) => {
    const job = pending.get(item.key);
    if (!job) {
      return;
    }
    pending.delete(item.key);
    const controller = new AbortController();
    controllers.set(item.key, controller);
    update(item.key, { status: 'uploading' });
    createFile({
      endpoint: job.target.endpoint,
      file: job.file,
      folderId: item.folderId,
      securityId: job.target.securityId(),
      signal: controller.signal,
      onProgress: (progress) => update(item.key, { progress }),
    }).then(
      (created) => {
        batches.get(item.folderId)?.push(created);
        settle(item.key, job.target, { status: 'done', progress: 1, fileId: created.id, name: created.title });
      },
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          settle(item.key, job.target, { status: 'failed', message: error instanceof Error ? error.message : String(error) });
        }
      },
    ).finally(() => {
      controllers.delete(item.key);
      startNext();
      finishBatch(job.target);
    });
  });
}

/** Queue files for a folder; a file the rules refuse goes straight to failed, without posting */
export function addUploads(files: ReadonlyArray<File>, target: UploadTarget): ReadonlyArray<QueuedUpload> {
  const added: Array<QueuedUpload> = files.map((file) => {
    nextKey += 1;
    const refused = checkUpload(file, target.rules);
    return {
      key: `upload-${nextKey}`,
      folderId: target.folderId,
      name: file.name,
      size: file.size,
      status: refused ? 'failed' : 'waiting',
      progress: 0,
      message: refused,
      fileId: null,
    };
  });
  added.forEach((item, index) => {
    if (item.status === 'waiting') {
      pending.set(item.key, { file: files[index], target });
      if (!batches.has(target.folderId)) {
        batches.set(target.folderId, []);
      }
    }
  });
  emit([...items, ...added]);
  added.filter((item) => item.status === 'failed').forEach((item) => target.onSettled(item));
  startNext();
  return added;
}

/** Stop an upload that is waiting or posting, and take it off the queue */
export function cancelUpload(key: string) {
  const item = find(key);
  const job = pending.get(key);
  pending.delete(key);
  controllers.get(key)?.abort();
  emit(items.filter((candidate) => candidate.key !== key));
  if (item && job) {
    finishBatch(job.target);
  }
}

/** Take a failed upload off the queue */
export function removeUpload(key: string) {
  emit(items.filter((item) => item.key !== key));
}

/** Drop finished uploads the folder's listing now shows */
export function dropListed(folderId: number, listedIds: ReadonlyArray<number>) {
  const listed = new Set(listedIds);
  if (items.some((item) => item.folderId === folderId && item.status === 'done' && item.fileId !== null && listed.has(item.fileId))) {
    emit(items.filter((item) => !(item.folderId === folderId && item.status === 'done' && item.fileId !== null && listed.has(item.fileId))));
  }
}

/** Drop every finished upload, as legacy purged its queue on a new sort or folder */
export function purgeFinished() {
  if (items.some((item) => item.status === 'done')) {
    emit(items.filter((item) => item.status !== 'done'));
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => items;

/** The queue for one folder, in the order the files were added */
export function useUploads(folderId: number): ReadonlyArray<QueuedUpload> {
  const all = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return React.useMemo(() => all.filter((item) => item.folderId === folderId), [all, folderId]);
}

/** Empties the queue, aborting anything posting; for tests */
export function resetUploads() {
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  pending.clear();
  batches.clear();
  emit([]);
}
