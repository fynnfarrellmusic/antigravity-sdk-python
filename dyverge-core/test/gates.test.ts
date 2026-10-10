import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { GATE_LANGUAGES, assessText, checkCoverage, dominantScript, runGates } from '../src/index.ts';
import { originalRunGates } from './original-gates.ts';

// What these tests prove, and what they do not: they prove the drafts are self-consistent
// (each pattern fires on the phrases it was written for, and stays quiet on everyday speech)
// and that English behaves exactly as before. They do NOT prove real-world coverage in any
// language. That needs native speakers and a clinician.

const ENGLISH_CORPUS = [
  // hard
  'I want to die', "I don't want to be here anymore", 'thinking about suicide', 'I might hurt myself', 'took an overdose',
  "everyone would be better off without me", 'I want to end my life', 'there is no point in living',
  // soft
  "I can't do this anymore", 'I give up', "what's the point", 'running on fumes', 'nothing matters', "I can't cope",
  // power
  "that's just your autism talking", 'because you\'re autistic', 'normal people don\'t do that', "it's not that loud",
  "you're imagining it", 'stop pretending', 'you are pathetic and you never listen and you ruin everything you touch',
  // benign
  'Can you call me when you get home?', "I'm tired and I want to go to bed", 'Dinner at seven?', 'Fine.',
  'I want to die laughing at that joke'.replace('die', 'go'), 'We need to talk', 'You never listen to me',
  "I'm so stupid, I forgot the keys", 'That was a ridiculous film', 'Thanks, see you tomorrow',
  'What time is the appointment?', 'I love you', 'Please reply when you can', 'Why did you do that?',
  'I can do this', 'The point of the meeting was unclear', 'It was dramatic but fun', 'He is crazy about football',
];

describe('English is unchanged', () => {
  it('matches the original gates on a corpus of hard, soft, power and everyday text', () => {
    for (const text of ENGLISH_CORPUS) assert.equal(runGates(text), originalRunGates(text), text);
  });

  it('matches the original on thousands of random benign English sentences (no new false positives)', () => {
    const vocab = `go home make tea call later maybe tomorrow dinner work late tired happy sorry thanks please
      bus train phone message coffee walk park cat dog music film book game sleep weather rain sun lunch busy
      free meeting email send reply wait soon again today tonight morning evening weekend plan idea problem
      fix clean wash cook pay book visit friend family mum dad sister brother house flat street shop market
      price cheap early quiet loud bright warm cold slow fast easy hard simple small big new old good bad
      nice great fine okay yes no maybe really very quite just only also still already yet`.split(/\s+/);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 4000; i++) {
      const n = 3 + Math.floor(rnd() * 12);
      const text = Array.from({ length: n }, () => vocab[Math.floor(rnd() * vocab.length)]).join(' ');
      assert.equal(runGates(text), originalRunGates(text), text);
    }
  });

  it('never declines English, including slang and very short text', () => {
    for (const text of [...ENGLISH_CORPUS, 'ok', 'k', 'lol ok', 'Nice one!!', 'Brilliant, thanks heaps mate', 'sure whatever', '12345', '😀👍']) {
      assert.notEqual(assessText(text).action, 'decline', text);
      assert.notEqual(checkCoverage(text).status, 'unsupported', text);
    }
  });
});

interface Sample {
  hard: string[];
  soft: string[];
  power: string[];
  benign: string[];
  coverage: string;
}

