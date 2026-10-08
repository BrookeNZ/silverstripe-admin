/**
 * Asset admin's ProportionConstraintField, which ImageFormFactory makes of the insert form's Width and
 * Height group: typing a positive whole number in one sets the other from the image's ratio
 * (`data.ratio`, width over height). A dimension left empty or not positive resets both to the default
 * width (the original width, else 600, never wider than the original), as does an empty Width on load,
 * since the server blanks both so the client picks the insert size.
 *
 * Legacy also listed the image size presets from asset admin's insert modal state, which the shell does
 * not have, so they are left out and the default width ignores a default preset.
 */
import * as React from 'react';
import type { FieldComponentProps, FormField } from '../types';

const fallbackWidth = 600;

const positiveInteger = (text: string) => {
  const number = Number.parseInt(text, 10);
  return number > 0 ? number : null;
};

function defaultWidth(originalWidth: number | null): number {
  const width = originalWidth || fallbackWidth;
  return originalWidth && originalWidth < width ? originalWidth : width;
}

export const ProportionConstraintField = ({ field, renderFields, autofill }: FieldComponentProps) => {
  const [width, height] = field.children as Array<FormField | undefined>;
  const ratio = Number(field.data.ratio) || 1;
  const originalWidth = Number(field.data.originalWidth) || null;

  const sync = React.useCallback(
    (changed: FormField | undefined, size: number) => {
      if (!width || !height) {
        return;
      }
      const other = changed === width ? height : width;
      autofill(changed === width ? width.name : height.name, size);
      autofill(other.name, Math.round(changed === width ? size / ratio : size * ratio));
    },
    [width, height, ratio, autofill],
  );

  const reset = React.useCallback(() => sync(width, defaultWidth(originalWidth)), [sync, width, originalWidth]);

  React.useEffect(() => {
    if (width && !positiveInteger(String(width.value ?? ''))) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on load only; later empty values reset on blur
  }, []);

  const dimensionOf = (target: EventTarget) => field.children.find((child) => child.id === (target as HTMLElement).id);

  const onChange = (event: React.ChangeEvent<HTMLElement>) => {
    const changed = dimensionOf(event.target);
    const size = positiveInteger((event.target as HTMLInputElement).value);
    if (changed && size) {
      sync(changed, size);
    }
  };

  const onBlur = (event: React.FocusEvent<HTMLElement>) => {
    if (dimensionOf(event.target) && !positiveInteger((event.target as HTMLInputElement).value)) {
      reset();
    }
  };

  return (
    <div className="admin-group admin-group--row" id={field.holderId} onChange={onChange} onBlur={onBlur}>
      {renderFields(field.children)}
    </div>
  );
};
