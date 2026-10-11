/**
 * A page form's Title, which keeps the URL segment in step as legacy's Title entwine did. When a Title
 * change is committed (on blur, legacy's change event), a page that has never been published and still
 * has the default segment ("new-page") takes the segment `suggest` answers for the new title; any other
 * page shows an "Update URL" button after the input that does the same on demand. The same commit moves
 * MenuTitle and MetaTitle along when they still matched the previous title, and relabels the section
 * header through the draft title store (draftTitle.ts).
 *
 * `titleFieldSchema()` is the `updateFormSchema` handler that routes a page form's Title here, and only
 * when the form has an editable URL segment field, whose name, suggest URL and default segment it copies
 * into the Title's `data.urlSegment`. Elsewhere Title stays the shell's TextField.
 */
import * as React from 'react';
import { Button, describedBy, FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps, FieldSchema, FormSchemaTree, PiletApi } from '@silverstripe/admin-shell';
import type { JsonRequest } from './api';
import type { DraftTitleStore } from './draftTitle';
import { failureMessage, isAbort, siteTreeURLSegmentFieldClass, suggestSegment, text } from './urlSegment';
import './site-tree-title-field.css';

export const siteTreeTitleFieldName = 'SiteTreeTitleField';

interface UrlSegmentLink {
  name: string;
  suggestUrl: string;
  defaultUrl: string;
}

function urlSegmentLink(data: unknown): UrlSegmentLink | null {
  const link = (data as { urlSegment?: Partial<UrlSegmentLink> } | null)?.urlSegment;
  return link?.name && link.suggestUrl ? { name: link.name, suggestUrl: link.suggestUrl, defaultUrl: text(link.defaultUrl) } : null;
}

function findField(fields: ReadonlyArray<FieldSchema>, match: (field: FieldSchema) => boolean): FieldSchema | null {
  for (const field of fields) {
    if (match(field)) {
      return field;
    }
    const found = findField(field.children ?? [], match);
    if (found) {
      return found;
    }
  }
  return null;
}

function withTitle(fields: Array<FieldSchema>, replace: (field: FieldSchema) => FieldSchema): Array<FieldSchema> {
  return fields.map((field) =>
    field.name === 'Title' && !field.children?.length ? replace(field) : field.children?.length ? { ...field, children: withTitle(field.children, replace) } : field,
  );
}

export function titleFieldSchema(schema: FormSchemaTree): FormSchemaTree {
  const segment = findField(schema.fields, (field) => Boolean(field.componentCandidates?.includes(siteTreeURLSegmentFieldClass)));
  const segmentData = segment && !Array.isArray(segment.data) ? segment.data : {};
  const title = findField(schema.fields, (field) => field.name === 'Title');
  if (!segment || !segmentData.suggestUrl || !title || title.readOnly || title.disabled) {
    return schema;
  }
  const link: UrlSegmentLink = { name: segment.name, suggestUrl: text(segmentData.suggestUrl), defaultUrl: text(segmentData.defaultUrl) };
  return {
    ...schema,
    fields: withTitle(schema.fields, (field) => ({
      ...field,
      componentCandidates: [siteTreeTitleFieldName, ...(field.componentCandidates ?? [])],
      data: { ...(Array.isArray(field.data) ? {} : field.data), urlSegment: link },
    })),
  };
}

interface TitleFieldOptions {
  request: JsonRequest;
  useFormFieldValue: PiletApi['useFormFieldValue'];
  draftTitle: DraftTitleStore;
}

export const createSiteTreeTitleField = ({ request, useFormFieldValue, draftTitle }: TitleFieldOptions) => {
  const SiteTreeTitleField = ({ field, value, onChange, onBlur, error, autofill }: FieldComponentProps) => {
    const link = urlSegmentLink(field.data);
    const segment = text(useFormFieldValue(link?.name ?? ''));
    const liveLink = useFormFieldValue('LiveLink');
    const pageId = Number(useFormFieldValue('ID'));
    const followers = { MenuTitle: useFormFieldValue('MenuTitle'), MetaTitle: useFormFieldValue('MetaTitle') };
    const title = text(value);
    const committed = React.useRef(title);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const pending = React.useRef<AbortController | null>(null);
    const [offerUpdate, setOfferUpdate] = React.useState(false);
    const [updating, setUpdating] = React.useState(false);
    const [updateError, setUpdateError] = React.useState('');

    React.useEffect(() => () => pending.current?.abort(), []);

    React.useEffect(
      () => () => {
        if (draftTitle.get()?.pageId === pageId) {
          draftTitle.set(null);
        }
      },
      [pageId],
    );

    const updateSegment = async (from: string) => {
      if (!link) {
        return;
      }
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setUpdating(true);
      setUpdateError('');
      try {
        autofill(link.name, await suggestSegment(request, link.suggestUrl, from, controller.signal));
        setOfferUpdate(false);
      } catch (failure) {
        if (!isAbort(failure)) {
          setUpdateError(failureMessage(failure));
        }
      } finally {
        if (pending.current === controller) {
          setUpdating(false);
        }
      }
    };

    const commit = () => {
      onBlur();
      if (!link || title === committed.current) {
        return;
      }
      const previous = committed.current;
      committed.current = title;
      const unpublished = liveLink === '' || liveLink === null;
      if (unpublished && link.defaultUrl !== '' && segment.startsWith(link.defaultUrl)) {
        void updateSegment(title);
      } else {
        setOfferUpdate(true);
      }
      Object.entries(followers).forEach(([name, follower]) => {
        if (follower !== undefined && text(follower) === previous) {
          autofill(name, title);
        }
      });
      if (pageId > 0) {
        draftTitle.set(title === '' ? null : { pageId, title });
      }
    };

    const message = updateError || error;
    return (
      <FieldHolder field={field} error={message || undefined} labelFor={field.id}>
        <div className="pages-title-field">
          <input
            ref={inputRef}
            className="admin-field__control pages-title-field__input"
            id={field.id}
            name={field.name}
            type="text"
            maxLength={field.maxLength ?? undefined}
            value={title}
            aria-invalid={message ? true : undefined}
            aria-describedby={describedBy(field, message || undefined)}
            onChange={(event) => onChange(event.target.value)}
            onBlur={commit}
          />
          {offerUpdate && (
            <Button
              loading={updating}
              onClick={async () => {
                await updateSegment(title);
                inputRef.current?.focus();
              }}
            >
              Update URL
            </Button>
          )}
        </div>
      </FieldHolder>
    );
  };
  return SiteTreeTitleField;
};