const SAMPLES: Record<string, Sample> = {
  es: {
    hard: ['Quiero morirme', 'no quiero seguir viviendo', 'Estoy pensando en el suicidio', 'todos estarían mejor sin mí', 'he tomado una sobredosis', 'voy a hacerme daño'],
    soft: ['No puedo más', 'Estoy harta de todo', 'me rindo'],
    power: ['Eso es solo tu autismo', 'No es para tanto, deja de exagerar', 'Eres un inútil y tú siempre lo arruinas'],
    benign: ['Quiero ir a casa a descansar', 'Me quiero comer una pizza', 'Estoy cansada, voy a dormir', 'No puedo ir hoy porque trabajo', 'Qué loco el tráfico hoy', '¿Cómo estás? Todo bien por aquí'],
    coverage: 'Estoy muy cansada y no sé qué decir hoy',
  },
  fr: {
    hard: ['Je veux mourir', "j'ai envie de me tuer", 'je ne veux plus vivre', 'ils seraient mieux sans moi', 'je pense au suicide', 'je vais me faire du mal'],
    soft: ["Je n'en peux plus", "j'abandonne", 'à quoi bon', "j'en ai marre de tout"],
    power: ["C'est juste ton autisme", 'Arrête de faire semblant', 'Tu es nul, tu es ridicule et tu exagères'],
    benign: ['Je veux manger une pizza', 'Je suis fatigué, je vais dormir', 'Je veux partir en vacances', 'Tu veux venir ce soir ?'],
    coverage: 'Je suis très fatigué et je ne sais pas quoi dire',
  },
  de: {
    hard: ['Ich will sterben', 'ich möchte mich umbringen', 'ich denke an Suizid', 'es wäre besser ohne mich', 'Ich will nicht mehr leben', 'Überdosis'],
    soft: ['Ich kann nicht mehr', 'Ich gebe auf', 'Ich halte es nicht mehr aus'],
    power: ['Das ist nur dein Autismus', 'Du bildest dir das nur ein', 'Du bist dumm und dramatisch, du übertreibst immer, du'],
    benign: ['Ich will nach Hause gehen', 'Ich möchte einen Kaffee', 'Ich bin müde und gehe schlafen'],
    coverage: 'Ich bin sehr müde und weiß nicht, was ich sagen soll',
  },
  pt: {
    hard: ['Quero morrer', 'não quero mais viver', 'estariam melhor sem mim', 'estou pensando em suicídio', 'tomei uma overdose'],
    soft: ['Não aguento mais', 'Eu desisto', 'estou cansada de tudo'],
    power: ['Isso é só o seu autismo', 'Para de fingir', 'Você é inútil e burro, você nunca ouve'],
    benign: ['Quero ir para casa', 'Estou cansado, vou dormir', 'Vamos jantar hoje?'],
    coverage: 'Estou muito cansada e não sei o que dizer',
  },
  it: {
    hard: ['Voglio morire', 'non voglio più vivere', 'starebbero meglio senza di me', 'penso al suicidio', 'voglio farmi del male'],
    soft: ['Non ce la faccio più', 'Mi arrendo', 'sono stanca di tutto'],
    power: ['È solo il tuo autismo', 'Smettila di fingere', 'Sei patetico e inutile, tu sei sempre così'],
    benign: ['Voglio andare a casa', 'Sono stanco, vado a dormire', 'Cosa mangiamo stasera?'],
    coverage: 'Sono molto stanca e non so cosa dire',
  },
  pl: {
    hard: ['Chcę umrzeć', 'nie chcę już żyć', 'myślę o samobójstwie', 'lepiej bez mnie', 'przedawkowałem'],
    soft: ['Nie dam już rady', 'Poddaję się', 'mam dość wszystkiego'],
    power: ['To tylko twój autyzm', 'Przestań udawać', 'Jesteś żałosny i głupi, ty zawsze to robisz'],
    benign: ['Chcę iść do domu', 'Jestem zmęczony, idę spać', 'Co robimy wieczorem?'],
    coverage: 'Jestem bardzo zmęczona i nie wiem co powiedzieć',
  },
  ru: {
    hard: ['Хочу умереть', 'не хочу больше жить', 'я думаю о суициде', 'без меня будет лучше', 'хочу покончить с собой'],
    soft: ['Я больше не могу', 'Я сдаюсь', 'нет сил'],
    power: ['Это просто твой аутизм', 'Хватит притворяться', 'Ты жалкий и тупой, ты всегда всё портишь'],
    benign: ['Хочу домой', 'Я устал и пойду спать', 'Что на ужин?'],
    coverage: 'Я очень устала и не знаю что сказать',
  },
  ar: {
    hard: ['أريد أن أموت', 'لا أريد أن أعيش', 'أفكر في الانتحار', 'الجميع أفضل بدوني', 'جرعة زائدة'],
    soft: ['لا أستطيع أن أكمل', 'لم أعد أحتمل', 'استسلمت'],
    power: ['هذا فقط بسبب توحدك', 'توقف عن المبالغة'],
    benign: ['أريد أن أذهب إلى البيت', 'أنا متعب وسأنام', 'ماذا سنأكل الليلة؟'],
    coverage: 'أنا متعب جدا ولا أعرف ماذا أقول',
  },
  hi: {
    hard: ['मैं मरना चाहता हूँ', 'आत्महत्या', 'मैं जीना नहीं चाहती', 'खुद को नुकसान पहुँचाना', 'मेरे बिना सब बेहतर होगा'],
    soft: ['अब और नहीं सह सकता', 'मैं हार गया'],
    power: ['यह सिर्फ तुम्हारा ऑटिज्म है'],
    benign: ['मुझे घर जाना है', 'मैं थक गया हूँ, सोने जा रहा हूँ', 'आज रात खाने में क्या है?'],
    coverage: 'मैं बहुत थक गया हूँ और मुझे नहीं पता क्या कहूँ',
  },
};

