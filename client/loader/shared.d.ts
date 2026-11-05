/** Types for ./shared.js, `@silverstripe/admin/shared` */

/** Each import map specifier the admin provides, mapped to the name of the file in `shared/` that serves it */
export declare const sharedFiles: Readonly<Record<string, string>>;

/** The import map specifiers the admin provides; a module keeps each external */
export declare const sharedSpecifiers: ReadonlyArray<string>;

/** The exact version of each shared npm package the shared files are built from, pinned by the dev dependencies */
export declare const sharedVersions: Readonly<Record<string, string>>;
