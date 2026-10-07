/**
 * A filterable select after the WAI-ARIA combobox pattern with a listbox popup. Focus stays on the
 * text input and aria-activedescendant names the active option, so arrow keys, Home, End, Enter and
 * Escape all work from the input. Single or multiple: multiple shows each choice as a token with its
 * own remove button and keeps the list open. Options come from `options`, filtered by label as the
 * user types, or from `loadOptions`, called with the typed text and marking the listbox busy until it
 * resolves; a stale answer is dropped. With `searchable` off the input is read-only and typing jumps
 * to the option whose label starts with the typed letters. A searchable single select empties its input
 * while focused, as react-select does, so typing starts a fresh search; the chosen label shows as the
 * placeholder until the user types, and returns as the value on blur.
 *
 * When the options change under the active one (a tree stepping into a node), the first option becomes
 * active. A tabbable control in the popup `header` is reached with Tab from the input, which then keeps
 * the list open; Escape there closes it and returns to the input.
 *
 * The value is controlled through `value` and `onChange`, or uncontrolled from `defaultValue`; it is
 * the option objects themselves, read through `getOptionValue` and `getOptionLabel` (`value` and
 * `label` by default). Tab closes the list without choosing, unlike react-select, which this replaces.
 * Text is passed in (`noOptionsMessage`, `clearLabel`, `removeLabel`) because the package has no
 * translations of its own.
 */
import * as React from 'react';
import { RemoveIcon, ShowOptionsIcon } from './icons';

export interface ComboboxOptionState {
  active: boolean;
  selected: boolean;
  inputValue: string;
}

export interface ComboboxProps<T> {
  id?: string;
  name?: string;
  className?: string;
  options?: ReadonlyArray<T>;
  loadOptions?(inputValue: string): Promise<ReadonlyArray<T>>;
  multiple?: boolean;
  value?: T | null | ReadonlyArray<T>;
  defaultValue?: T | null | ReadonlyArray<T>;
  /** Receives the chosen option, or null, or the array of options when `multiple` */
  onChange?(value: T | null | T[]): void;
  onInputChange?(inputValue: string): void;
  onOpenChange?(open: boolean): void;
  /** Runs before the built-in keys; call `preventDefault()` to handle a key yourself, and `activate` to choose the active option once the options have changed */
  onKeyDown?(event: React.KeyboardEvent<HTMLInputElement>, activeOption: T | undefined, activate: (option: T) => void): void;
  getOptionValue?(option: T): string | number;
  getOptionLabel?(option: T): string;
  isOptionDisabled?(option: T): boolean;
  filterOption?(option: T, inputValue: string): boolean;
  renderOption?(option: T, state: ComboboxOptionState): React.ReactNode;
  /** Shown above the options inside the popup */
  header?: React.ReactNode;
  searchable?: boolean;
  clearable?: boolean;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  noOptionsMessage?: string | ((inputValue: string) => string);
  loadingMessage?: string;
  /** Read out through the status line while the list is open, such as the level a tree has moved to */
  statusMessage?: string;
  clearLabel?: string;
  removeLabel?(optionLabel: string): string;
  inputRef?: React.Ref<HTMLInputElement>;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-errormessage'?: string;
}

type Move = 'next' | 'previous' | 'first' | 'last';

const TYPEAHEAD_RESET_MS = 500;

const tabbable = 'button:not([tabindex="-1"]), [href], input, [tabindex]:not([tabindex="-1"])';

const valueOf = (option: unknown) => (option as { value: string | number }).value;
const labelOf = (option: unknown) => String((option as { label?: unknown }).label ?? '');
const neverDisabled = () => false;
const removeText = (optionLabel: string) => `Remove ${optionLabel}`;

