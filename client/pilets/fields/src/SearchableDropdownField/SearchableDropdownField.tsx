/**
 * The admin's legacy SearchableDropdownField, ported with its body kept close to the legacy source; the
 * legacy/ stand-ins replace its admin imports and PORTING.md lists every change
 */
import { CSRF_HEADER, serverCache } from '../legacy/Backend';
import classNames from 'classnames';
import Config from '../legacy/Config';
import debounce from 'debounce-promise';
import i18n from '../legacy/i18n';
import fieldHolder from '../legacy/fieldHolder';
import { useState, useRef } from 'react';
import { Combobox } from '@silverstripe/admin-patterns';

interface SearchableOption {
  value: string | number;
  label: string;
}

export interface SearchableDropdownFieldProps {
  clearable?: boolean;
  disabled?: boolean;
  lazyLoad?: boolean;
  multi?: boolean;
  name: string;
  placeholder?: string;
  onChange?: (value: unknown) => void;
  options?: Array<SearchableOption>;
  optionUrl?: string;
  searchable?: boolean;
  value?: any;
  id?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
  'aria-errormessage'?: string;
}

/**
 * Fetch the lazy loaded options from the server, filtered by the given term
 */
function lazyLoadOptions(optionUrl: string | undefined) {
  const fetchCache: Record<string, Array<SearchableOption>> = {};
  const fetchLazyLoadOptions = (term: string): Promise<Array<SearchableOption>> => {
    if (Object.prototype.hasOwnProperty.call(fetchCache, term)) {
      return Promise.resolve(fetchCache[term]);
    }
    const fetchUrl = new URL(optionUrl ?? '', document.baseURI);
    fetchUrl.searchParams.set('term', term);
    // The search action checks the token on a GET, where the shell's fetch sends none
    const headers = { [CSRF_HEADER]: String(Config.get('SecurityID')) };
    return serverCache().fetchJson<Array<SearchableOption>>(fetchUrl.href, { headers })
      .then(responseJson => {
        fetchCache[term] = responseJson;
        return responseJson;
      });
  };
  return debounce((input: string) => {
    if (!input) {
      return Promise.resolve([]);
    }
    return fetchLazyLoadOptions(input);
  }, 500);
}

const SearchableDropdownField = ({
  clearable = true,
  disabled = false,
  lazyLoad = false,
  multi = false,
  name,
  placeholder = '',
  options = [],
  optionUrl,
  onChange = () => {},
  searchable = true,
  value = '',
  ...aria
}: SearchableDropdownFieldProps) => {
  const [hasChanges, setHasChanges] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Made once, as legacy's ref was: the options cache and the debounce belong to the field instance
  const [getLazyLoadOptions] = useState(() => lazyLoadOptions(optionUrl));

  const handleChange = (val: unknown) => {
    setHasChanges(false);
    if (JSON.stringify(value) !== JSON.stringify(val)) {
      setHasChanges(true);
    }
    onChange(val);
  };

  const className = classNames({
    'no-change-track': !hasChanges,
    'ss-searchable-dropdown-field--lazy-load': lazyLoad,
  });

  const noOptionsMessage = (inputValue: string) => (
    inputValue
      ? i18n._t('Admin.NO_MATCHING_OPTIONS', 'No matching options')
      : i18n._t('Admin.TYPE_TO_SEARCH', 'Type to search')
  );

  let val = value;

  // For non-multi only the first value is needed
  if (!multi && val) {
    const keys = Object.keys(val);
    if (keys.length > 0) {
      const v = val[keys[0]];
      if (typeof v === 'object') {
        val = v;
      }
    }
  }

  return (
    <Combobox<SearchableOption>
      {...aria}
      inputRef={inputRef}
      name={name}
      className={className}
      clearable={clearable}
      disabled={disabled}
      multiple={multi}
      searchable={searchable}
      placeholder={placeholder}
      onChange={handleChange}
      options={lazyLoad ? undefined : options}
      loadOptions={lazyLoad ? getLazyLoadOptions : undefined}
      noOptionsMessage={noOptionsMessage}
      loadingMessage={i18n._t('Admin.LOADING', 'Loading...')}
      clearLabel={i18n._t('Admin.CLEAR', 'Clear')}
      value={val || null}
    />
  );
};

export { SearchableDropdownField as Component };

/** The props SearchableDropdownField and SearchableMultiDropdownField send at the top level of their schema */
export interface SearchableDropdownSchema {
  clearable: boolean;
  lazyLoad: boolean;
  multi: boolean;
  optionUrl: string;
  placeholder: string;
  searchable: boolean;
}

export default fieldHolder<SearchableDropdownSchema>(SearchableDropdownField, [
  'clearable',
  'lazyLoad',
  'multi',
  'optionUrl',
  'placeholder',
  'searchable',
]);
