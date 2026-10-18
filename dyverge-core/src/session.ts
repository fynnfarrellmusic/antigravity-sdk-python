import type { PersonId, Sitdown, Turn } from './types.ts';

/**
 * Observations may only be drafted from a session where no hard or power gate fired.
 * The profile layer must never become a file kept on a partner.
 */
export function observationsAllowed(turns: readonly Turn[]): boolean {
  return turns.every((t) => t.gate !== 'hard' && t.gate !== 'power');
}

/** True if any turn tripped a gate that ends the session (hard or power). */
export function sessionMustStop(turns: readonly Turn[]): boolean {
  return turns.some((t) => t.gate === 'hard' || t.gate === 'power');
}

/**
 * Anything unconfirmed is dropped: a summary only stands once every person
 * in the sit-down has confirmed it by name and date.
 */
export function confirmedSummary(
  summary: Sitdown['summary'],
  people: readonly PersonId[],
): Sitdown['summary'] | undefined {
  if (!summary) return undefined;
  return people.every((p) => Boolean(summary.confirmedBy[p])) ? summary : undefined;
}

/** Removes one person's words from a sit-down. Needs nobody else's consent. */
export function deleteOwnWords(sitdown: Sitdown, owner: PersonId): Sitdown {
  return {
    ...sitdown,
    turns: sitdown.turns.map((t) =>
      t.author === owner ? { ...t, content: '', kind: 'text' as const } : t,
    ),
    // A summary that rested on deleted words no longer stands.
    summary: undefined,
  };
}
