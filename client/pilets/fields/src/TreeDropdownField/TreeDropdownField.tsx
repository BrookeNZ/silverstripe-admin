/**
 * The tree dropdown: a combobox over a lazily loaded tree, one level at a time, with breadcrumbs to
 * step back up, a debounced server search and left and right arrows to move between levels. This class
 * owns the field's lifecycle and events; the tree state lives in connectTreeDropdownField, loading in
 * treeLoading, the option and value logic in treeOptions and the drawing in the part components.
 */
import React, { Component } from 'react';
import { Combobox } from '@silverstripe/admin-patterns';
import type { ComboboxOptionState } from '@silverstripe/admin-patterns';
import i18n from '../legacy/i18n';
import fieldHolder from '../legacy/fieldHolder';
import { connectTreeDropdownField } from '../legacy/treeDropdownFieldState';
import { serverCache } from '../legacy/Backend';
import { findTreeByPath, findTreeByID, findTreePath } from './treeUtils';
import type { TreeDropdownFieldNode } from './treeUtils';
import {
  MULTI_EMPTY_VALUE,
  SINGLE_EMPTY_VALUE,
  breadcrumbsFor,
  dropdownOptions,
  filterTreeOption,
  mapStateToProps,
  pathTitle,
  selectedOptionsFor,
} from './treeOptions';
import { lazyLoad, loadTree } from './treeLoading';
import { levelMessage, noOptionsMessage } from './treeMessages';
import { TreeBreadcrumbs, TreeOption } from './TreeDropdownParts';
import { TreeDropdownReadOnly } from './TreeDropdownReadOnly';
import './TreeDropdownField.css';

const SEARCH_DELAY = 500; // ms

