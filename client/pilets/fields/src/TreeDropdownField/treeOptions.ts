/**
 * The field's view of its tree as plain functions of its props: the breadcrumb trail for a path, the
 * options the combobox lists, which of them a search or the visible level shows, and the selected
 * option objects the combobox takes as its value.
 */

// legacy value for multi-select's empty value
export const MULTI_EMPTY_VALUE = 'unchanged';

export const SINGLE_EMPTY_VALUE = 0;

/** The nodes along a path of ids, from the top level down, stopping where the loaded tree ends */
export function breadcrumbsFor(tree, path) {
  const breadcrumbs = [];

  if (!path) {
    return breadcrumbs;
  }
  let node = tree;

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

/** A node's place in the tree as `Parent/Child/`, for showSelectedPath */
export function pathTitle(breadcrumbs) {
  return breadcrumbs
    .reduce((prev, path) => `${prev}${path.contextString || ''}${path.title}/`, '');
}

/** The visible level's children plus the selected values, after the empty choice */
export function dropdownOptions({ visibleTree, value, selectedValues, opened, data }) {
  let options = visibleTree ? [...visibleTree.children] : [];

  const selectedOptions = selectedValues
    .filter(selected => (
      selected.id === value ||
      (Array.isArray(value) && value.find(item => item === selected.id))
    ));

  if (!opened && data.showSelectedPath) {
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

  // The empty choice, which filterTreeOption hides unless the field has an empty default
  options.unshift({
    id: data.multiple ? '' : SINGLE_EMPTY_VALUE,
    title: (data.hasEmptyDefault) ? data.emptyString : null,
    disabled: !options.length || !data.hasEmptyDefault,
  });

  return options;
}

/** Whether an option shows: a search match while searching, otherwise a child of the visible level */
export function filterTreeOption(option, input, { parent, hasEmptyDefault, nested, searching }) {
  if ((option.id === SINGLE_EMPTY_VALUE || option.id === '') &&
    (!hasEmptyDefault || nested || searching)
  ) {
    return false;
  }
  const title = option.title && option.title.toLocaleLowerCase();
  const search = input.toLocaleLowerCase();

  return (search)
    ? title && title.includes(search)
    : (
      !parent ||
      !option.id ||
      parent.children.find((child) => child.id === option.id)
    );
}

/** The selected option objects, each with an id and a title, falling back to the empty default */
export function selectedOptionsFor({ value, selectedValues, options, hasEmptyDefault }) {
  const rawValue = Array.isArray(value) ? value : [value];
  let selected = selectedValues.filter(item => rawValue.includes(item.id));

  // If there weren't any "selected" values (e.g. setting the value programatically)
  // make sure the value is valid
  if (!selected.length) {
    selected = options.filter(item => rawValue.includes(item.id));
  }

  if (!selected.length && hasEmptyDefault) {
    selected = [options[0]];
  }
  return selected;
}

/** The field value the form holds, mapped to what the tree reads: an array when multiple, else an id */
export function mapStateToProps(field, ownProps) {
  let value = ownProps.value;

  if (ownProps.data.multiple && ownProps.value === MULTI_EMPTY_VALUE) {
    value = [];
  }

  if (!ownProps.data.multiple && !ownProps.value) {
    value = SINGLE_EMPTY_VALUE;
  }

  return { ...field, value };
}
