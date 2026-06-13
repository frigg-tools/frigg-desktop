import { useAppStore, type Locale } from '../store';
import { common } from './common';
import { traffic } from './traffic';
import { mocks } from './mocks';
import { devices } from './devices';
import { onboarding } from './onboarding';
import { logcat } from './logcat';
import { database } from './database';

export type { Locale };

export interface Bundle {
  en: Record<string, string>;
  pt: Record<string, string>;
}

const bundles: Record<string, Bundle> = {
  common,
  traffic,
  mocks,
  devices,
  onboarding,
  logcat,
  database,
};

const flattened: Record<Locale, Record<string, string>> = { en: {}, pt: {} };
for (const [namespace, bundle] of Object.entries(bundles)) {
  for (const locale of ['en', 'pt'] as const) {
    for (const [key, value] of Object.entries(bundle[locale])) {
      const fullKey = namespace === 'common' ? key : `${namespace}.${key}`;
      flattened[locale][fullKey] = value;
    }
  }
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = flattened[locale][key] ?? flattened.en[key] ?? key;
  return interpolate(template, vars);
}

export function useT(): TranslateFn {
  const locale = useAppStore((s) => s.locale);
  return (key, vars) => translate(locale, key, vars);
}

export function useLocale(): [Locale, (locale: Locale) => void] {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  return [locale, setLocale];
}
