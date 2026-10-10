/**
 * Access control for modules that have not been through clinical or legal review.
 *
 * Restricted modules are OFF by default. They can only be turned on in an
 * 'internal-test' build, by a tester who knows the passcode, and they relock
 * every time the app starts. In a 'production' build they can never be turned on.
 *
 * Honest limit: this is a client-side gate in a local-first app. It stops
 * accidental exposure and casual use; it does not stop someone with the code and
 * a debugger. The real protection is build-time exclusion: do not bundle
 * restricted modules into production builds at all. See dyverge-core/README.md.
 */

export type ModuleId =
  | 'sitdown-facilitator'
  | 'observation-drafting'
  | 'profile-proposals'
  | 'screening';

export type Review = 'clinical' | 'legal';

export interface ModuleInfo {
  id: ModuleId;
  title: string;
  needsReview: readonly Review[];
  why: string;
}

/** Every module here is restricted until its listed reviews have signed off. */
export const RESTRICTED_MODULES: readonly ModuleInfo[] = [
  {
    id: 'sitdown-facilitator',
    title: 'Sit-down facilitator',
    needsReview: ['clinical', 'legal'],
    why: 'An AI facilitates a conversation between two people, including possible disclosures of risk.',
  },
  {
    id: 'observation-drafting',
    title: 'Observation drafting',
    needsReview: ['clinical', 'legal'],
    why: 'Infers descriptions of how a person communicates from their words. Health-adjacent personal data.',
  },
  {
    id: 'profile-proposals',
    title: 'Profile proposals',
    needsReview: ['clinical'],
    why: 'Proposes changes to a person’s own profile. Wording could act as a label.',
  },
  {
    id: 'screening',
    title: 'Safety screening',
    needsReview: ['clinical', 'legal'],
    why: 'Screens for risk before a joint session. Content must come from a clinician.',
  },
];

export type Environment = 'production' | 'internal-test';

export interface PasscodeVerifier {
  saltHex: string;
  hashHex: string;
  iterations: number;
}

export interface AccessConfig {
  environment: Environment;
  /** Injected at build time from a secret. Never committed. */
  verifier?: PasscodeVerifier;
  /** Failed attempts before unlocking is refused until the app restarts. */
  maxAttempts?: number;
  now?: () => string;
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'production' | 'no-verifier' | 'locked-out' | 'wrong-passcode' };

export interface AuditEvent {
  at: string;
  module: ModuleId | '*';
  action: 'unlock' | 'unlock-failed' | 'lock' | 'denied';
  detail?: string;
}

export class AccessDeniedError extends Error {
  readonly moduleId: ModuleId;
  constructor(moduleId: ModuleId) {
    super(`Module "${moduleId}" is restricted and not enabled.`);
    this.name = 'AccessDeniedError';
    this.moduleId = moduleId;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** PBKDF2-SHA256, 256-bit, hex. Use this at build time to make the verifier. */
export async function deriveVerifier(passcode: string, saltHex: string, iterations: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex) as BufferSource, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface Access {
  isEnabled(id: ModuleId): boolean;
  /** Throws AccessDeniedError unless the module is enabled. Call at every entry point. */
  require(id: ModuleId): void;
  unlock(id: ModuleId, passcode: string): Promise<UnlockResult>;
  lock(id: ModuleId): void;
  lockAll(): void;
  /** Warning to show on any screen of an unlocked module. */
  banner(id: ModuleId): string;
  /** Local record of unlocks, failures and denials. Never contains a passcode or user content. */
  auditLog(): readonly AuditEvent[];
}

export function createAccess(config: AccessConfig): Access {
  const maxAttempts = config.maxAttempts ?? 5;
  const now = config.now ?? (() => new Date().toISOString());
  // In memory only: restricted modules relock whenever the app starts.
  const unlocked = new Set<ModuleId>();
  const log: AuditEvent[] = [];
  let failures = 0;

  const record = (e: Omit<AuditEvent, 'at'>) => void log.push({ at: now(), ...e });
  const known = (id: ModuleId) => RESTRICTED_MODULES.some((m) => m.id === id);

  return {
    isEnabled(id) {
      return config.environment === 'internal-test' && unlocked.has(id);
    },

    require(id) {
      if (!this.isEnabled(id)) {
        record({ module: id, action: 'denied' });
        throw new AccessDeniedError(id);
      }
    },

    async unlock(id, passcode) {
      if (!known(id)) throw new Error(`unknown module "${id}"`);
      if (config.environment !== 'internal-test') {
        record({ module: id, action: 'unlock-failed', detail: 'production' });
        return { ok: false, reason: 'production' };
      }
      if (!config.verifier) {
        record({ module: id, action: 'unlock-failed', detail: 'no-verifier' });
        return { ok: false, reason: 'no-verifier' };
      }
      if (failures >= maxAttempts) {
        record({ module: id, action: 'unlock-failed', detail: 'locked-out' });
        return { ok: false, reason: 'locked-out' };
      }
      const { saltHex, hashHex, iterations } = config.verifier;
      const attempt = await deriveVerifier(passcode, saltHex, iterations);
      if (!constantTimeEqual(attempt, hashHex.toLowerCase())) {
        failures += 1;
        record({ module: id, action: 'unlock-failed', detail: 'wrong-passcode' });
        return { ok: false, reason: failures >= maxAttempts ? 'locked-out' : 'wrong-passcode' };
      }
      failures = 0;
      unlocked.add(id);
      record({ module: id, action: 'unlock' });
      return { ok: true };
    },

    lock(id) {
      if (unlocked.delete(id)) record({ module: id, action: 'lock' });
    },

    lockAll() {
      if (unlocked.size > 0) record({ module: '*', action: 'lock' });
      unlocked.clear();
    },

    banner(id) {
      const m = RESTRICTED_MODULES.find((x) => x.id === id);
      const reviews = m ? m.needsReview.join(' and ') : 'clinical and legal';
      return `Internal test. Not yet through ${reviews} review. Not for real use. Use made-up details only.`;
    },

    auditLog() {
      return log.map((e) => ({ ...e }));
    },
  };
}

/** Wraps a function so it throws unless its module is enabled. */
export function guard<A extends unknown[], R>(
  access: Access,
  id: ModuleId,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args: A): R => {
    access.require(id);
    return fn(...args);
  };
}
