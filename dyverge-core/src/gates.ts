// Safety gates in many languages, run on the device before anything is sent.
//
// SELF-CONTAINED on purpose (type imports only): scripts/build-app.ts strips the types
// and inlines this file into dyverge-app.jsx, so the tests here cover the code the app runs.
//
// HONEST STATUS. English is the app's original baseline (the regular expressions are copied
// verbatim from the app, and a test proves the behaviour is unchanged). Every other language
// is a DRAFT written without native-speaker or clinical review. Drafts are better than no
// gate, but they cover less than English and will miss things. The app therefore says so at
// the point of use, and declines text in languages it has no gates for at all.
//
// How a text is handled:
//   1. Every language's gates run on every text (a union), so mixed-language text and a
//      wrongly guessed language cannot hide a crisis phrase.
//   2. A hard hit always stops the flow, whatever the language.
//   3. Text in a language with no gates is declined, because the app cannot check it.
//   4. Otherwise power and soft hits are reported as before.

import type { GateOutcome } from './types.ts';

export type Action = 'stop' | 'decline' | 'power' | 'soft' | 'ok';
export type Script =
  | 'latin'
  | 'cyrillic'
  | 'arabic'
  | 'devanagari'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'hebrew'
  | 'greek'
  | 'thai'
  | 'other';

export interface Coverage {
  /** baseline: English, the original lists. draft: new and partial. unsupported: no gates. */
  status: 'baseline' | 'draft' | 'unsupported';
  language: string | null;
  script: Script | null;
}

export interface Assessment {
  gate: GateOutcome;
  coverage: Coverage;
  action: Action;
}

// ── English: verbatim from the app, so behaviour does not change ─────────────────────────────

