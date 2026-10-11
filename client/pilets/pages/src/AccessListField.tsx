/**
 * The group and user pickers under a page's "Who can view/edit this page?" options, shown only while their
 * option is chosen, as legacy's CanViewType/CanEditType entwine did: the groups picker for "Only these
 * groups" (OnlyTheseUsers), the users picker for "Only these users" (OnlyTheseMembers). A hidden picker
 * still posts its value, as legacy's did.
 *
 * `accessListSchema()` is the `updateFormSchema` handler that routes each picker here when its form also
 * has the matching option field, keeping the picker's own component name in `data.accessList` for this
 * field to render. A form without the option field, or a picker naming no component, is left alone.
 */
import type { ComponentType } from 'react';
import type { FieldComponentProps, FieldSchema, FormSchemaTree, PiletApi } from '@silverstripe/admin-shell';

export const accessListFieldName = 'PagesAccessListField';

// Mirrors InheritedPermissions::ONLY_THESE_USERS and ONLY_THESE_MEMBERS
const shownFor = { Groups: 'OnlyTheseUsers', Members: 'OnlyTheseMembers' } as const;

// The option field each picker prefix answers to, as legacy's checkIfHoldsField paired them
const optionFields: Readonly<Record<string, string>> = {
  Viewer: 'CanViewType',
  Editor: 'CanEditType',
  CreateTopLevel: 'CanCreateTopLevelType',
};

interface AccessList {
  component: string;
  optionField: string;
  shownFor: string;
}

const pickerName = /^(Viewer|Editor|CreateTopLevel)(Groups|Members)$/;

function accessList(field: FieldSchema, optionNames: ReadonlySet<string>): AccessList | null {
  const match = pickerName.exec(field.name.replace(/\[\]$/, ''));
  const optionField = match ? optionFields[match[1]!] : undefined;
  if (!match || !optionField || !optionNames.has(optionField) || !field.component || field.readOnly) {
    return null;
  }
  return { component: field.component, optionField, shownFor: shownFor[match[2] as keyof typeof shownFor] };
}

function names(fields: ReadonlyArray<FieldSchema>, into = new Set<string>()): Set<string> {
  fields.forEach((field) => {
    into.add(field.name);
    names(field.children ?? [], into);
  });
  return into;
}

function withAccessLists(fields: Array<FieldSchema>, optionNames: ReadonlySet<string>): Array<FieldSchema> {
  return fields.map((field) => {
    if (field.children?.length) {
      return { ...field, children: withAccessLists(field.children, optionNames) };
    }
    const list = accessList(field, optionNames);
    return list
      ? { ...field, component: accessListFieldName, data: { ...(Array.isArray(field.data) ? {} : field.data), accessList: list } }
      : field;
  });
}

export function accessListSchema(schema: FormSchemaTree): FormSchemaTree {
  const optionNames = names(schema.fields);
  if (!Object.values(optionFields).some((name) => optionNames.has(name))) {
    return schema;
  }
  return { ...schema, fields: withAccessLists(schema.fields, optionNames) };
}

export const createAccessListField = (api: Pick<PiletApi, 'useFormFieldValue' | 'getSilverstripeComponent'>) => {
  const AccessListField = (props: FieldComponentProps) => {
    const list = (props.field.data as { accessList?: AccessList } | null)?.accessList;
    const option = api.useFormFieldValue(list?.optionField ?? '');
    if (!list) {
      return null;
    }
    // An unposted option field (read only) gives undefined; the server already dropped the unused picker then
    if (option !== undefined && option !== list.shownFor) {
      return null;
    }
    const Picker = api.getSilverstripeComponent(list.component) as unknown as ComponentType<FieldComponentProps>;
    return <Picker {...props} field={{ ...props.field, component: list.component }} />;
  };
  return AccessListField;
};