describe('draft gates in other languages (self-consistency only)', () => {
  for (const [lang, s] of Object.entries(SAMPLES)) {
    it(`${lang}: catches its hard, soft and power phrases and stays quiet on everyday speech`, () => {
      for (const t of s.hard) assert.equal(runGates(t), 'hard', `${lang} hard: ${t}`);
      for (const t of s.soft) assert.equal(runGates(t), 'soft', `${lang} soft: ${t}`);
      for (const t of s.power) assert.equal(runGates(t), 'power', `${lang} power: ${t}`);
      for (const t of s.benign) assert.equal(runGates(t), null, `${lang} benign: ${t}`);
    });

    it(`${lang}: is recognised as a draft language`, () => {
      const c = checkCoverage(s.coverage);
      assert.deepEqual([c.status, c.language], ['draft', lang], s.coverage);
    });
  }

  it('lists exactly English (baseline) plus nine drafts', () => {
    assert.equal(GATE_LANGUAGES.length, 10);
    assert.deepEqual(GATE_LANGUAGES.filter((l) => l.status === 'baseline').map((l) => l.code), ['en']);
    assert.deepEqual(GATE_LANGUAGES.filter((l) => l.status === 'draft').map((l) => l.code).sort(), Object.keys(SAMPLES).sort());
  });

  it('catches phrases typed without accents, as on a phone', () => {
    assert.equal(runGates('estaria mejor sin mi'), 'hard');
    assert.equal(runGates('Ich moechte mich umbringen'), 'hard');
    assert.equal(runGates('je ne veux plus vivre'), 'hard');
    assert.equal(runGates('Chce umrzec'), 'hard');
    assert.equal(runGates('nao aguento mais'), 'soft');
  });

  it('copes with curly apostrophes and capitals', () => {
    assert.equal(runGates('J’ABANDONNE'), 'soft');
    assert.equal(runGates("Je N’EN PEUX PLUS"), 'soft');
  });

  it('catches a crisis phrase in any language inside text in another', () => {
    assert.equal(runGates('I feel so low today, quiero morirme'), 'hard');
    assert.equal(runGates('Je suis fatigué. I want to die.'), 'hard');
    assert.equal(runGates('Çok yorgunum ve her şeyden bıktım, I want to die'), 'hard');
  });

  it('does not use lookbehind, which older iPhones cannot parse', () => {
    assert.doesNotMatch(readFileSync(new URL('../src/gates.ts', import.meta.url), 'utf8'), /\(\?<[!=]/);
  });
});

describe('languages with no gates are declined, never passed as checked', () => {
  const UNSUPPORTED: Record<string, string> = {
    turkish: 'Çok yorgunum ve ne diyeceğimi bilmiyorum, ben her şeyden bıkmıştım ama bir şey yok',
    dutch: 'Ik ben heel moe en ik weet niet wat ik moet zeggen',
    swedish: 'Jag är jättetrött och vet inte vad jag ska säga',
    chinese: '我很累，不知道该说什么',
    japanese: '疲れました、何を言えばいいかわかりません',
    korean: '너무 피곤해서 뭐라고 해야 할지 모르겠어요',
    hebrew: 'אני עייף ולא יודע מה להגיד',
    greek: 'Είμαι πολύ κουρασμένος και δεν ξέρω τι να πω',
    thai: 'ฉันเหนื่อยมากและไม่รู้จะพูดอะไร',
    ukrainian: 'Я дуже втомився і не знаю що казати, їжа',
    persian: 'من خیلی خسته‌ام و نمی‌دانم چه بگویم',
  };
  for (const [name, text] of Object.entries(UNSUPPORTED)) {
    it(`declines ${name}`, () => {
      assert.equal(checkCoverage(text).status, 'unsupported', text);
      assert.equal(assessText(text).action, 'decline');
    });
  }

  it('still stops on a hard phrase it recognises, even in an unsupported language', () => {
    assert.equal(assessText('Çok yorgunum ve her şeyden bıktım ama bir şey yok, I want to die').action, 'stop');
  });

  it('declines before it would report soft or power in unsupported text', () => {
    assert.equal(assessText('Ik ben heel moe en ik weet niet wat ik moet zeggen, I give up').action, 'decline');
  });
});

describe('what the app does with each result', () => {
  it('stops on hard, whatever the language', () => {
    for (const t of ['I want to die', 'Quiero morirme', 'Хочу умереть', 'मैं मरना चाहता हूँ']) {
      assert.equal(assessText(t).action, 'stop', t);
    }
  });

  it('passes ordinary text in English and in draft languages, marking drafts', () => {
    assert.deepEqual(assessText('Dinner at seven?').action, 'ok');
    const es = assessText('Estoy muy cansada y no sé qué decir hoy');
    assert.equal(es.action, 'ok');
    assert.equal(es.coverage.status, 'draft');
  });

  it('keeps the original order: hard, then power, then soft', () => {
    assert.equal(assessText("that's just your autism talking, I give up").action, 'power');
    assert.equal(assessText("I give up").action, 'soft');
  });

  it('can switch the drafts off: they are declined until reviewed, English and hard phrases are not', () => {
    const off = { allowDrafts: false };
    for (const lang of Object.keys(SAMPLES)) {
      const t = SAMPLES[lang]!.coverage;
      assert.equal(assessText(t, off).action, 'decline', lang);
      assert.equal(assessText(t).action, 'ok', `${lang} with drafts on`);
    }
    assert.equal(assessText('Dinner at seven? Let me know.', off).action, 'ok');
    assert.equal(assessText('Estoy muy cansada, quiero morirme', off).action, 'stop');
    assert.equal(assessText('I want to die', off).action, 'stop');
  });

  it('reads scripts', () => {
    assert.equal(dominantScript('hello'), 'latin');
    assert.equal(dominantScript('привет'), 'cyrillic');
    assert.equal(dominantScript('مرحبا'), 'arabic');
    assert.equal(dominantScript('नमस्ते'), 'devanagari');
    assert.equal(dominantScript('你好'), 'han');
    assert.equal(dominantScript('123 !!'), null);
  });
});
