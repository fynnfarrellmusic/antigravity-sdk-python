import type { PersonId, Zone } from './types.ts';

/**
 * Battery 0-100 to zone. Steady 66-100, Stretched 31-65, Flooded 0-30.
 * 'skipped' counts as steady, as in the Check-In Gate.
 */
export function zoneFromBattery(battery: number | 'skipped'): Zone {
  if (battery === 'skipped') return 'steady';
  if (!Number.isFinite(battery) || battery < 0 || battery > 100) {
    throw new RangeError(`battery must be 0-100 or 'skipped', got ${battery}`);
  }
  if (battery <= 30) return 'flooded';
  if (battery <= 65) return 'stretched';
  return 'steady';
}

export type StartDecision =
  | { ok: true }
  | { ok: false; reason: 'flooded'; personIds: PersonId[] };

/** A sit-down never starts while either person is flooded. */
export function canStartSitdown(zones: Record<PersonId, Zone>): StartDecision {
  const flooded = Object.entries(zones)
    .filter(([, zone]) => zone === 'flooded')
    .map(([id]) => id);
  return flooded.length === 0 ? { ok: true } : { ok: false, reason: 'flooded', personIds: flooded };
}
