// The fields are those SilverStripe\Admin\HierarchyTreeHandler documents
function makePage(id, parentId, treeTitle, extra = {}) {
  return {
    id,
    parentId,
    treeTitle,
    tooltip: `(Record type: Page) ${treeTitle}`,
    recordClass: 'Page',
    classes: 'class-Page',
    iconClasses: 'jstree-recordicon record-icon font-icon-page class-Page',
    statusFlags: [],
    hasChildren: false,
    limited: false,
    listViewUrl: null,
    editUrl: `admin/pages/edit/show/${id}`,
    canView: true,
    canEdit: true,
    canAddChildren: true,
    ...extra,
  };
}

const modified = { key: 'modified', text: 'Modified', title: 'Item has unpublished changes' };
const draft = { key: 'addedtodraft', text: 'Draft', title: 'Item has not been published yet' };
// An extension that gives a flag as a plain string sends no title
const externalLink = { key: 'externallink', text: 'External', title: null };

// Children by parent id. Page 3 has more children than the tree shows, so the server marks it limited and sends none.
// Page 9 is one the member cannot view
const children = {
  0: [
    makePage(1, 0, 'Home', { iconClasses: 'jstree-recordicon record-icon font-icon-page class-Page homepage' }),
    makePage(2, 0, 'About us', { hasChildren: true }),
    makePage(3, 0, 'News', { hasChildren: true, limited: true, listViewUrl: 'admin/pages?ParentID=3' }),
    makePage(4, 0, 'Contact us', {
      classes: 'class-Page status-modified',
      statusFlags: [modified],
    }),
  ],
  2: [
    makePage(5, 2, 'Our team', { hasChildren: true }),
    makePage(6, 2, 'History', { classes: 'class-Page status-addedtodraft', statusFlags: [draft] }),
  ],
  5: [
    makePage(7, 5, 'Jane Doe'),
    makePage(8, 5, 'Sam Smith'),
    makePage(9, 5, 'Private profile', { classes: 'class-Page nochildren disabled', canView: false }),
    makePage(10, 5, 'Staff intranet', {
      tooltip: '(Record type: Redirector Page) Staff intranet',
      recordClass: 'SilverStripe\\CMS\\Model\\RedirectorPage',
      classes: 'class-SilverStripe_CMS_Model_RedirectorPage status-externallink',
      iconClasses: 'jstree-recordicon record-icon font-icon-p-redirect class-SilverStripe_CMS_Model_RedirectorPage',
      statusFlags: [externalLink],
    }),
  ],
};

export function getNode(id) {
  return Object.values(children).flat().find((node) => node.id === id);
}

export function getChildren(parentId) {
  const parent = getNode(parentId);
  if (parent && parent.limited) {
    return [];
  }
  return children[parentId] || [];
}

// Ancestor ids, top level first, without 0 and without the page itself
export function getPath(id) {
  const ancestorIds = [];
  let node = getNode(id);
  while (node && node.parentId !== 0) {
    ancestorIds.unshift(node.parentId);
    node = getNode(node.parentId);
  }
  return ancestorIds;
}

// The actions of a request for the parent's children and its response
export function loadActions(parentId, nodes) {
  return [
    { type: 'fetchChildrenRequest', parentId },
    { type: 'fetchChildrenSuccess', parentId, nodes },
  ];
}

export function deferred() {
  const result = {};
  result.promise = new Promise((resolve) => {
    result.resolve = resolve;
  });
  return result;
}

export { makePage };
