import React, { Component } from 'react';
import { BackIcon, CollapsedIcon, Combobox } from '@silverstripe/admin-patterns';
import type { ComboboxOptionState } from '@silverstripe/admin-patterns';
import i18n from '../legacy/i18n';
import fieldHolder from '../legacy/fieldHolder';
import { connectTreeDropdownField } from '../legacy/treeDropdownFieldState';
import { serverCache } from '../legacy/Backend';
import { mapHighlight } from '../legacy/castStringToElement';
import { findTreeByPath, findTreeByID, findTreePath, treeFetchUrl } from './treeUtils';
import type { TreeDropdownFieldNode } from './treeUtils';
import './TreeDropdownField.css';

const SEARCH_DELAY = 500; // ms

// legacy value for multi-select's empty value
const MULTI_EMPTY_VALUE = 'unchanged';

const SINGLE_EMPTY_VALUE = 0;

const Highlight = ({ children }) => (
  <span className="treedropdownfield__option-title--highlighted">{children}</span>
);

class TreeDropdownField extends Component<any, any> {
  static defaultProps: Record<string, unknown>;

  searchTimer: ReturnType<typeof setTimeout> | null;

  inputRef = React.createRef<HTMLInputElement>();

  constructor(props) {
    super(props);

    // Renderers and custom component constructors
    this.render = this.render.bind(this);
    this.renderOption = this.renderOption.bind(this);
    this.formatOptionLabel = this.formatOptionLabel.bind(this);
    this.getOptionLabel = this.getOptionLabel.bind(this);

    // Getters
    this.getBreadcrumbs = this.getBreadcrumbs.bind(this);
    this.getDropdownOptions = this.getDropdownOptions.bind(this);
    this.getVisibleTree = this.getVisibleTree.bind(this);

    // Events
    this.handleBack = this.handleBack.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleNavigate = this.handleNavigate.bind(this);
    this.handleSearchChange = this.handleSearchChange.bind(this);
    this.handleSearchReset = this.handleSearchReset.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleOpenChange = this.handleOpenChange.bind(this);

    // Helpers
    this.callFetch = this.callFetch.bind(this);
    this.lazyLoad = this.lazyLoad.bind(this);
    this.filterOption = this.filterOption.bind(this);
    this.noOptionsMessage = this.noOptionsMessage.bind(this);

    this.state = {
      opened: false,
      levelMessage: '',
    };

    this.searchTimer = null;
  }

  componentDidMount() {
    // Ensure root node is loaded, force invalidating the cache when not readonly or disabled
    if (!this.props.readOnly && !this.props.disabled) {
      this.initialise();
    }

    const id = this.props.id;
    const values = (this.props.data.multiple)
      ? this.props.data.valueObjects || []
      : [this.props.data.valueObject];
    const selected = values.filter((item) => item);

    if (selected.length) {
      this.props.actions.treeDropdownField.addSelectedValues(id, selected);
    }
  }

  componentDidUpdate(oldProps) {
    if (this.props.readOnly || this.props.disabled) {
      return;
    }

    let reload = false;
    let visible = [];

    if (this.props.search !== oldProps.search) {
      // invalidate the tree cache
      reload = true;
      visible = this.props.visible;
    }

    if (oldProps.data.urlTree !== this.props.data.urlTree) {
      // invalidate the tree cache, as url has changed
      reload = true;
    }

    if (oldProps.data.cacheKey !== this.props.data.cacheKey) {
      // invalidate the tree cache, as paths have changed
      reload = true;
    }

    if (reload) {
      this.loadTree(visible, this.props.search, this.props);
    }
  }

  /**
   * Get the currently visible node
   *
   * @return {Object}
   */
  getVisibleTree() {
    return this.props.findTreeByPath(this.props.tree, this.props.visible);
  }

