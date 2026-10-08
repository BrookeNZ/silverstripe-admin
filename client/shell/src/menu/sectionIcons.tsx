/**
 * Which icon the menu draws for a CMS section. A pilet's registration wins; otherwise the legacy
 * `menu_icon_class` the server sends as the menu item's `iconClass` picks one of the design's section
 * icons, and anything else gets the generic SectionIcon. A section with a CSS `menu_icon` image
 * (RedirectedURLAdmin) sends no class, so it gets the generic icon too.
 */
import type * as React from 'react';
import type { ComponentType } from 'react';
import { ExtensionSlot } from 'piral-core';
import {
  ArchiveIcon,
  CampaignsIcon,
  FilesIcon,
  PagesIcon,
  ReportsIcon,
  SectionIcon,
  SecurityIcon,
  SettingsIcon,
  TaxonomiesIcon,
} from '@silverstripe/admin-patterns';
import type { IconProps } from '@silverstripe/admin-patterns';

export const legacySectionIcons: Readonly<Record<string, ComponentType<IconProps>>> = {
  'font-icon-box': ArchiveIcon,
  'font-icon-chart-line': ReportsIcon,
  'font-icon-cog': SettingsIcon,
  'font-icon-image': FilesIcon,
  'font-icon-page-multiple': CampaignsIcon,
  'font-icon-sitemap': PagesIcon,
  'font-icon-tags': TaxonomiesIcon,
  'font-icon-torsos-all': SecurityIcon,
};

export function legacySectionIcon(iconClass: string | undefined): ComponentType<IconProps> {
  const names = (iconClass ?? '').split(/\s+/);
  const match = names.find((name) => name in legacySectionIcons);
  return match ? legacySectionIcons[match] : SectionIcon;
}

export function sectionIconSlotName(sectionCode: string): string {
  return `silverstripe:section-icon:${sectionCode}`;
}

export const MenuSectionIcon = ({ code, iconClass }: { code: string; iconClass?: string }) => {
  const Fallback = legacySectionIcon(iconClass);
  return (
    <ExtensionSlot
      name={sectionIconSlotName(code)}
      render={(children: Array<React.ReactNode>) => <>{children[children.length - 1]}</>}
      empty={() => <Fallback />}
    />
  );
};
