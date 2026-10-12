/**
 * Stands in for the admin's i18n module until the shell offers translations through the Pilet API:
 * every key renders its default text, and inject() fills `{name}` placeholders as the legacy one does
 */
export default {
  _t(key: string, defaultText: string): string {
    return defaultText;
  },
  inject(text: string, values: Record<string, unknown>): string {
    return text.replace(/{([^{}]+)}/g, (match, name) => (name in values ? String(values[name]) : match));
  },
};
