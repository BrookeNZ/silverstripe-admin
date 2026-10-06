/**
 * Fields without a value of their own: groups, tabs, headings and CMS-authored HTML
 */
import * as React from 'react';
import { flushSync } from 'react-dom';
import { revealFieldEvent } from '../reveal';
import type { FieldComponentProps } from '../types';
import { fieldTitle } from './FieldHolder';
import './tabs.css';

export const CompositeField: React.FC<FieldComponentProps> = ({ field, renderFields }) => (
  <div className="shell-form__group" id={field.holderId}>
    {renderFields(field.children)}
  </div>
);

export const FieldGroup: React.FC<FieldComponentProps> = ({ field, renderFields }) => (
  <div className="shell-form__group shell-form__group--row" id={field.holderId}>
    {renderFields(field.children)}
  </div>
);

export const HeaderField: React.FC<FieldComponentProps> = ({ field }) => {
  const level = Math.min(Math.max(Number(field.data.headingLevel) || 2, 1), 6);
  const Heading = `h${level}` as 'h1';
  const title = typeof field.data.title === 'string' ? field.data.title : fieldTitle(field);
  return (
    <Heading className="shell-form__heading" id={field.id}>
      {title}
    </Heading>
  );
};

export const LiteralField: React.FC<FieldComponentProps> = ({ field, value }) => (
  // The HTML is authored in PHP by the CMS or a module, as the legacy LiteralField renders it
  <div className="shell-form__literal" id={field.id} dangerouslySetInnerHTML={{ __html: String(value ?? '') }} />
);

export const TabItem: React.FC<FieldComponentProps> = ({ field, renderFields }) => <>{renderFields(field.children)}</>;

export const Tabs: React.FC<FieldComponentProps> = ({ field, renderFields }) => {
  const tabs = field.children;
  const [active, setActive] = React.useState(0);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const panelRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const root = React.useRef<HTMLDivElement>(null);

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
    <div className="shell-tabs" id={field.id} ref={root}>
      <div className="shell-tabs__list" role="tablist" aria-label={fieldTitle(field) || undefined} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className="shell-tabs__tab"
            type="button"
            role="tab"
            id={`${tab.id}_tab`}
            aria-controls={tab.id}
            aria-selected={index === active}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
          >
            {fieldTitle(tab)}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        // Inactive panels stay mounted so their fields keep their values and registrations
        <div
          key={tab.id}
          ref={(element) => {
            panelRefs.current[index] = element;
          }}
          className="shell-tabs__panel"
          role="tabpanel"
          id={tab.id}
          aria-labelledby={`${tab.id}_tab`}
          hidden={index !== active}
          tabIndex={0}
        >
          {renderFields([tab])}
        </div>
      ))}
    </div>
  );
};
