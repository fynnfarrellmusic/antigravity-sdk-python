// The app's ORIGINAL English gates, copied verbatim from the unmodified file (commit 18e4fba).
// Kept only so a test can prove the new engine behaves identically on English.
/* eslint-disable */
const HARD = /\b(kill(ing)? myself|suicid\w*|end (it all|my life)|want(ed)? to die|don'?t want to (be alive|live|exist|be here any ?more)|better off without me|no (point|reason) (in )?(living|being alive|going on)|hurt(ing)? myself|self[- ]?harm\w*|overdos\w*|take all my (pills|tablets|meds))\b/i;
const SOFT = /\b(can'?t (do|take|keep doing) (this|it) any ?more|can'?t keep going|i give up|what'?s the point( of anything)?|nothing left( in me)?|so tired of (everything|all of it)|running on fumes|done with everything|can'?t cope|barely holding (on|it together)|nothing matters)\b/i;
const COERCION = /\b(that'?s (just )?your (autism|adhd|ptsd|trauma|anxiety|ocd|pda|diagnosis)( talking)?|because you'?re (autistic|adhd|mental|crazy)|your (autism|adhd|diagnosis|condition|disorder) (is|makes|means)|(using|hiding behind) your (diagnosis|autism|adhd|condition)|normal people (don'?t|wouldn'?t|can))\b/i;
const SENSORY_DENIAL = /\b(it'?s not (even )?(that )?(loud|bright|bad|scratchy)|you can'?t (actually|really) (hear|feel|smell) (that|it)|it doesn'?t (actually |even )?hurt|stop (pretending|making it up)|you'?re (just )?imagining it)\b/i;
const CONTEMPT = /\b(pathetic|disgusting|useless|worthless|stupid|idiot|psycho|crazy|embarrassing|dramatic|too sensitive|overreacting|ridiculous)\b/i;

function powerCheck(str: string): boolean {
  if (COERCION.test(str) || SENSORY_DENIAL.test(str)) return true;
  const yous = (str.match(/\byou('re| are|r)?\b/gi) || []).length;
  return CONTEMPT.test(str) && yous >= 3;
}
export function originalRunGates(str: string): 'hard' | 'power' | 'soft' | null {
  if (HARD.test(str)) return "hard";
  if (powerCheck(str)) return "power";
  if (SOFT.test(str)) return "soft";
  return null;
}
