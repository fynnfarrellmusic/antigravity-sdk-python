// Makes the tester-passcode verifier for an internal-test build.
//
//   DYVERGE_TESTER_PASSCODE='something long' node scripts/make-verifier.ts
//
// Reads the passcode from the environment so it never lands in shell history
// or argv. Prints a verifier (salt + hash, never the passcode) to paste into
// your build secrets. Do not commit the output.
import { deriveVerifier } from '../src/access.ts';

const ITERATIONS = 210_000;
const passcode = process.env['DYVERGE_TESTER_PASSCODE'];

if (!passcode || passcode.length < 12) {
  console.error('Set DYVERGE_TESTER_PASSCODE to at least 12 characters.');
  process.exit(1);
}

const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
const saltHex = Array.from(salt, (b) => b.toString(16).padStart(2, '0')).join('');
const hashHex = await deriveVerifier(passcode, saltHex, ITERATIONS);

console.log(JSON.stringify({ saltHex, hashHex, iterations: ITERATIONS }, null, 2));
