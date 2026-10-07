/**
 * Fields without a value of their own: groups, tabs, headings and server-authored HTML
 */
import * as React from 'react';
import { flushSync } from 'react-dom';
import { fieldTitle } from './FieldHolder';
import { revealFieldEvent } from './reveal';
import { TabStrip } from './TabStrip';
import type { FieldDescriptor, FieldProps } from './types';

export const CompositeField = ({ field, renderFields }: FieldProps) => (
  <div className="admin-group" id={field.holderId}>
    {renderFields(field.children)}
  </div>
);

export const FieldGroup = ({ field, renderFields }: FieldProps) => (
  <div className="admin-group admin-group--row" id={field.holderId}>
    {renderFields(field.children)}
  </div>
);

export const HeaderField = ({ field }: FieldProps) => {
  const level = Math.min(Math.max(Number(field.headingLevel) || 2, 1), 6);
  const Heading = `h${level}` as 'h1';
  return (
    <Heading className="admin-heading" id={field.id}>
      {fieldTitle(field)}
    </Heading>
  );
};

export const LiteralField = ({ field, value }: FieldProps) => (
  // The value is server-authored HTML, rendered the way the legacy LiteralField renders it
  <div className="admin-literal" id={field.id} dangerouslySetInnerHTML={{ __html: String(value ?? '') }} />
);

export const TabItem = ({ field, renderFields }: FieldProps) => <>{renderFields(field.children)}</>;

export const Tabs = ({ field, renderFields }: FieldProps) => {
  const tabs = field.children;
  const [active, setActive] = React.useState(0);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const panelRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const root = React.useRef<HTMLDivElement>(null);
  // Schema tab ids are not unique per form (every block form has a Root_Main, as the page form does)
  const scope = React.useId();
  const panelId = (tab: FieldDescriptor) => `${scope}${tab.id}`;

  React.useEffect(() => {
    const element = root.current;
    const reveal = (event: Event) => {
      const index = panelRefs.current.findIndex((panel) => panel?.contains(event.target as Node));
      if (index >= 0) {
        flushSync(() => setActive(index));
      }
    };
    element?.addEventListener(revealFieldEvent, reveal);
    return () => element?.removeEventListener(revealFieldEvent, reveal);
  }, []);

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: tabs.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      focusTab(moves[event.key]);
    }
  };

  return (
    <div className="admin-tabs" id={field.id} ref={root}>
      <TabStrip
        className="admin-tab-strip--lined"
        role="tablist"
        aria-label={fieldTitle(field) || undefined}
        onKeyDown={onKeyDown}
        items={tabs.map((tab, index) => ({
          key: tab.id,
          label: fieldTitle(tab),
          current: index === active,
          buttonProps: {
            ref: (element: HTMLButtonElement | null) => {
              tabRefs.current[index] = element;
            },
            role: 'tab',
            id: `${panelId(tab)}_tab`,
            'aria-controls': panelId(tab),
            'aria-selected': index === active,
            tabIndex: index === active ? 0 : -1,
            onClick: () => setActive(index),
          },
        }))}
      />
      {tabs.map((tab, index) => (
        // Inactive panels stay mounted so their fields keep their values and registrations
        <div
          key={tab.id}
          ref={(element) => {
            panelRefs.current[index] = element;
          }}
          className="admin-tabs__panel"
          role="tabpanel"
          id={panelId(tab)}
          aria-labelledby={`${panelId(tab)}_tab`}
          hidden={index !== active}
          tabIndex={0}
        >
          {renderFields([tab])}
        </div>
      ))}
    </div>
  );
};