const EN_HARD = /\b(kill(ing)? myself|suicid\w*|end (it all|my life)|want(ed)? to die|don'?t want to (be alive|live|exist|be here any ?more)|better off without me|no (point|reason) (in )?(living|being alive|going on)|hurt(ing)? myself|self[- ]?harm\w*|overdos\w*|take all my (pills|tablets|meds))\b/i;
const EN_SOFT = /\b(can'?t (do|take|keep doing) (this|it) any ?more|can'?t keep going|i give up|what'?s the point( of anything)?|nothing left( in me)?|so tired of (everything|all of it)|running on fumes|done with everything|can'?t cope|barely holding (on|it together)|nothing matters)\b/i;
const EN_COERCION = /\b(that'?s (just )?your (autism|adhd|ptsd|trauma|anxiety|ocd|pda|diagnosis)( talking)?|because you'?re (autistic|adhd|mental|crazy)|your (autism|adhd|diagnosis|condition|disorder) (is|makes|means)|(using|hiding behind) your (diagnosis|autism|adhd|condition)|normal people (don'?t|wouldn'?t|can))\b/i;
const EN_SENSORY = /\b(it'?s not (even )?(that )?(loud|bright|bad|scratchy)|you can'?t (actually|really) (hear|feel|smell) (that|it)|it doesn'?t (actually |even )?hurt|stop (pretending|making it up)|you'?re (just )?imagining it)\b/i;
const EN_CONTEMPT = /\b(pathetic|disgusting|useless|worthless|stupid|idiot|psycho|crazy|embarrassing|dramatic|too sensitive|overreacting|ridiculous)\b/i;

function englishPower(text: string): boolean {
  if (EN_COERCION.test(text) || EN_SENSORY.test(text)) return true;
  const yous = (text.match(/\byou('re| are|r)?\b/gi) || []).length;
  return EN_CONTEMPT.test(text) && yous >= 3;
}

// ── Other languages: DRAFT lexicons ──────────────────────────────────────────────────────────
// Patterns are regex sources in a small DSL: `<` and `>` are word boundaries, `\w` matches any
// letter. Text and patterns are folded the same way (case, accents, script variants), so
// patterns are written in natural spelling and still match unaccented phone typing.

interface Lexicon {
  hard: string[];
  soft: string[];
  coercion: string[];
  sensory: string[];
  contempt: string[];
  /** Second-person markers, counted to tell contempt aimed at someone from a stray word. */
  you: string;
  youMin: number;
}

interface LanguageDef {
  code: string;
  name: string;
  script: Script;
  /** Arabic and Hindi attach prefixes to words, so patterns match inside words. */
  bounded: boolean;
  lex: Lexicon;
}

const LANGUAGES: readonly LanguageDef[] = [
  {
    code: 'es',
    name: 'Español',
    script: 'latin',
    bounded: true,
    lex: {
      hard: [
        '<(quiero|queria|quisiera|prefiero) (morir|morirme|matarme|desaparecer|acabar con todo|terminar con todo|quitarme la vida)>',
        '<me (quiero|voy a|quisiera) (morir|matar|suicidar)\\w*>',
        '<suicid\\w*>',
        '<no quiero (vivir|seguir viviendo|seguir aqui|estar aqui|existir|estar vivo|estar viva)>',
        '<(estarian|estarias|estaria) mejor sin mi>',
        '<no (tiene|tendria) sentido (vivir|seguir viviendo|seguir)>',
        '<(hacerme dano|autolesion\\w*|autolesionarme)>',
        '<sobredosis>',
        '<tomarme todas (las )?(pastillas|pildoras|medicinas)>',
      ],
      soft: [
        '<no puedo (mas|seguir|con esto)>',
        '<me rindo>',
        '<no aguanto mas>',
        '<(harto|harta) de todo>',
        '<nada (importa|tiene sentido)>',
        '<para que (sigo|seguir)>',
        '<sin fuerzas para (nada|seguir)>',
      ],
      coercion: [
        '<(eso|esto) es (solo )?(tu|por tu) (autismo|tdah|trauma|ansiedad|toc|diagnostico)>',
        '<por (tu|ese) (autismo|tdah|diagnostico|trastorno)>',
        '<(usas|te escondes tras|te escudas en) tu (diagnostico|autismo|tdah|trastorno)>',
        '<la gente normal (no|nunca|jamas)>',
      ],
      sensory: [
        '<(no es|no esta) (tan )?(fuerte|alto|ruidoso|brillante|para tanto)>',
        '<te lo (estas )?inventando>',
        '<deja de (fingir|exagerar|inventar)>',
      ],
      contempt: [
        '<(patetico|patetica|asqueroso|asquerosa|inutil|estupido|estupida|idiota|loco|loca|ridiculo|ridicula|exagerado|exagerada|dramatico|dramatica|demasiado sensible)>',
      ],
      you: '<(tu|tus|te|ti|eres|estas|tienes|haces|dijiste|hiciste)>',
      youMin: 2,
    },
  },
  {
    code: 'fr',
    name: 'Français',
    script: 'latin',
    bounded: true,
    lex: {
      hard: [
        "<(je veux|je voudrais|j'ai envie de|envie de) (mourir|me tuer|en finir|disparaitre|me suicider)>",
        '<suicid\\w*>',
        '<je (ne )?veux plus (vivre|etre la|exister)>',
        '<mieux sans moi>',
        '<(ca|cela) ne vaut plus la peine de vivre>',
        '<plus aucune raison de vivre>',
        "<(me faire du mal|automutil\\w*|m'automutiler|me scarifier)>",
        '<overdose>',
        '<prendre tous (mes|les) (cachets|medicaments|comprimes)>',
      ],
      soft: [
        "<je n'en peux plus>",
        "<j'en peux plus>",
        '<je ne peux plus (continuer|tenir)>',
        "<j'abandonne>",
        '<a quoi bon>',
        "<(je suis|j'en ai) (epuise|epuisee|marre) de tout>",
        "<rien n'a (plus )?d'importance>",
        "<je n'arrive plus a (tenir|continuer)>",
      ],
      coercion: [
        "<c'est (juste |a cause de )?ton (autisme|tdah|trauma|anxiete|toc|diagnostic)>",
        '<(a cause de|avec) ton (autisme|tdah|diagnostic|trouble)>',
        "<tu (te caches|t'abrites) derriere (ton|tes) (diagnostic|autisme|tdah|trouble)>",
        "<les gens normaux (ne|n')>",
      ],
      sensory: [
        "<(ce n'est|c'est) pas (si|aussi|vraiment) (fort|bruyant|lumineux|grave)>",
        "<tu (l'inventes|t'imagines ca|te l'imagines)>",
        '<arrete de (faire semblant|te plaindre|exagerer)>',
        '<ca ne (te )?fait pas (vraiment )?mal>',
      ],
      contempt: [
        '<(pathetique|degoutant|degoutante|nul|nulle|inutile|stupide|idiot|idiote|debile|dingue|fou|folle|ridicule|dramatique|trop sensible|exageres?)>',
      ],
      you: '<(tu|toi|ton|ta|tes|te|vous|votre|vos)>',
      youMin: 2,
    },
  },
  {
    code: 'de',
    name: 'Deutsch',
    script: 'latin',
    bounded: true,
    lex: {
      hard: [
        '<ich (will|moechte|mochte) (sterben|mich umbringen|nicht mehr leben|mir das leben nehmen|verschwinden)>',
        '<(suizid|selbstmord)\\w*>',
        '<ich will nicht mehr (leben|da sein)>',
        '<keine lust mehr (zu leben|auf das leben)>',
        '<besser ohne mich>',
        '<ohne mich (waere|ware|waren|waeren) \\w+ besser>',
        '<(mich selbst verletzen|selbstverletz\\w*|mir wehtun|mir weh tun)>',
        '<(ueberdosis|uberdosis)>',
        '<alle (meine )?(tabletten|pillen) nehmen>',
      ],
      soft: [
        '<ich kann nicht mehr>',
        '<ich halte (es )?nicht mehr aus>',
        '<ich gebe auf>',
        '<es hat alles keinen sinn>',
        '<(habe|hab) (alles|es) satt>',
        '<nichts (hat|macht) (mehr )?sinn>',
      ],
      coercion: [
        '<das ist (nur |bloss )?(dein|deine|an deinem) (autismus|adhs|trauma|angst|diagnose|storung|zwang)\\w*>',
        '<du (versteckst dich|benutzt|nutzt) (hinter )?(deine[rn]?|dein) (diagnose|autismus|adhs)>',
        '<normale menschen (tun|machen|wurden|wuerden) (das )?nicht>',
      ],
      sensory: [
        '<(es|das) ist (gar )?nicht (so )?(laut|hell|schlimm|stark)>',
        '<du bildest (dir|das) (das )?(nur )?ein>',
        '<(hor|hoer) auf (zu )?(simulieren|ubertreiben|uebertreiben|dich anzustellen|so zu tun)>',
      ],
      contempt: [
        '<(erbarmlich|erbaermlich|ekelhaft|nutzlos|dumm|idiot|verruckt|verrueckt|lacherlich|laecherlich|dramatisch|zu empfindlich|uberempfindlich|hysterisch)>',
      ],
      you: '<(du|dich|dir|dein\\w*|ihr|euch)>',
      youMin: 2,
    },
  },
  {
    code: 'pt',
    name: 'Português',
    script: 'latin',
    bounded: true,
    lex: {
      hard: [
        '<(eu )?(quero|queria|preferia) (morrer|me matar|sumir para sempre|acabar com tudo|tirar a minha vida|tirar minha vida)>',
        '<suicid\\w*>',
        '<nao quero (mais )?(viver|existir|estar aqui)>',
        '<melhor sem mim>',
        '<nao (faz|tem) sentido (viver|continuar vivendo|continuar)>',
        '<(me machucar|me ferir|automutilacao|autolesao)>',
        '<overdose>',
        '<tomar todos os (comprimidos|remedios|medicamentos)>',
      ],
      soft: [
        '<nao aguento mais>',
        '<nao consigo mais>',
        '<eu desisto>',
        '<para que (continuar|seguir)>',
        '<nada (importa|faz sentido)>',
        '<cansad[oa] de tudo>',
        '<sem forcas para (nada|continuar)>',
      ],
      coercion: [
        '<isso e (so |apenas )?(o |do )?(seu|teu) (autismo|tdah|trauma|ansiedade|toc|diagnostico)>',
        '<por causa d[oe] (seu|teu) (autismo|tdah|diagnostico|transtorno)>',
        '<se (esconde|escuda) (atras|por tras) d[oe] (seu|teu) (diagnostico|autismo|tdah)>',
        '<pessoas normais (nao|nunca)>',
      ],
      sensory: [
        '<nao (e|esta) (tao )?(alto|forte|barulhento|claro|para tanto)>',
        '<(esta|estas|ta) (so )?(inventando|imaginando|fingindo)>',
        '<para de (fingir|exagerar|inventar)>',
      ],
      contempt: [
        '<(patetico|patetica|nojento|nojenta|inutil|burro|burra|estupido|estupida|idiota|louco|louca|ridiculo|ridicula|dramatico|dramatica|sensivel demais|exagerado|exagerada)>',
      ],
      you: '<(voce|voces|tu|te|ti|seu|sua|teu|tua)>',
      youMin: 2,
    },
  },
  {
    code: 'it',
    name: 'Italiano',
    script: 'latin',
    bounded: true,
    lex: {
      hard: [
        '<(voglio|vorrei|preferirei) (morire|uccidermi|sparire|farla finita|togliermi la vita)>',
        '<suicid\\w*>',
        '<non voglio (piu )?(vivere|esistere|stare qui|essere qui)>',
        '<meglio senza di me>',
        '<non ha (piu )?senso (vivere|andare avanti)>',
        '<(farmi del male|autolesion\\w*|tagliarmi le vene)>',
        '<overdose>',
        '<prendere tutte le (pastiglie|pillole|medicine)>',
      ],
      soft: [
        '<non ce la faccio piu>',
        '<non posso piu (andare avanti|continuare)>',
        '<mi arrendo>',
        '<(niente|nulla) (importa|ha senso|ha piu senso)>',
        '<sono stanc[oa] di tutto>',
        '<non ho piu forze>',
      ],
      coercion: [
        '<e (solo )?(colpa )?(del |per il |il )?tuo (autismo|adhd|trauma|ansia|toc|disturbo|diagnosi)>',
        '<ti nascondi dietro (la tua diagnosi|il tuo autismo|il tuo adhd)>',
        '<la gente normale (non|mai)>',
      ],
      sensory: [
        '<non e (cosi |poi )?(forte|alto|rumoroso|luminoso|tanto grave)>',
        '<te lo stai (inventando|immaginando)>',
        '<smettila di (fingere|esagerare|inventare)>',
      ],
      contempt: [
        '<(patetico|patetica|disgustoso|disgustosa|inutile|stupido|stupida|idiota|pazzo|pazza|ridicolo|ridicola|drammatico|drammatica|troppo sensibile|esagerato|esagerata)>',
      ],
      you: '<(tu|ti|te|tuo|tua|tuoi|tue|sei|hai|fai)>',
      youMin: 2,
    },
  },
  {
    code: 'pl',
    name: 'Polski',
    script: 'latin',
    bounded: true,
    lex: {
      hard: [
        '<(chce|chcialbym|chcialabym) (umrzec|sie zabic|zniknac|skonczyc ze soba|odebrac sobie zycie)>',
        '<(samobojstw|samobojcz)\\w*>',
        '<nie chce (juz )?(zyc|istniec|tu byc)>',
        '<lepiej (byloby )?bez mnie>',
        '<nie ma (juz )?sensu (zyc|zyc dalej)>',
        '<(okaleczac sie|samookaleczen\\w*|zrobic sobie krzywde)>',
        '<przedawkowa\\w*>',
        '<wziac wszystkie tabletki>',
      ],
      soft: [
        '<nie dam (juz )?rady>',
        '<nie mam (juz )?sily>',
        '<poddaje sie>',
        '<po co (to wszystko|dalej)>',
        '<nic (juz )?nie ma (sensu|znaczenia)>',
        '<mam dosc (wszystkiego|tego wszystkiego)>',
      ],
      coercion: [
        '<to (tylko )?(twoj|twoje|przez twoj\\w*) (autyzm|adhd|trauma|lek|diagnoza|zaburzenie)>',
        '<chowasz sie za (swoja diagnoza|autyzmem|adhd)>',
        '<normalni ludzie (nie|tak nie)>',
      ],
      sensory: [
        '<wcale nie (jest )?(glosno|jasno|tak zle)>',
        '<ty to sobie (wymyslasz|wmawiasz)>',
        '<przestan (udawac|przesadzac|wymyslac)>',
      ],
      contempt: [
        '<(zalosny|zalosna|obrzydliwy|obrzydliwa|bezuzyteczny|glupi|glupia|idiota|idiotka|szalony|szalona|smieszny|dramatyzujesz|przewrazliwiony|przewrazliwiona)>',
      ],
      you: '<(ty|ci|cie|ciebie|twoj\\w*|twoja|jestes|masz|robisz)>',
      youMin: 2,
    },
  },
  {
    code: 'ru',
    name: 'Русский',
    script: 'cyrillic',
    bounded: true,
    lex: {
      hard: [
        '<(хочу|хотел бы|хотела бы|хочется) (умереть|покончить с собой|исчезнуть|убить себя|сдохнуть)>',
        '<(суицид|самоубийств)\\w*>',
        '<не хочу (больше )?(жить|существовать|быть здесь)>',
        '<лучше без меня>',
        '<без меня (будет|было бы) лучше>',
        '<нет (больше )?смысла (жить|продолжать)>',
        '<(причинить себе вред|навредить себе|резать себя|самоповреждени\\w*)>',
        '<передозировк\\w*>',
        '<выпить все (таблетки|лекарства)>',
      ],
      soft: [
        '<я (больше )?не (могу|выдерживаю|справляюсь)>',
        '<не могу (больше|так больше)>',
        '<я сдаюсь>',
        '<(зачем|для чего) (все|продолжать)>',
        '<ничего (не )?(имеет значения|важно|имеет смысла)>',
        '<устал[аи]? от всего>',
        '<нет сил>',
      ],
      coercion: [
        '<это (просто |все )?(твой|твоя|твое|из-за твоего|из-за твоей) (аутизм\\w*|сдвг|травм\\w*|тревог\\w*|диагноз\\w*)>',
        '<прячешься за (диагнозом|аутизмом|сдвг)>',
        '<нормальные люди (так )?не>',
      ],
      sensory: [
        '<(это )?не так (громко|ярко|плохо|больно)>',
        '<тебе (это )?(кажется|мерещится)>',
        '<хватит (притворяться|выдумывать|преувеличивать)>',
      ],
      contempt: [
        '<(жалкий|жалкая|отвратительный|отвратительная|бесполезный|бесполезная|тупой|тупая|идиот|идиотка|псих|смешной|смешная|истеричка|слишком чувствительный|слишком чувствительная|преувеличиваешь)>',
      ],
      you: '<(ты|тебя|тебе|тобой|твой|твоя|твое|твои)>',
      youMin: 2,
    },
  },
  {
    code: 'ar',
    name: 'العربية',
    script: 'arabic',
    bounded: false,
    lex: {
      hard: [
        '(اريد|ابغي|ودي|بدي|عايز|عاوز|ابي|نفسي) (ان )?(اموت|انتحر|اقتل نفسي|اختفي|انهي حياتي)',
        'انتحار|انتحر',
        'لا اريد (ان )?(اعيش|استمر)',
        '(افضل|احسن) بدوني',
        'لا فائده من (الحياه|العيش)',
        '(ايذاء نفسي|اوذي نفسي|اؤذي نفسي)',
        'جرعه (زائده|زايده)',
      ],
      soft: [
        'لا استطيع (ان )?(اكمل|الاستمرار|التحمل)',
        'لم اعد (استطيع|احتمل)',
        'ما عدت احتمل',
        'استسلمت',
        'تعبت من كل شيء',
        'لا شيء يهم',
      ],
      coercion: ['(هذا|هذه) (فقط )?بسبب (توحدك|تشخيصك)', 'تختبئ خلف تشخيصك', 'الناس الطبيعيون لا'],
      sensory: ['انت تتخيل', 'توقف عن (التمثيل|المبالغه)'],
      contempt: ['(مثير للشفقه|مقرف|عديم الفائده|غبي|غبيه|احمق|مجنون|مجنونه|سخيف|حساس جدا|تبالغ)'],
      you: '(انت|انتي)',
      youMin: 2,
    },
  },
  {
    code: 'hi',
    name: 'हिन्दी',
    script: 'devanagari',
    bounded: false,
    lex: {
      hard: [
        '(मरना चाहता|मरना चाहती|मर जाना चाहता|मर जाना चाहती|जीना नहीं चाहता|जीना नहीं चाहती|जान दे देना|खुद को खत्म|खुद को मार)',
        'आत्महत्या|खुदकुशी',
        '(खुद को|अपने आप को) (नुकसान|चोट)',
        'ओवरडोज़|ओवरडोज',
        'मेरे बिना (सब )?बेहतर',
        'जीने का कोई (मतलब|मकसद) नहीं',
        'सारी (गोलियां|गोलियाँ|दवाइयां|दवाइयाँ) (खा|ले)',
      ],
      soft: [
        'अब (और )?नहीं (सह|हो पाता|कर सकता|कर सकती)',
        'हार (मान )?(गया|गई|ली)',
        'किसी चीज़ का कोई मतलब नहीं',
        'सब से थक (गया|गई)',
      ],
      coercion: ['यह (सिर्फ )?तुम्हारा (ऑटिज़्म|ऑटिज्म|एडीएचडी|ट्रॉमा)', 'सामान्य लोग ऐसा नहीं'],
      sensory: ['इतना (तेज़|तेज|शोर) नहीं है'],
      contempt: ['(बेकार|मूर्ख|पागल|घटिया|नौटंकी|बेवकूफ)'],
      you: '(तुम|तुम्हें|तुम्हारा|तुम्हारी|तू|तेरा|तेरी)',
      youMin: 2,
    },
  },
];

// ── Folding and compiling ────────────────────────────────────────────────────────────────────

function fold(text: string, script: Script): string {
  let t = text.replace(/[‘’ʼ]/g, "'").toLowerCase();
  if (script === 'latin') {
    t = t
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/ł/g, 'l')
      .replace(/ß/g, 'ss')
      .replace(/ø/g, 'o')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/đ/g, 'd')
      .replace(/ı/g, 'i');
  } else if (script === 'cyrillic') {
    t = t.normalize('NFC').replace(/ё/g, 'е');
  } else if (script === 'arabic') {
    t = t
      .normalize('NFC')
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه');
  } else {
    t = t.normalize('NFC');
  }
  return t;
}

// No lookbehind: older iPhones (before iOS 16.4) throw on it, which would stop the app loading.
const BOUND_L = '(?:^|[^\\p{L}\\p{N}])';
const BOUND_R = '(?![\\p{L}\\p{N}])';

function dsl(source: string, def: LanguageDef, flags = 'iu'): RegExp {
  let s = fold(source, def.script).replaceAll('\\w', '[\\p{L}\\p{N}_]');
  s = def.bounded ? s.replaceAll('<', BOUND_L).replaceAll('>', BOUND_R) : s.replaceAll('<', '').replaceAll('>', '');
  return new RegExp(s, flags);
}

interface Compiled {
  def: LanguageDef;
  hard: RegExp;
  soft: RegExp;
  coercion: RegExp;
  sensory: RegExp;
  contempt: RegExp;
  youAll: RegExp;
}

const alt = (def: LanguageDef, list: string[]): RegExp => dsl(`(?:${list.join('|')})`, def);

const COMPILED: readonly Compiled[] = LANGUAGES.map((def) => ({
  def,
  hard: alt(def, def.lex.hard),
  soft: alt(def, def.lex.soft),
  coercion: alt(def, def.lex.coercion),
  sensory: alt(def, def.lex.sensory),
  contempt: alt(def, def.lex.contempt),
  youAll: dsl(def.lex.you, def, 'giu'),
}));

// ── The gates ────────────────────────────────────────────────────────────────────────────────

/**
 * The gate outcome for a text, across every language at once.
 * Order of precedence is the app's: hard, then power, then soft.
 */
export function runGates(text: string): GateOutcome {
  let hard = EN_HARD.test(text);
  let power = englishPower(text);
  let soft = EN_SOFT.test(text);

  const folded = new Map<Script, string>();
  const get = (script: Script): string => {
    let f = folded.get(script);
    if (f === undefined) {
      f = fold(text, script);
      folded.set(script, f);
    }
    return f;
  };

  for (const c of COMPILED) {
    const t = get(c.def.script);
    if (c.hard.test(t)) hard = true;
    if (c.soft.test(t)) soft = true;
    if (c.coercion.test(t) || c.sensory.test(t)) power = true;
    else if (c.contempt.test(t) && (t.match(c.youAll) || []).length >= c.def.lex.youMin) power = true;
  }

  if (hard) return 'hard';
  if (power) return 'power';
  if (soft) return 'soft';
  return null;
}

// ── Coverage: can the app check this text at all? ────────────────────────────────────────────

const SCRIPT_TESTS: readonly [Script, RegExp][] = [
  ['latin', /\p{Script=Latin}/gu],
  ['cyrillic', /\p{Script=Cyrillic}/gu],
  ['arabic', /\p{Script=Arabic}/gu],
  ['devanagari', /\p{Script=Devanagari}/gu],
  ['han', /\p{Script=Han}/gu],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/gu],
  ['hangul', /\p{Script=Hangul}/gu],
  ['hebrew', /\p{Script=Hebrew}/gu],
  ['greek', /\p{Script=Greek}/gu],
  ['thai', /\p{Script=Thai}/gu],
];

/** The script most of the letters are in, or null if there are no letters to read. */
export function dominantScript(text: string): Script | null {
  let best: Script | null = null;
  let bestN = 0;
  let known = 0;
  for (const [script, re] of SCRIPT_TESTS) {
    const n = (text.match(re) || []).length;
    known += n;
    if (n > bestN) {
      best = script;
      bestN = n;
    }
  }
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters === 0) return null;
  if (letters - known > bestN) return 'other';
  return best;
}