class TreeDropdownField extends Component<any, any> {
  static defaultProps = {
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

  searchTimer: ReturnType<typeof setTimeout> | null;

  initialised = false;

  inputRef = React.createRef<HTMLInputElement>();

  constructor(props) {
    super(props);

    this.render = this.render.bind(this);
    this.renderOption = this.renderOption.bind(this);
    this.getOptionLabel = this.getOptionLabel.bind(this);
    this.getVisibleTree = this.getVisibleTree.bind(this);

    this.handleBack = this.handleBack.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleNavigate = this.handleNavigate.bind(this);
    this.handleSearchChange = this.handleSearchChange.bind(this);
    this.handleSearchReset = this.handleSearchReset.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleOpenChange = this.handleOpenChange.bind(this);
    this.handleFirstUse = this.handleFirstUse.bind(this);

    this.filterOption = this.filterOption.bind(this);
    this.noOptionsMessage = this.noOptionsMessage.bind(this);

    this.state = {
      opened: false,
      levelMessage: '',
    };

    this.searchTimer = null;
  }

  componentDidMount() {
    const selected = this.schemaValueObjects();
    if (selected.length) {
      this.props.actions.treeDropdownField.addSelectedValues(this.props.id, selected);
    }

    if (this.props.readOnly || this.props.disabled) {
      return;
    }
    if (this.valueNeedsTree(selected)) {
      this.initialise();
    } else {
      this.inputRef.current?.addEventListener('focus', this.handleFirstUse);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.searchTimer);
    this.inputRef.current?.removeEventListener('focus', this.handleFirstUse);
  }

  componentDidUpdate(oldProps) {
    if (this.props.readOnly || this.props.disabled || !this.initialised) {
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
      loadTree(this.props, visible, this.props.search);
    }
  }

  getVisibleTree() {
    return this.props.findTreeByPath(this.props.tree, this.props.visible);
  }

  getBreadcrumbs(path = this.props.visible) {
    return breadcrumbsFor(this.props.tree, path);
  }

  schemaValueObjects(): Array<TreeDropdownFieldNode> {
    const values = this.props.data.multiple ? this.props.data.valueObjects || [] : [this.props.data.valueObject];
    return values.filter((item) => item);
  }

  /** Whether a value has no title from the schema, so only the tree can name it */
  valueNeedsTree(named: Array<TreeDropdownFieldNode>) {
    const ids = (Array.isArray(this.props.value) ? this.props.value : [this.props.value]).filter((id) => id);
    return ids.some((id) => !named.some((node) => String(node.id) === String(id)));
  }

  /** The tree is read on the first focus or open, not on mount, since the schema already names the value */
  handleFirstUse() {
    this.inputRef.current?.removeEventListener('focus', this.handleFirstUse);
    if (!this.initialised) {
      this.initialise();
    }
  }

  /**
   * Loads the top level and, for a single selected value, shows the level that holds it
   */
  initialise() {
    this.initialised = true;
    return loadTree(this.props, [], this.props.search)
      .then((treeData) => {
        let newPath = [];
        if (!this.props.data.multiple && this.props.value) {
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

  hasSearch() {
    return this.props.data.showSearch && Boolean(this.props.search);
  }

  filterOption(option, input = '') {
    return filterTreeOption(option, input, {
      parent: this.getVisibleTree(),
      hasEmptyDefault: this.props.data.hasEmptyDefault,
      nested: this.props.visible.length,
      searching: this.hasSearch(),
    });
  }

  handleOpen() {
    this.handleFirstUse();
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

  handleSearchReset() {
    clearTimeout(this.searchTimer);
    this.props.actions.treeDropdownField.setSearch(this.props.id, '');
  }

  /**
   * Sets the search after a pause in typing, so requests do not hammer the server
   */
  handleSearchChange(value) {
    clearTimeout(this.searchTimer);
    this.setState({ levelMessage: '' });
    this.searchTimer = setTimeout(() => {
      this.props.actions.treeDropdownField.setSearch(this.props.id, value);
    }, SEARCH_DELAY);
  }

  /**
   * Maps the combobox's option or options to the field value and records them as selected
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
      const id = value ? value.id : null;
      const tree = this.getVisibleTree() || this.props.tree;
      // A value picked before the tree has loaded is not recorded as selected; the value still posts
      let object = tree?.children?.find(item => item.id === id);
      if (object) {
        if (this.props.data.showSelectedPath) {
          object = {
            ...object,
            titlePath: pathTitle(this.getBreadcrumbs(this.props.findTreePath(this.props.tree, id, this.props.data.treeBaseId))),
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

  /** Shows the level below a node, loading it when needed */
  handleNavigate(event, id) {
    if (this.hasSearch()) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    let path = this.props.findTreePath(this.props.tree, id, this.props.data.treeBaseId);
    if (!path) {
      // Edge case: Path hasn't been loaded yet,
      // so append to current path
      path = this.props.visible.slice(0);
      path.push(id);
    }

    lazyLoad(this.props, path);
    this.props.actions.treeDropdownField.setVisible(this.props.id, path);
    this.setState({ levelMessage: levelMessage(this.getBreadcrumbs(path)) });
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
      case 'ArrowRight':
        if (focused.count) {
          this.handleNavigate(event, focused.id);
        }
        break;
      default:
        break;
    }
  }

  /** Shows the level above, loading it when needed */
  handleBack(event) {
    if (this.hasSearch()) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    let path = this.props.visible;

    if (path.length) {
      path = path.slice(0, path.length - 1);
    }

    lazyLoad(this.props, path);
    this.props.actions.treeDropdownField.setVisible(this.props.id, path);
    this.setState({ levelMessage: levelMessage(this.getBreadcrumbs(path)) });

    // The breadcrumb row goes at the top level, so focus returns to the input rather than the page
    if (event.currentTarget instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) {
      this.inputRef.current?.focus();
    }
  }

  renderBreadcrumbs() {
    const breadcrumbs = this.getBreadcrumbs();
    if (breadcrumbs.length === 0) {
      return null;
    }

    return (
      <TreeBreadcrumbs
        crumbs={breadcrumbs.map((item) => item.title).join(' / ')}
        searching={this.hasSearch()}
        onBack={this.handleBack}
      />
    );
  }

  renderOption(tree, { inputValue }: ComboboxOptionState) {
    const { data, visible, search } = this.props;
    return (
      <TreeOption
        node={tree}
        search={search || inputValue || ''}
        searching={this.hasSearch()}
        emptyContext={data.hasEmptyDefault && !visible.length ? data.emptyString : null}
        onNavigate={this.handleNavigate}
      />
    );
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
    return noOptionsMessage(inputValue, this.getVisibleTree() || {}, this.props.failed);
  }

  render() {
    const className = this.props.extraClass
      ? `treedropdownfield ${this.props.extraClass}`
      : 'treedropdownfield';

    if (this.props.readOnly || this.props.disabled) {
      return (
        <TreeDropdownReadOnly
          id={this.props.id}
          name={this.props.name}
          value={this.props.value}
          className={className}
          readOnly={this.props.readOnly}
          disabled={this.props.disabled}
          data={this.props.data}
          selectedValues={this.props.selectedValues}
        />
      );
    }

    const options = dropdownOptions({
      visibleTree: this.getVisibleTree(),
      value: this.props.value,
      selectedValues: this.props.selectedValues,
      opened: this.state.opened,
      data: this.props.data,
    });
    const value = selectedOptionsFor({
      value: this.props.value,
      selectedValues: this.props.selectedValues,
      options,
      hasEmptyDefault: this.props.data.hasEmptyDefault,
    });

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
