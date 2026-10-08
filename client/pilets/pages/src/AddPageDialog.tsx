import * as React from 'react';
import { Button, Dialog, PageTypeIcon } from '@silverstripe/admin-patterns';
import type { CreatePageApi, PageType } from './api';

export interface AddPageDialogProps {
  open: boolean;
  parentId: number;
  client: Pick<CreatePageApi, 'types'>;
  creating: boolean;
  /** Why the last create failed, shown inside the dialog, which a toast would sit under */
  error: string | null;
  onCreate: (className: string) => void;
  onClose: () => void;
}

interface Choices {
  parentTitle: string | null;
  types: ReadonlyArray<PageType>;
}

interface PageTypeOptionProps {
  id: string;
  type: PageType;
  checked: boolean;
  onChoose: (className: string) => void;
}

// Rendered here rather than by OptionsetField, whose options carry a title only
const PageTypeOption = ({ id, type, checked, onChoose }: PageTypeOptionProps) => {
  const descriptionId = `${id}_description`;
  return (
    <div className="admin-field admin-field--inline">
      <input
        className="admin-field__check"
        type="radio"
        id={id}
        name="ClassName"
        value={type.className}
        checked={checked}
        aria-describedby={type.description ? descriptionId : undefined}
        onChange={() => onChoose(type.className)}
      />
      <label className="admin-field__option add-page__type" htmlFor={id}>
        {type.iconUrl ? <img className="admin-icon" src={type.iconUrl} alt="" /> : <PageTypeIcon />}
        {type.title}
      </label>
      {type.description && (
        <p className="admin-field__description add-page__description" id={descriptionId}>
          {type.description}
        </p>
      )}
    </div>
  );
};

/**
 * Offers the page types the server allows under the parent; the parent is the open page, or the top level.
 * Replaces CMSMain's AddForm, which answers with a redirect
 */
export const AddPageDialog = ({ open, parentId, client, creating, error, onCreate, onClose }: AddPageDialogProps) => {
  const [choices, setChoices] = React.useState<Choices | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [chosen, setChosen] = React.useState<string | null>(null);
  const fieldId = React.useId();
  const [shownFor, setShownFor] = React.useState({ open, parentId, client });
  // Each opening, and a new parent while open, starts from an empty list
  if (shownFor.open !== open || shownFor.parentId !== parentId || shownFor.client !== client) {
    setShownFor({ open, parentId, client });
    if (open) {
      setChoices(null);
      setLoadError(null);
      setChosen(null);
    }
  }

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    let current = true;
    client.types(parentId).then(
      ({ parent, types, defaultType }) => {
        if (current) {
          setChoices({ parentTitle: parent?.title ?? null, types });
          setChosen(types.find((type) => type.className === defaultType)?.className ?? types[0]?.className ?? null);
        }
      },
      (failure: unknown) => current && setLoadError(failure instanceof Error ? failure.message : String(failure)),
    );
    return () => {
      current = false;
    };
  }, [open, parentId, client]);

  const parentLabel = choices?.parentTitle ? `Under "${choices.parentTitle}"` : 'Top level';
  let body: React.ReactNode = null;
  if (choices && choices.types.length === 0) {
    body = <p>{parentLabel}: no page type can be added here.</p>;
  } else if (choices) {
    body = (
      <>
        <p>{parentLabel}</p>
        <fieldset className="admin-field__choices" disabled={creating}>
          <legend className="admin-field__label">Page type</legend>
          {choices.types.map((type, index) => (
            <PageTypeOption
              key={type.className}
              id={`${fieldId}_${index}`}
              type={type}
              checked={chosen === type.className}
              onChoose={setChosen}
            />
          ))}
        </fieldset>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      header="Add page"
      alert={error ?? loadError}
      focusHeading={!choices}
      body={body}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={creating} aria-disabled={!chosen || undefined} onClick={() => chosen && onCreate(chosen)}>
            Create
          </Button>
        </>
      }
    />
  );
};
