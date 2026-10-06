import AsyncSelect from 'react-select/async';
import backend, { CSRF_HEADER } from '../legacy/Backend';
import classNames from 'classnames';
import Config from '../legacy/Config';
import debounce from 'debounce-promise';
import EmotionCssCacheProvider from '../legacy/EmotionCssCacheProvider';
import i18n from '../legacy/i18n';
import fieldHolder from '../legacy/fieldHolder';
import React, { useState, useEffect, createRef } from 'react';
import Select from 'react-select';
import './SearchableDropdownField.css';

export interface SearchableDropdownFieldProps {
  clearable?: boolean;
  disabled?: boolean;
  lazyLoad?: boolean;
  multi?: boolean;
  name: string;
  passRef?: boolean;
  placeholder?: string;
  onChange?(value: unknown): void;
  options?: Array<object>;
  optionUrl?: string;
  searchable?: boolean;
  value?: any;
  SelectComponent?: React.ComponentType<any>;
  AsyncSelectComponent?: React.ComponentType<any>;
  [passThrough: string]: unknown;
}

const SearchableDropdownField = ({
  clearable = true,
  disabled = false,
  lazyLoad = false,
  multi = false,
  passRef = true,
  placeholder = '',
  options,
  optionUrl,
  onChange = () => {},
  searchable = true,
  value = '',
  SelectComponent = Select,
  AsyncSelectComponent = AsyncSelect,
  ...passThroughProps
}: SearchableDropdownFieldProps) => {
  const [hasChanges, setHasChanges] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const [fetchCache, setFetchCache] = useState({});
  const selectComponentRef = createRef<any>();

  // This is required to get the PageForm change tracker to work by firing a bubbling change event
  useEffect(() => {
    if (!justChanged) {
      return;
    }
    const element = selectComponentRef.current.inputRef;
    const event = new Event('change', { bubbles: true });
    element.dispatchEvent(event);
    setJustChanged(false);
  });

  /**
   * Fetch the lazy loaded options from the server, filtered by the given term
   */
  const fetchLazyLoadOptions = (term) => {
    if (fetchCache.hasOwnProperty(term)) {
      return Promise.resolve(fetchCache[term]);
    }
    const fetchUrl = new URL(optionUrl, document.baseURI);
    fetchUrl.searchParams.set('term', term);
    const endpoint = fetchUrl.href;
    const csrfHeader = CSRF_HEADER;
    const headers = {};
    headers[csrfHeader] = Config.get('SecurityID');
    return backend.get(endpoint, headers)
      .then(response => response.json())
      .then(responseJson => {
        fetchCache[term] = responseJson;
        setFetchCache(fetchCache);
        return responseJson;
      });
  };

  /**
   * Get the lazy=loaded options that should be shown to the user for this SearchableDropdownField,
   * optionally filtering by the given string input
   */
  const getLazyLoadOptions = debounce((input) => {
    if (!input) {
      return Promise.resolve([]);
    }
    return fetchLazyLoadOptions(input);
  }, 500);

  const handleChange = (val) => {
    setHasChanges(false);
    if (JSON.stringify(value) !== JSON.stringify(val)) {
      setHasChanges(true);
      setJustChanged(true);
    }
    onChange(val);
  };

  /**
   * Required to prevent SearchableDropdownField being cleared on blur
   *
   * @link https://github.com/JedWatson/react-select/issues/805#issuecomment-210646771
   */
  const handleOnBlur = () => {};

  const className = classNames({
    'no-change-track': !hasChanges,
    'ss-searchable-dropdown-field--lazy-load': lazyLoad
  });

  const optionsProps = lazyLoad ? { loadOptions: getLazyLoadOptions } : { options };

  const noOptionsMessage = (inputValue) => {
    if (inputValue) {
      return i18n._t('Admin.NO_MATCHING_OPTIONS', 'No matching options');
    }
    return i18n._t('Admin.TYPE_TO_SEARCH', 'Type to search');
  };

  // Setting passRef to false is purely for jest when mocking the component with a simple function component
  // It prevents - Warning: Function components cannot be given refs. Attempts to access this ref will fail.
  const refProps = passRef ? { ref: selectComponentRef } : {};

  let val = value;

  // For non-multi only the first value is needed
  if (!multi && val) {
    const keys = Object.keys(val);
    if (keys.length > 0) {
      const key = keys[0];
      const v = val[key];
      if (typeof v === 'object') {
        val = v;
      }
    }
  }

  const inputId = `${passThroughProps.id}__input`;

  const DynamicComponent = lazyLoad ? AsyncSelectComponent : SelectComponent;

  return <EmotionCssCacheProvider>
    <DynamicComponent
      // passThroughProps needs to be first so that it can be overridden by the other props
      {...passThroughProps}
      classNamePrefix="ss-searchable-dropdown-field"
      className={className}
      isClearable={clearable}
      isDisabled={disabled}
      isMulti={multi}
      isSearchable={searchable}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleOnBlur}
      {...optionsProps}
      noOptionsMessage={noOptionsMessage}
      {...refProps}
      value={val}
      inputId={inputId}
    />
  </EmotionCssCacheProvider>;
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
