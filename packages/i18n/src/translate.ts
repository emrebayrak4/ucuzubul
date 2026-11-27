/**
 * ICU MessageFormat translator. Catalogs are flat `{ "ns.key": "ICU message" }` maps; en-US is the
 * base and defines `MessageKey`. Lookup walks the locale's fallback chain (fr-CA → fr-FR → en-US).
 */
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "@pricora/config";
import type { MessageKey } from "./messages/en-US";

export type { MessageKey };
export type Messages = Readonly<Record<MessageKey, string>>;
export type PartialMessages = Readonly<Partial<Record<MessageKey, string>>>;
export type MessageValues = Record<string, string | number | Date | boolean | null | undefined>;

/** Locales whose catalog only overrides a parent (spelling/vocabulary differences). */
export const LOCALE_FALLBACKS: Readonly<Record<Locale, readonly Locale[]>> = {
  "en-US": [],
  "en-GB": ["en-US"],
  "en-AU": ["en-GB", "en-US"],
  "en-CA": ["en-US"],
  "fr-CA": ["fr-FR", "en-US"],
  "de-DE": ["en-US"],
  "fr-FR": ["en-US"],
  "es-ES": ["en-US"],
  "it-IT": ["en-US"],
  "nl-NL": ["en-US"],
  "ja-JP": ["en-US"],
  "tr-TR": ["en-US"],
  "pt-BR": ["en-US"],
};

export type CatalogMap = Readonly<Record<Locale, PartialMessages>>;

export interface Translator {
  locale: Locale;
  /** Formats a message. Missing keys fall back along the chain; unknown keys return the key itself. */
  t: (key: MessageKey, values?: MessageValues) => string;
  /** True when the key exists in this locale's own catalog (not via fallback). */
  has: (key: MessageKey) => boolean;
}

const compiled = new Map<string, IntlMessageFormat>();

export function createTranslator(locale: Locale, catalogs: CatalogMap, onMissing?: (key: string, locale: Locale) => void): Translator {
  const chain: readonly Locale[] = [locale, ...LOCALE_FALLBACKS[locale]];
  const resolve = (key: MessageKey): { msg: string; from: Locale } | null => {
    for (const l of chain) {
      const msg = catalogs[l]?.[key];
      if (msg !== undefined) return { msg, from: l };
    }
    return null;
  };
  return {
    locale,
    has: (key) => catalogs[locale]?.[key] !== undefined,
    t: (key, values) => {
      const hit = resolve(key);
      if (!hit) {
        onMissing?.(key, locale);
        return key;
      }
      // Format with the *requested* locale so plurals/numbers follow it even when text fell back.
      const cacheKey = locale + "\u0000" + hit.from + "\u0000" + key;
      let fmt = compiled.get(cacheKey);
      if (!fmt) {
        fmt = new IntlMessageFormat(hit.msg, locale);
        compiled.set(cacheKey, fmt);
      }
      const out = fmt.format(values as Record<string, string | number | boolean | Date | null | undefined>);
      return Array.isArray(out) ? out.join("") : String(out);
    },
  };
}

/** Placeholder argument names used by an ICU message (for catalog consistency checks). */
export function messageArguments(message: string): string[] {
  const names = new Set<string>();
  const walk = (els: MessageFormatElement[]): void => {
    for (const el of els) {
      if (isArgumentElement(el) || isNumberElement(el) || isDateElement(el) || isTimeElement(el)) names.add(el.value);
      else if (isSelectElement(el) || isPluralElement(el)) {
        names.add(el.value);
        for (const opt of Object.values(el.options)) walk(opt.value);
      } else if (isTagElement(el)) walk(el.children);
    }
  };
  walk(parse(message));
  return [...names].sort();
}