export const Combobox = <T,>({
  id,
  name,
  className,
  options = [],
  loadOptions,
  multiple = false,
  value,
  defaultValue = null,
  onChange,
  onInputChange,
  onOpenChange,
  onKeyDown,
  getOptionValue = valueOf,
  getOptionLabel = labelOf,
  isOptionDisabled = neverDisabled,
  filterOption,
  renderOption,
  header,
  searchable = true,
  clearable = false,
  loading = false,
  placeholder,
  disabled = false,
  readOnly = false,
  required = false,
  noOptionsMessage = 'No options',
  loadingMessage = 'Loading',
  statusMessage = '',
  clearLabel = 'Clear',
  removeLabel = removeText,
  inputRef,
  ...aria
}: ComboboxProps<T>) => {
  const listboxId = `${React.useId()}listbox`;
  const ownInput = React.useRef<HTMLInputElement | null>(null);
  const popup = React.useRef<HTMLDivElement>(null);
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<ReadonlyArray<T> | null>(null);
  const [pending, setPending] = React.useState(false);
  const request = React.useRef(0);
  const typeahead = React.useRef({ text: '', at: 0 });

  const current = value === undefined ? uncontrolled : value;
  const selected: T[] = current == null ? [] : Array.isArray(current) ? [...current] : [current as T];
  const keyOf = (option: T) => String(getOptionValue(option));
  const selectedKeys = new Set(selected.map(keyOf));
  const matches = filterOption ?? ((option: T, text: string) => getOptionLabel(option).toLocaleLowerCase().includes(text.toLocaleLowerCase()));
  const visible = loadOptions ? loaded ?? [] : options.filter((option) => matches(option, inputValue));
  const enabled = visible.map((option, index) => (isOptionDisabled(option) ? -1 : index)).filter((index) => index >= 0);
  const keyedIndex = visible.findIndex((option) => keyOf(option) === activeKey);
  const activeIndex = keyedIndex < 0 && activeKey !== null ? enabled[0] ?? -1 : keyedIndex;
  const activeOption = activeIndex >= 0 ? visible[activeIndex] : undefined;
  const optionId = (index: number) => `${listboxId}-${index}`;
  const busy = loading || pending;
  const locked = disabled || readOnly;

  React.useEffect(() => {
    if (open && activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const setInput = (node: HTMLInputElement | null) => {
    ownInput.current = node;
    if (typeof inputRef === 'function') {
      inputRef(node);
    } else if (inputRef) {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }
  };

  const load = (text: string) => {
    if (!loadOptions) {
      return;
    }
    const ticket = ++request.current;
    setPending(true);
    const settle = (result: ReadonlyArray<T>) => {
      if (ticket === request.current) {
        setLoaded(result);
        setPending(false);
      }
    };
    loadOptions(text).then(settle, () => settle([]));
  };

  const setOpenState = (next: boolean) => {
    if (next !== open) {
      setOpen(next);
      onOpenChange?.(next);
    }
  };

  const openList = (start: 'first' | 'last' = 'first') => {
    if (locked) {
      return;
    }
    const chosen = enabled.find((index) => selectedKeys.has(keyOf(visible[index])));
    const fallback = start === 'first' ? enabled[0] : enabled[enabled.length - 1];
    const index = chosen ?? fallback;
    setActiveKey(index === undefined ? null : keyOf(visible[index]));
    setOpenState(true);
    if (loadOptions && loaded === null) {
      load(inputValue);
    }
  };

  const resetInput = () => {
    setEditing(false);
    if (inputValue) {
      setInputValue('');
      onInputChange?.('');
    }
  };

  const close = () => {
    setOpenState(false);
    resetInput();
  };

  const commit = (next: T[]) => {
    const result = multiple ? next : next[0] ?? null;
    if (value === undefined) {
      setUncontrolled(result);
    }
    onChange?.(result);
  };

  const choose = (option: T) => {
    if (isOptionDisabled(option)) {
      return;
    }
    if (!multiple) {
      commit([option]);
      close();
      return;
    }
    const key = keyOf(option);
    commit(selectedKeys.has(key) ? selected.filter((item) => keyOf(item) !== key) : [...selected, option]);
    resetInput();
  };

  const remove = (next: T[]) => {
    commit(next);
    ownInput.current?.focus();
  };

  const move = (to: Move) => {
    if (enabled.length === 0) {
      return;
    }
    const last = enabled.length - 1;
    const at = enabled.indexOf(activeIndex);
    const positions: Record<Move, number> = {
      first: 0,
      last,
      next: at < 0 ? 0 : Math.min(at + 1, last),
      previous: at < 0 ? last : Math.max(at - 1, 0),
    };
    setActiveKey(keyOf(visible[enabled[positions[to]]]));
  };

  const jumpTo = (character: string) => {
    const now = Date.now();
    const buffer = typeahead.current;
    buffer.text = now - buffer.at > TYPEAHEAD_RESET_MS ? character : buffer.text + character;
    buffer.at = now;
    const text = buffer.text.toLocaleLowerCase();
    const match = enabled.find((index) => getOptionLabel(visible[index]).toLocaleLowerCase().startsWith(text));
    if (match !== undefined) {
      setActiveKey(keyOf(visible[match]));
      setOpenState(true);
    }
  };

  const activate = (option: T) => setActiveKey(keyOf(option));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event, activeOption, activate);
    if (event.defaultPrevented || locked) {
      return;
    }
    const { key } = event;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList(key === 'ArrowDown' ? 'first' : 'last');
      } else if (event.altKey) {
        setOpenState(key === 'ArrowDown');
      } else {
        move(key === 'ArrowDown' ? 'next' : 'previous');
      }
    } else if ((key === 'Home' || key === 'End') && open) {
      event.preventDefault();
      move(key === 'Home' ? 'first' : 'last');
    } else if (key === 'Enter' && open) {
      event.preventDefault();
      if (activeOption) {
        choose(activeOption);
      }
    } else if (key === 'Escape' && (open || inputValue)) {
      event.preventDefault();
      close();
    } else if (key === 'Backspace' && multiple && !inputValue && selected.length) {
      commit(selected.slice(0, -1));
    } else if (key === 'Tab' && open && (event.shiftKey || !popup.current?.querySelector(tabbable))) {
      close();
    } else if (key === ' ' && !searchable) {
      event.preventDefault();
      if (!open) {
        openList();
      } else if (activeOption) {
        choose(activeOption);
      }
    } else if (!searchable && key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      jumpTo(key);
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setInputValue(text);
    setEditing(true);
    setActiveKey(null);
    setOpenState(true);
    onInputChange?.(text);
    load(text);
  };

  const handleControlMouseDown = (event: React.MouseEvent) => {
    const target = event.target as Element;
    if (locked || target.closest('button') || (open && searchable && target === ownInput.current)) {
      return;
    }
    event.preventDefault();
    ownInput.current?.focus();
    if (open) {
      close();
    } else {
      openList();
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      close();
    }
  };

  const handlePopupKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && event.target !== ownInput.current) {
      event.preventDefault();
      event.stopPropagation();
      close();
      ownInput.current?.focus();
    }
  };

  const selectedText = selected.map(getOptionLabel).join(', ');
  const searchesFresh = !multiple && searchable && focused && !locked;
  const shownText = multiple || editing || searchesFresh ? inputValue : selectedText;
  const shownPlaceholder = searchesFresh && selected.length ? selectedText : selected.length ? undefined : placeholder;
  const emptyText = typeof noOptionsMessage === 'function' ? noOptionsMessage(inputValue) : noOptionsMessage;
  const message = busy ? loadingMessage : visible.length === 0 ? emptyText : statusMessage;
  const blockClasses = ['admin-combobox', disabled && 'admin-combobox--disabled', className].filter(Boolean).join(' ');

  return (
    <div className={blockClasses} onBlur={handleBlur}>
      <div className="admin-combobox__control" onMouseDown={handleControlMouseDown}>
        <div className="admin-combobox__values">
          {multiple && selected.length > 0 && (
            <ul className="admin-combobox__tokens">
              {selected.map((option) => (
                <li className="admin-combobox__token" key={keyOf(option)}>
                  {getOptionLabel(option)}
                  {!locked && (
                    <button
                      type="button"
                      className="admin-combobox__button"
                      aria-label={removeLabel(getOptionLabel(option))}
                      onClick={() => remove(selected.filter((item) => keyOf(item) !== keyOf(option)))}
                    >
                      <RemoveIcon />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <input
            {...aria}
            ref={setInput}
            id={id}
            className={searchesFresh && selected.length ? 'admin-combobox__input admin-combobox__input--selection-shown' : 'admin-combobox__input'}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete={searchable ? 'list' : 'none'}
            aria-controls={listboxId}
            aria-expanded={open}
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-required={required || undefined}
            value={shownText}
            placeholder={shownPlaceholder}
            disabled={disabled}
            readOnly={readOnly || !searchable}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
        {clearable && !locked && selected.length > 0 && (
          <button type="button" className="admin-combobox__button" aria-label={clearLabel} onClick={() => remove([])}>
            <RemoveIcon />
          </button>
        )}
        <span className="admin-combobox__indicator" aria-hidden="true">
          <ShowOptionsIcon />
        </span>
      </div>
      <div
        ref={popup}
        className="admin-combobox__popup"
        hidden={!open}
        onMouseDown={(event) => event.preventDefault()}
        onKeyDown={handlePopupKeyDown}
      >
        {header}
        <ul
          id={listboxId}
          className="admin-combobox__listbox"
          role="listbox"
          aria-labelledby={aria['aria-labelledby']}
          aria-multiselectable={multiple || undefined}
          aria-busy={busy || undefined}
        >
          {visible.map((option, index) => {
            const key = keyOf(option);
            const state = { active: index === activeIndex, selected: selectedKeys.has(key), inputValue };
            const optionDisabled = isOptionDisabled(option);
            const classes = [
              'admin-combobox__option',
              state.selected && 'admin-combobox__option--selected',
              state.active && 'admin-combobox__option--active',
              optionDisabled && 'admin-combobox__option--disabled',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={key}
                id={optionId(index)}
                className={classes}
                role="option"
                aria-selected={state.selected}
                aria-disabled={optionDisabled || undefined}
                onClick={() => choose(option)}
                onMouseMove={() => !optionDisabled && key !== activeKey && setActiveKey(key)}
              >
                {renderOption ? renderOption(option, state) : getOptionLabel(option)}
              </li>
            );
          })}
        </ul>
        <p className="admin-combobox__message" role="status">
          {open ? message : ''}
        </p>
      </div>
      {name && selected.map((option) => <input key={keyOf(option)} type="hidden" name={name} value={keyOf(option)} />)}
    </div>
  );
};