// Common function words, folded, two letters or more. Used only to tell languages apart.
const STOPWORDS: Readonly<Record<string, string>> = {
  en: 'the and to of in is it you that for on with as was are be this but not have my me we they so do what if at from how just can will would don didn doesn isn feel like about all your when know really want need get got going been too very more there their them then than',
  es: 'el la los las de que en un una es no por con para mi me se lo te pero como mas estoy eres esta este muy ya yo tu al del su sus nos les cuando porque todo todos fue ser tengo tienes hay',
  fr: 'le la les des un une et est en que pas pour je tu il elle nous vous ce mais avec sur dans ne suis tout mon ma mes du au aux qui fait plus sont etre ai as avez cette ces comme',
  de: 'der die das und ist nicht ich du ein eine zu mit den dem es auf fur sie wir aber wie auch von hast bin mein meine dich mich dir mir ihr sich noch nur schon wenn dass war sind haben',
  pt: 'os as de que em um uma nao para com eu voce se mas como mais estou muito ja meu minha isso ele ela dos das ao na no por seu sua nos tudo foi ser tenho tem',
  it: 'il lo gli le di che in un una non per con io tu mi ti ma come piu sono molto gia mio mia questo questa del della dei delle al nel sei hai cosa tutto anche perche',
  pl: 'nie na to jest sie ze do ale jak co ja ty mnie mi ci bardzo tak juz czy dla po za tylko moj moje jestem jestes masz mam sobie przez tego tym tez',
  nl: 'de het een van niet ik je jij dat op met voor maar zijn ben heb aan ook wat nog dit wel naar mijn mij hij zij ze wij toch zo bij geen',
  tr: 'bir bu icin ben sen ne da de mi ile cok ama gibi var yok daha ve ben biz siz onlar kadar sonra her hic cunku evet hayir',
  sv: 'och att det ar jag inte du som med men har om mig dig var en ett pa av fran till kan ska vill mycket bara',
  ro: 'si sa nu un de la eu tu cu pe este mai dar care ce sunt foarte mea meu tot acum doar fara pentru',
  id: 'yang dan di ini itu saya aku kamu tidak dengan untuk dari ada akan juga sudah lagi bisa kalau karena sangat apa',
  cs: 'je se na to ze ale jsem ty jak nebo ve pro tak uz ne jsi mam muj moje vsechno kdyz protoze jen',
};