  /**
   * Get array of breadcrumb nodes
   *
   * @return {Array}
   */
  getBreadcrumbs(path = this.props.visible) {
    const breadcrumbs = [];

    if (!path) {
      return breadcrumbs;
    }
    // No more path means this is the complete tree
    let node = this.props.tree;

    // eslint-disable-next-line no-restricted-syntax
    for (const next of path) {
      if (!node.children) {
        break;
      }
      node = node.children.find((child) => (child.id === next));
      if (!node) {
        break;
      }
      breadcrumbs.push(node);
    }
    return breadcrumbs;
  }

  /**
   * Gets array of options to pass to the react-dropdown component
   *
   * @return {Array}
   */
  getDropdownOptions() {
    const value = this.props.value;
    const node = this.getVisibleTree();
    let options = node ? [...node.children] : [];

    const selectedOptions = this.props.selectedValues
      .filter(selected => (
        selected.id === value ||
        (Array.isArray(value) && value.find(item => item === selected.id))
      ));

    if (!this.state.opened && this.props.data.showSelectedPath) {
      options = selectedOptions
        .map(selected => ({
          ...selected,
          title: selected.titlePath || selected.title,
        }));
    } else if (selectedOptions.length) {
      options = [
        ...selectedOptions
          .filter(selected => (
            !options.find(item => item.id === selected.id)
          )),
        ...options,
      ];
    }

    // The empty choice, which filterOption hides unless the field has an empty default
    options.unshift({
      id: this.props.data.multiple ? '' : SINGLE_EMPTY_VALUE,
      title: (this.props.data.hasEmptyDefault) ? this.props.data.emptyString : null,
      disabled: !options.length || !this.props.data.hasEmptyDefault,
    });

    return options;
  }

  getPath(id) {
    const treePath = this.props.findTreePath(this.props.tree, id, this.props.data.treeBaseId);
    const breadcrumbs = this.getBreadcrumbs(treePath);

    return breadcrumbs
      .reduce((prev, path) => `${prev}${path.contextString || ''}${path.title}/`, '');
  }

  /**
   * Initialises the state of this field, forcing a root node
   * request and conditionally setting the path to the selected value
   * for single selected values.
   *
   * @return {Promise}
   */
  initialise() {
    return this
      .loadTree([], this.props.search)
      .then((treeData) => {
        // If this is the first time the tree has been loaded, then ensure
        // the selected visible node is highlighted, or otherwise reset to root
        let newPath = [];
        if (!this.props.data.multiple && this.props.value) {
          // Get path of current node
          newPath = this.props.findTreePath(treeData, this.props.value, this.props.data.treeBaseId);
          if (newPath) {
            // Revert one level to show parent
            newPath.pop();
          } else {
            newPath = [];
          }
        }
        this.props.actions.treeDropdownField.setVisible(this.props.id, newPath);
      });
  }

  /**
   * Call to make the fetching happen
   *
   * @param {Array} path to load
   * @param {string} search
   * @param {Object} props The props to be used by this method
   * @returns {Promise}
   */
  callFetch(path, search = '', props = this.props) {
    const fetchURLString = treeFetchUrl(props.data, path, search, props.value);
    return this.props.fetch(fetchURLString);
  }

  /**
   * Fetches data used to generate a form. This can be form schema and/or form state data.
   * When the response comes back the data is saved to state.
   *
   * @param {Array} path Path to ensure exists
   * @return {Object} Promise from the AJAX request.
   */
  lazyLoad(path) {
    // If any ancestor node in visible chain is either loading or failed then abort re-load
    const foundPrev = path.find((pathNode) => (
      this.props.loading.indexOf(pathNode) > -1
      || this.props.failed.indexOf(pathNode) > -1
    ));
    if (foundPrev) {
      return Promise.resolve({});
    }

    // If ancestor node is already loaded (and non-empty) then don't re-trigger
    const foundTree = this.props.findTreeByPath(this.props.tree, path);
    // Return if there are no children, or they are loaded
    if (foundTree && (foundTree.count === 0 || foundTree.children.length)) {
      return Promise.resolve({});
    }

    return this.loadTree(path);
  }

