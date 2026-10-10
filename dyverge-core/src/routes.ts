/**
 * Support routes by locale. Only locales whose routes have been reviewed appear
 * here. A joint session is not offered to anyone whose locale is not listed,
 * so nobody in a crisis is shown a number that does not work where they are.
 */

export interface SupportRoute {
  name: string;
  contact: string;
  kind: 'call' | 'text' | 'emergency';
}

/** Keyed by ISO 3166 region. UK routes are from the dYverge handoff. */
const REVIEWED: Readonly<Record<string, readonly SupportRoute[]>> = {
  GB: [
    { name: 'Samaritans', contact: '116 123', kind: 'call' },
    { name: 'Shout', contact: '85258', kind: 'text' },
    { name: 'Emergency services', contact: '999', kind: 'emergency' },
  ],
};

function regionOf(locale: string): string | undefined {
  return locale.split('-')[1]?.toUpperCase();
}

/** Undefined means the locale has no reviewed routes, or has no region at all. */
export function supportRoutesFor(locale: string): readonly SupportRoute[] | undefined {
  const region = regionOf(locale);
  return region ? REVIEWED[region] : undefined;
}

/** True only if every person's locale has reviewed support routes. */
export function jointSessionSupported(locales: readonly string[]): boolean {
  return locales.length > 0 && locales.every((l) => supportRoutesFor(l) !== undefined);
}