const STOPSETS: Readonly<Record<string, Set<string>>> = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words.split(' '))]),
);
const SUPPORTED_LATIN = ['en', 'es', 'fr', 'de', 'pt', 'it', 'pl'];
const UNSUPPORTED_LATIN = ['nl', 'tr', 'sv', 'ro', 'id', 'cs'];

function tokens(text: string): string[] {
  return fold(text, 'latin')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
}

function hits(words: string[], lang: string): number {
  const set = STOPSETS[lang]!;
  let n = 0;
  for (const w of words) if (set.has(w)) n++;
  return n;
}

function latinCoverage(text: string): Coverage {
  const words = tokens(text);
  const n = words.length;
  if (n < 3) return { status: 'baseline', language: null, script: 'latin' };

  let bestSupported = 'en';
  let bestSupportedHits = hits(words, 'en');
  for (const lang of SUPPORTED_LATIN) {
    const h = hits(words, lang);
    if (h > bestSupportedHits) {
      bestSupported = lang;
      bestSupportedHits = h;
    }
  }
  let bestOther = '';
  let bestOtherHits = 0;
  for (const lang of UNSUPPORTED_LATIN) {
    const h = hits(words, lang);
    if (h > bestOtherHits) {
      bestOther = lang;
      bestOtherHits = h;
    }
  }

  if (bestOtherHits >= 3 && bestOtherHits >= 1.5 * bestSupportedHits && bestOtherHits / n >= 0.25) {
    return { status: 'unsupported', language: bestOther, script: 'latin' };
  }
  if (bestSupported !== 'en' && bestSupportedHits >= 2 && bestSupportedHits > hits(words, 'en')) {
    return { status: 'draft', language: bestSupported, script: 'latin' };
  }
  return { status: 'baseline', language: 'en', script: 'latin' };
}

