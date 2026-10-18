import type { Observation, ProfileProposal } from './types.ts';

export interface ProposalOptions {
  /** Distinct sessions a pattern must appear in before it is proposed. */
  minSessions?: number;
  /** New qualifying sessions needed before a declined or unsure proposal comes back. */
  reproposeAfterSessions?: number;
}

/** Only the owner's own words count as evidence about the owner. */
function ownSessions(o: Observation): Set<string> {
  return new Set(o.evidence.filter((e) => e.author === o.owner).map((e) => e.sitdownId));
}

/**
 * Turns private observations into proposals for their owner to accept, edit or decline.
 * Never writes to a profile. Returns only new proposals.
 */
export function proposalsFromObservations(
  observations: readonly Observation[],
  existing: readonly ProfileProposal[],
  opts: ProposalOptions = {},
): ProfileProposal[] {
  const minSessions = opts.minSessions ?? 3;
  const reproposeAfter = opts.reproposeAfterSessions ?? 2;

  const groups = new Map<string, Observation[]>();
  for (const o of observations) {
    const key = `${o.owner}|${o.field}|${o.patternKey}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(o);
  }

  const out: ProfileProposal[] = [];
  for (const [key, obs] of groups) {
    const sessions = new Set<string>();
    for (const o of obs) for (const s of ownSessions(o)) sessions.add(s);
    if (sessions.size < minSessions) continue;

    const first = obs[0]!;
    const prior = existing.filter(
      (p) => p.owner === first.owner && p.field === first.field && p.patternKey === first.patternKey,
    );

    if (prior.some((p) => p.state === 'pending' || p.state === 'accepted' || p.state === 'edited')) continue;

    const lastDecided = prior.filter((p) => p.sessionsAtDecision !== undefined).at(-1);
    if (lastDecided && sessions.size < (lastDecided.sessionsAtDecision ?? 0) + reproposeAfter) continue;

    const latest = obs.reduce((a, b) => (b.lastSeen > a.lastSeen ? b : a));
    out.push({
      id: `${key}|${prior.length + 1}`,
      owner: first.owner,
      field: first.field,
      patternKey: first.patternKey,
      proposedText: latest.text,
      observationIds: obs.map((o) => o.id),
      state: 'pending',
    });
  }
  return out;
}

/**
 * Data minimisation: observations nobody has acted on are dropped after `maxAgeDays`
 * (default 180, for the reviewers to confirm). Observations behind a pending proposal
 * are kept until the owner decides.
 */
export function pruneStaleObservations(
  observations: readonly Observation[],
  proposals: readonly ProfileProposal[],
  nowIso: string,
  maxAgeDays = 180,
): Observation[] {
  const cutoff = Date.parse(nowIso) - maxAgeDays * 86_400_000;
  if (Number.isNaN(cutoff)) throw new RangeError(`invalid date: ${nowIso}`);
  const held = new Set(proposals.filter((p) => p.state === 'pending').flatMap((p) => p.observationIds));
  return observations.filter((o) => held.has(o.id) || Date.parse(o.lastSeen) >= cutoff);
}

/** Records the owner's decision. Declined and unsure remember how much evidence existed. */
export function decide(
  proposal: ProfileProposal,
  state: Exclude<ProfileProposal['state'], 'pending'>,
  decidedAt: string,
  qualifyingSessions: number,
): ProfileProposal {
  return {
    ...proposal,
    state,
    decidedAt,
    sessionsAtDecision: state === 'declined' || state === 'unsure' ? qualifyingSessions : undefined,
  };
}
