/**
 * Stands in for the admin's i18n module until the shell offers translations through the Pilet API:
 * every key renders its default text
 */
export default {
  _t(key: string, defaultText: string): string {
    return defaultText;
  },
};
