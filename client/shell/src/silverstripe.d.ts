export interface SilverstripeSection {
  name: string;
  url: string;
  reactRoutePath?: string;
  form?: Record<string, { schemaUrl: string }>;
  [key: string]: unknown;
}

export interface SilverstripeMenuItem {
  code: string;
  title: string;
  link: string;
  iconClass: string;
  current: boolean;
}

export interface SilverstripeClientConfig {
  sections: Array<SilverstripeSection>;
  baseUrl: string;
  absoluteBaseUrl: string;
  adminUrl: string;
  environment: string;
  debugging: boolean;
  /** Each record class with a table, mapped to its ancestors from its parent up to DataObject */
  recordClasses?: Record<string, Array<string>>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    ss: {
      config: SilverstripeClientConfig;
    };
  }
}