/** Whether the app has gates for this text's language, and how much to trust them. */
export function checkCoverage(text: string): Coverage {
  const script = dominantScript(text);
  if (!script) return { status: 'baseline', language: null, script: null };
  switch (script) {
    case 'latin':
      return latinCoverage(text);
    case 'cyrillic':
      return /[іїєґ]/i.test(text)
        ? { status: 'unsupported', language: 'uk', script }
        : { status: 'draft', language: 'ru', script };
    case 'arabic':
      return /[پچژگٹڈڑںے]/.test(text)
        ? { status: 'unsupported', language: null, script }
        : { status: 'draft', language: 'ar', script };
    case 'devanagari':
      return { status: 'draft', language: 'hi', script };
    default:
      return { status: 'unsupported', language: null, script };
  }
}

export interface AssessOptions {
  /**
   * Whether draft languages are used. Set false to treat them as unsupported (declined) until
   * they have been reviewed. A hard phrase still stops in every language either way.
   */
  allowDrafts?: boolean;
}

/**
 * What to do with a text. A hard hit always stops. Text the app cannot check is declined,
 * never passed through as if it had been checked.
 */
export function assessText(text: string, opts: AssessOptions = {}): Assessment {
  const gate = runGates(text);
  let coverage = checkCoverage(text);
  if (coverage.status === 'draft' && opts.allowDrafts === false) coverage = { ...coverage, status: 'unsupported' };
  let action: Action = 'ok';
  if (gate === 'hard') action = 'stop';
  else if (coverage.status === 'unsupported') action = 'decline';
  else if (gate === 'power') action = 'power';
  else if (gate === 'soft') action = 'soft';
  return { gate, coverage, action };
}

/** The languages that have gates, for display and for tests. */
export const GATE_LANGUAGES: readonly { code: string; name: string; status: 'baseline' | 'draft' }[] = [
  { code: 'en', name: 'English', status: 'baseline' },
  ...LANGUAGES.map((l) => ({ code: l.code, name: l.name, status: 'draft' as const })),
];