  /**
   * Sets callbacks and necessary state changes around a `callFetch()`
   *
   * @param {Array} path A list of ids denoting the path the user has browsed in to
   * @param {String} search A search term to use
   * @param {Object} props The props to be used by this method
   * @return {Promise}
   */
  loadTree(path, search = '', props = this.props) {
    // Mark as loading
    props.actions.treeDropdownField.beginTreeUpdating(props.id, path);

    return this.callFetch(path, search, props)
      .then((treeData) => {
        // Populate tree
        props.actions.treeDropdownField.updateTree(props.id, path, treeData);

        return treeData;
      })
      .catch((error) => {
        props.actions.treeDropdownField.updateTreeFailed(props.id, path);
        if (typeof props.onLoadingError === 'function') {
          return props.onLoadingError({
            errors: [
              {
                value: error.message,
                type: 'error',
              },
            ],
          });
        }
        throw error;
      });
  }

  /**
   * Returns whether a search is actively happening
   *
   * @return {Boolean}
   */
  hasSearch() {
    return this.props.data.showSearch && Boolean(this.props.search);
  }

  /**
   * A filter for the list of options to determine what is shown and what isn't
   */
  filterOption(option, input = '') {
    const parent = this.getVisibleTree();
    if ((option.id === SINGLE_EMPTY_VALUE || option.id === '') &&
      (!this.props.data.hasEmptyDefault || this.props.visible.length || this.hasSearch())
    ) {
      return false;
    }
    const title = option.title && option.title.toLocaleLowerCase();
    // using this.props.search so that we do not get flash of filtered current content
    // const search = this.props.search.toLocaleLowerCase();
    const search = input.toLocaleLowerCase();

    // need to do some checks for the selected options, so that they do not show unnecessarily
    return (search)
      // only show option if matches search filter
      ? title && title.includes(search)
      // only show option if it belongs in the current visible tree
      : (
        !parent ||
        !option.id ||
        parent.children.find((child) => child.id === option.id)
      );
  }

  handleOpen() {
    this.setState({ opened: true, levelMessage: '' });

    this.handleSearchReset();
  }

  handleClose() {
    this.setState({ opened: false });
  }

  handleOpenChange(open) {
    if (open) {
      this.handleOpen();
    } else {
      this.handleClose();
    }
  }

  /**
   * Reset the search value
   */
  handleSearchReset() {
    clearTimeout(this.searchTimer);
    this.props.actions.treeDropdownField.setSearch(this.props.id, '');
  }

  /**
   * Sets the search value, handles throttling/debouncing so that API calls is not
   * fired after every keypress
   *
   * @param {String} value
   */
  handleSearchChange(value) {
    clearTimeout(this.searchTimer);
    this.setState({ levelMessage: '' });
    // delay setting a search value, so ajax requests do not hammer the server
    this.searchTimer = setTimeout(() => {
      this.props.actions.treeDropdownField.setSearch(this.props.id, value);
    }, SEARCH_DELAY);
  }

  /**
   * Handles changes to the text field's value.
   *
   * @param {Object|Array} value - New value / option
   */
  handleChange(value) {
    let mappedValue = null;

    this.handleSearchReset();
    if (this.props.data.multiple) {
      mappedValue = MULTI_EMPTY_VALUE;

      if (value && value.length) {
        const uniqueValues = value && value
          .filter((item, index) => value.findIndex(next => next.id === item.id) === index);
        mappedValue = uniqueValues.map(item => item.id);

        this.props.actions.treeDropdownField.addSelectedValues(this.props.id, uniqueValues);
      }
    } else {
      // Get node ID from object
      const id = value ? value.id : null;
      const tree = this.getVisibleTree() || this.props.tree;
      let object = tree.children.find(item => item.id === id);
      if (object) {
        if (this.props.data.showSelectedPath) {
          object = {
            ...object,
            titlePath: this.getPath(id),
          };
        }
        this.props.actions.treeDropdownField.addSelectedValues(this.props.id, [object]);
      }

      mappedValue = id || SINGLE_EMPTY_VALUE;
    }

    if (typeof this.props.onChange === 'function') {
      this.props.onChange(mappedValue);
    }
  }

