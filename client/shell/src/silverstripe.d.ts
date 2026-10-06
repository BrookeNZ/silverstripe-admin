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
  [key: string]: unknown;
}

declare global {
  interface Window {
    ss: {
      config: SilverstripeClientConfig;
    };
  }
}