  /**
   * Handles navigating to a sub-tree
   *
   * @param {Event} event - Click event
   * @param {*} id - Id to add to end of path
   */
  handleNavigate(event, id) {
    if (this.hasSearch()) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    // Find parent path
    let path = this.props.findTreePath(this.props.tree, id, this.props.data.treeBaseId);
    if (!path) {
      // Edge case: Path hasn't been loaded yet,
      // so append to current path
      path = this.props.visible.slice(0);
      path.push(id);
    }

    // Lazy-load children and update visibility
    this.lazyLoad(path);
    this.props.actions.treeDropdownField.setVisible(this.props.id, path);
    this.setState({ levelMessage: this.levelMessage(path) });
  }

  /** "Photography, level 2" for the level a path shows, read out through the combobox's status line */
  levelMessage(path) {
    const crumbs = this.getBreadcrumbs(path);
    if (!crumbs.length) {
      return i18n._t('Admin.TREEDROPDOWN_TOP_LEVEL', 'Top level');
    }
    return i18n.inject(i18n._t('Admin.TREEDROPDOWN_LEVEL', '{title}, level {level}'), {
      title: crumbs[crumbs.length - 1].title,
      level: crumbs.length + 1,
    });
  }

  /**
   * Left and right arrows step up and down the tree from the active option; every other key is the
   * combobox's own. Stepping up makes the node just left the active option
   */
  handleKeyDown(event, focused, activate) {
    if (this.hasSearch()) {
      if (event.key === 'Escape') {
        this.handleSearchReset();
      }
      return;
    }

    if (!focused) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft': {
        const left = this.props.visible[this.props.visible.length - 1];
        this.handleBack(event);
        if (left !== undefined) {
          activate({ id: left });
        }
        break;
      }
      case 'ArrowRight': // right, drill deeper
        if (focused.count) {
          this.handleNavigate(event, focused.id);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Go up one level
   *
   * @param {Event} event - Click event
   */
  handleBack(event) {
    if (this.hasSearch()) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    // Find id in existing path, otherwise adding it to the end
    let path = this.props.visible;

    if (path.length) {
      path = path.slice(0, path.length - 1);
    }

    // Lazy-load children and update visibility
    this.lazyLoad(path);
    this.props.actions.treeDropdownField.setVisible(this.props.id, path);
    this.setState({ levelMessage: this.levelMessage(path) });

    // The breadcrumb row goes at the top level, so focus returns to the input rather than the page
    if (event.currentTarget instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) {
      this.inputRef.current?.focus();
    }
  }

  /**
   * The breadcrumb row above the options in a nested level, which steps back up one level. Tab reaches
   * it from the input while the list is open; the left arrow does the same from an option
   */
  renderBreadcrumbs() {
    const breadcrumbs = this.getBreadcrumbs();
    if (breadcrumbs.length === 0) {
      return null;
    }

    const crumbs = breadcrumbs.map((item) => item.title).join(' / ');

    if (this.hasSearch()) {
      return <div className="treedropdownfield__breadcrumbs">{crumbs}</div>;
    }

    return (
      <button type="button" className="treedropdownfield__breadcrumbs" onClick={this.handleBack}>
        <BackIcon size="sm" label={i18n._t('Admin.TREEDROPDOWN_BACK', 'Back')} />
        {crumbs}
      </button>
    );
  }

  /**
   * An option's title, its place in the tree when searching, and a pointer target that opens a node
   * with children; keyboard users open it with the right arrow, and the hidden hint says it has children
   */
  renderOption(tree, { inputValue }: ComboboxOptionState) {
    let subtitle = null;
    if (this.hasSearch()) {
      subtitle = tree.contextString;

      if (!subtitle && this.props.data.hasEmptyDefault && !this.props.visible.length) {
        subtitle = this.props.data.emptyString;
      }
    }

    const hasChildren = Boolean(tree.count) && !this.hasSearch();

    return (
      <>
        <span className="treedropdownfield__option-title-box">
          <span className="treedropdownfield__option-title">{this.formatOptionLabel(tree, inputValue)}</span>
          {subtitle && <span className="treedropdownfield__option-context">{subtitle}</span>}
        </span>
        {hasChildren && (
          <span className="treedropdownfield__option-children" onClick={(event) => this.handleNavigate(event, tree.id)}>
            <CollapsedIcon />
            <span className="treedropdownfield__option-hint">
              {i18n._t('Admin.TREEDROPDOWN_HAS_CHILDREN', 'has children')}
            </span>
          </span>
        )}
      </>
    );
  }

  /**
   * Fallback to a textbox for readonly and disabled status
   *
   * @return {React}
   */
  renderReadOnly() {
    const inputProps = {
      id: this.props.id,
      readOnly: this.props.readOnly,
      disabled: this.props.disabled,
    };
    const className = this.props.extraClass
      ? `treedropdownfield ${this.props.extraClass}`
      : 'treedropdownfield';
    let title = (this.props.data.hasEmptyDefault) ? this.props.data.emptyString : '';
    const selected = this.props.selectedValues;

    if (this.props.data.multiple) {
      const values = this.props.value
        .map((value) => (
          // assumes all selected values had been populated into `props.selectedValues`
          selected.find((item) => item.id === value) ||
          value
        ));

      title = values.map(value => value.title).join(', ');
    } else {
      const value = selected.find((item) => item.id === this.props.value);
      title = this.props.value;

      if (value && typeof value.title === 'string') {
        title = value.title;
      }
    }

    return (
      <div className={className}>
        <span
          className="treedropdownfield__title"
          role="textbox"
          aria-readonly="true"
          tabIndex={0}
        >{title}</span>
        <input
          type="hidden"
          name={this.props.name}
          value={this.props.value}
          {...inputProps}
        />
      </div>
    );
  }

  formatOptionLabel(option, inputValue = '') {
    const title = option.title || '';
    const search = this.props.search || inputValue;

    return search.length
      ? mapHighlight(title, search, Highlight)
      : title;
  }

  /**
   * With showSelectedPath the selected node reads as its full path, open or closed, so the placeholder a
   * focused field shows does not change when the list closes; rows in the list show their own title
   */
  getOptionLabel(option) {
    if (this.props.data.showSelectedPath && option.titlePath) {
      return option.titlePath;
    }
    return option.title || '';
  }

  noOptionsMessage(inputValue) {
    const visibleTree = this.getVisibleTree() || {};

    // Only show failed message for the currently visible tree or root
    if (this.props.failed.indexOf(visibleTree.id || 0) >= 0) {
      return i18n._t('Admin.TREEDROPDOWN_FAILED', 'Failed to load');
    }
    // If there was a search or this is the root level, say "no options"
    if (inputValue || !visibleTree.id) {
      return i18n._t('Admin.TREEDROPDOWN_NO_OPTIONS', 'No options');
    }
    // If this is inside a tree and there was no search, say "no children"
    return i18n._t('Admin.TREEDROPDOWN_NO_CHILDREN', 'No children');
  }

  render() {
    if (this.props.readOnly || this.props.disabled) {
      return this.renderReadOnly();
    }

    const className = this.props.extraClass
      ? `treedropdownfield ${this.props.extraClass}`
      : 'treedropdownfield';
    const options = this.getDropdownOptions();

    // The value is the selected option objects; each must carry an id and a title
    const rawValue = Array.isArray(this.props.value) ? this.props.value : [this.props.value];
    let value = this.props.selectedValues.filter(item => rawValue.includes(item.id));

    // If there weren't any "selected" values (e.g. setting the value programatically)
    // make sure the value is valid
    if (!value.length) {
      value = options.filter(item => rawValue.includes(item.id));
    }

    // Fall back to the empty default value if there is one
    if (!value.length && this.props.data.hasEmptyDefault) {
      value = [options[0]];
    }

    const showSearch = (typeof this.props.data.showSearch !== 'undefined')
      ? this.props.data.showSearch
      : false;

    const visibleTree = this.getVisibleTree() || {};
    // Only show loading message for the currently visible tree or root
    const isLoading = this.props.loading.indexOf(visibleTree.id || 0) >= 0;

    return (
      <Combobox
        id={this.props.id}
        name={this.props.name}
        className={className}
        searchable={showSearch}
        multiple={this.props.data.multiple}
        clearable
        options={options}
        value={this.props.data.multiple ? value : value[0] ?? null}
        header={this.renderBreadcrumbs()}
        renderOption={this.renderOption}
        filterOption={this.filterOption}
        onChange={this.handleChange}
        onOpenChange={this.handleOpenChange}
        onKeyDown={this.handleKeyDown}
        onInputChange={this.handleSearchChange}
        loading={isLoading}
        loadingMessage={i18n._t('Admin.TREEDROPDOWN_LOADING', 'Loading...')}
        noOptionsMessage={this.noOptionsMessage}
        statusMessage={this.state.levelMessage}
        inputRef={this.inputRef}
        clearLabel={i18n._t('Admin.CLEAR', 'Clear')}
        removeLabel={(label) => i18n.inject(i18n._t('Admin.TREEDROPDOWN_REMOVE', 'Remove {label}'), { label })}
        placeholder={this.props.data.emptyString}
        aria-labelledby={this.props['aria-labelledby']}
        aria-invalid={this.props['aria-invalid']}
        aria-errormessage={this.props['aria-errormessage']}
        getOptionLabel={this.getOptionLabel}
        getOptionValue={({ id }) => id}
        isOptionDisabled={(option) => Boolean(option.disabled)}
      />
    );
  }
}

TreeDropdownField.defaultProps = {
  // React considers "undefined" as an uncontrolled component.
  value: '',
  extraClass: '',
  className: '',
  tree: {},
  visible: [],
  loading: [],
  failed: [],
  findTreeByPath,
  findTreePath,
  fetch: (url: string) => serverCache().fetchJson(url),
};

function mapStateToProps(field, ownProps) {
  let value = ownProps.value;

  if (ownProps.data.multiple && ownProps.value === MULTI_EMPTY_VALUE) {
    value = [];
  }

  if (!ownProps.data.multiple && !ownProps.value) {
    value = SINGLE_EMPTY_VALUE;
  }

  return { ...field, value };
}

const ConnectedTreeDropdownField = connectTreeDropdownField(mapStateToProps)(TreeDropdownField);

export {
  TreeDropdownField as Component,
  ConnectedTreeDropdownField,
  MULTI_EMPTY_VALUE,
  SINGLE_EMPTY_VALUE,
  findTreePath,
  findTreeByID,
  findTreeByPath,
};

export interface TreeDropdownSchema {
  data: {
    cacheKey?: string;
    urlTree: string;
    emptyString?: string;
    valueObject?: TreeDropdownFieldNode;
    valueObjects?: Array<TreeDropdownFieldNode>;
    hasEmptyDefault?: boolean;
    showSearch?: boolean;
    multiple?: boolean;
    showSelectedPath?: boolean;
    treeBaseId?: number;
  };
  extraClass: string;
  readOnly: boolean;
}

export default fieldHolder<TreeDropdownSchema>(ConnectedTreeDropdownField, ['data', 'extraClass', 'readOnly']);
