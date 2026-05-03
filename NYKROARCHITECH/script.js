function waitForTone(callback) {
  if (typeof Tone !== 'undefined' && typeof Midi !== 'undefined') {
    callback();
  } else {
    setTimeout(() => waitForTone(callback), 100);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  waitForTone(() => {

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const STEPS    = 64;
const MEASURES = 8;
const rootNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const chromaticNotes = [];
for (let o = 6; o >= 2; o--)
  rootNames.slice().reverse().forEach(n => chromaticNotes.push(n + o));

// ═══════════════════════════════════════════════════════════════════
//  AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════
const masterComp = new Tone.Compressor(-18, 4).toDestination();
const masterRev  = new Tone.Reverb({ decay: 2.8, wet: 0.15 }).connect(masterComp);
const masterDel  = new Tone.FeedbackDelay("8n.", 0.2).connect(masterRev);
const limiter    = new Tone.Limiter(-3).toDestination();
masterRev.connect(limiter);

// ─── LEAD SYNTH ONLY ───
function makeLead() {
  const s = new Tone.PolySynth(Tone.Synth).connect(masterDel);
  s.set({ oscillator:{ type:"triangle" }, envelope:{ attack:0.005, decay:0.2, sustain:0.15, release:0.2 }, volume:-6 });
  return s;
}

let leadSynth = makeLead();

const ornSynth = new Tone.PolySynth(Tone.Synth).connect(masterDel);
ornSynth.set({ oscillator:{ type:"sine" }, envelope:{ attack:0.001, decay:0.06, sustain:0.0, release:0.04 }, volume:-14 });

const chordSynth = new Tone.PolySynth(Tone.Synth).connect(masterRev);
chordSynth.set({ volume:-24, oscillator:{ type:"triangle" }, envelope:{ attack:0.3, sustain:0.7, release:2 } });

const bassSynth = new Tone.MonoSynth().connect(masterComp);
bassSynth.set({ oscillator:{ type:"sawtooth" }, envelope:{ attack:0.01, decay:0.25, sustain:0.5, release:0.4 }, volume:-10, filterEnvelope:{ attack:0.01, decay:0.2, sustain:0.5, release:0.4, baseFrequency:200, octaves:2 } });

Tone.Transport.bpm.value = 120;

// ═══════════════════════════════════════════════════════════════════
//  CHORD VOICING STATE
// ═══════════════════════════════════════════════════════════════════
let activeVoicing   = 'triad';   // triad | sus2 | sus4 | maj7 | min7 | dom7 | add9 | dim | aug
let activeInversion = 0;          // 0 1 2 3
let builderSequence = [];         // array of deg indices

// ═══════════════════════════════════════════════════════════════════
//  SCALES + PROGRESSIONS (greatly expanded)
// ═══════════════════════════════════════════════════════════════════
const scales = {
  aeolian: { name:"Minor Natural (Aeolian)", intervals:[0,2,3,5,7,8,10], progs:[
    {p:[0,5,3,4,0,5,3,4], label:"EPIC PASSION",    desc:"VIAJE ÉPICO — i VI IV V"},
    {p:[0,6,5,4,0,6,5,0], label:"DARK SADNESS",    desc:"MELANCOLÍA — i VII VI V"},
    {p:[5,3,0,4,5,3,4,0], label:"BALLAD",          desc:"BALADA CON RESOLUCIÓN"},
    {p:[0,3,4,0,3,4,5,0], label:"ANTHEM MINOR",    desc:"HIMNO OSCURO ASCENDENTE"},
    {p:[0,5,6,3,0,5,4,0], label:"ROMANTIC",        desc:"ROMÁNTICO — i VI VII iv"},
    {p:[0,0,5,5,3,3,4,4], label:"EXTENDED",        desc:"TENSIÓN SOSTENIDA 2X"},
    {p:[0,2,3,5,4,3,5,0], label:"MODAL DRIFT",     desc:"DERIVA MODAL EXPRESIVA"},
    {p:[5,4,0,3,5,4,3,0], label:"RETROGRADE",      desc:"PROGRESIÓN INVERTIDA"},
  ]},
  dorian: { name:"Dorian (Techno/House)", intervals:[0,2,3,5,7,9,10], progs:[
    {p:[0,3,6,3,0,3,4,0], label:"DEEP CLUB",       desc:"SOFISTICACIÓN TECHNO"},
    {p:[0,2,0,4,0,2,3,0], label:"ENERGY BOOST",    desc:"ENERGÍA HOUSE"},
    {p:[1,4,0,3,1,4,3,0], label:"GROOVE LOOP",     desc:"LOOP HIPNÓTICO"},
    {p:[0,4,3,0,4,3,2,0], label:"DETROIT",         desc:"DETROIT TECHNO CLÁSICO"},
    {p:[0,3,0,5,4,0,3,0], label:"MINIMAL",         desc:"MINIMALISMO PROFUNDO"},
  ]},
  phrygian: { name:"Phrygian (Psytrance)", intervals:[0,1,3,5,7,8,10], progs:[
    {p:[0,1,0,1,0,1,4,0], label:"DARK PSY",        desc:"SONIDO MALIGNO"},
    {p:[0,6,1,0,6,1,4,0], label:"ALIEN TENSION",   desc:"TENSIÓN EXTRATERRESTRE"},
    {p:[1,0,1,4,1,0,4,0], label:"PSY DRIVE",       desc:"GROOVE IMPARABLE"},
    {p:[0,1,3,0,1,4,0,1], label:"HYPNOTIC",        desc:"LOOP HIPNÓTICO OSCURO"},
  ]},
  phrygianDom: { name:"Phrygian Dominant (Spanish)", intervals:[0,1,4,5,7,8,10], progs:[
    {p:[0,1,3,0,1,3,4,0], label:"FLAMENCO",        desc:"GROOVE FLAMENCO ELECTRÓNICO"},
    {p:[0,3,1,4,3,1,4,0], label:"ARABIC FIRE",     desc:"FUEGO ORIENTAL"},
    {p:[0,1,0,4,3,1,4,0], label:"ANDALUSIAN",      desc:"CADENCIA ANDALUZA CLÁSICA"},
  ]},
  harmonicMinor: { name:"Harmonic Minor", intervals:[0,2,3,5,7,8,11], progs:[
    {p:[0,3,4,0,3,4,5,0], label:"VAMPIRE",         desc:"DRAMA GÓTICO — i iv V i"},
    {p:[4,0,3,4,0,3,4,0], label:"CINEMATIC",       desc:"SCORE CINEMATOGRÁFICO"},
    {p:[0,5,4,3,5,4,3,0], label:"BAROQUE",         desc:"BARROCO ELECTRÓNICO"},
    {p:[0,2,4,0,3,4,5,0], label:"NEOCLASSIC",      desc:"FUSIÓN NEOCLÁSICA"},
  ]},
  melodicMinor: { name:"Melodic Minor", intervals:[0,2,3,5,7,9,11], progs:[
    {p:[0,3,4,3,0,3,4,0], label:"JAZZY TECHNO",    desc:"FUSIÓN JAZZ-TECHNO"},
    {p:[1,4,0,3,1,4,3,0], label:"NOIR GROOVE",     desc:"JAZZ OSCURO MINIMAL"},
    {p:[0,1,3,5,4,3,1,0], label:"ASCENDING",       desc:"ESCALA ASCENDENTE JAZZ"},
  ]},
  hungarianMin: { name:"Hungarian Minor", intervals:[0,2,3,6,7,8,11], progs:[
    {p:[0,3,6,0,3,6,4,0], label:"EASTERN BLOC",    desc:"TEXTURA DEL ESTE"},
    {p:[0,5,3,6,5,3,4,0], label:"FOLKLORE",        desc:"FOLK ELECTRÓNICO"},
    {p:[0,6,3,4,6,3,4,0], label:"CARPATHIAN",      desc:"MISTERIO CARPÁTICO"},
  ]},
  locrian: { name:"Locrian (Extreme)", intervals:[0,1,3,4,6,8,9], progs:[
    {p:[0,1,4,0,1,4,3,0], label:"CHAOS",           desc:"CAOS CONTROLADO"},
    {p:[0,3,1,4,3,1,4,0], label:"ABYSS",           desc:"OSCURIDAD SIN FONDO"},
    {p:[0,1,3,6,4,1,3,0], label:"FRACTURED",       desc:"REALIDAD FRACTURADA"},
  ]},
  major: { name:"Major (Ionian)", intervals:[0,2,4,5,7,9,11], progs:[
    {p:[0,3,4,0,3,4,5,0], label:"ANTHEM",          desc:"HIMNO ÉPICO — I IV V I"},
    {p:[0,5,3,4,0,5,3,0], label:"POP LOOP",        desc:"LOOP POP — I VI IV V"},
    {p:[0,4,5,3,4,5,3,0], label:"STADIUM",         desc:"ROCK DE ESTADIO"},
    {p:[0,3,0,4,0,3,4,0], label:"EUPHORIC",        desc:"EUFORIA PURA — I IV I V"},
    {p:[0,1,3,4,0,1,3,0], label:"DIATONIC",        desc:"MOVIMIENTO DIATÓNICO"},
    {p:[0,5,4,3,0,5,4,0], label:"BEATLES",         desc:"MOVIMIENTO CLÁSICO BEATLES"},
    {p:[5,3,4,0,5,3,4,0], label:"AXIS",            desc:"LOOP DEL EJE — vi IV V I"},
    {p:[0,3,4,3,0,3,4,0], label:"PLAGAL",          desc:"CADENCIA PLAGAL ÉPICA"},
  ]},
  lydian: { name:"Lydian (Dream)", intervals:[0,2,4,6,7,9,11], progs:[
    {p:[0,1,4,0,1,4,5,0], label:"FLOATING",        desc:"ETHEREAL Y SOÑADOR"},
    {p:[1,0,3,4,1,0,4,0], label:"CINEMATIC UP",    desc:"ESPERANZA Y AVENTURA"},
    {p:[0,2,4,3,0,2,1,0], label:"DREAM STATE",     desc:"ESTADO ONÍRICO PURO"},
    {p:[0,4,2,6,4,2,1,0], label:"INTERSTELLAR",    desc:"ÉPICA ESPACIAL CINEMATIC"},
  ]},
  mixolydian: { name:"Mixolydian (Rock/Funk)", intervals:[0,2,4,5,7,9,10], progs:[
    {p:[0,6,3,4,6,3,4,0], label:"BLUES ROCK",      desc:"GROOVE ROCK CLÁSICO"},
    {p:[0,4,6,0,4,6,3,0], label:"FUNKY",           desc:"FUNK TENSO Y LIBRE"},
    {p:[0,3,6,5,4,3,6,0], label:"MODAL ROCK",      desc:"ROCK MODAL PROGRESIVO"},
    {p:[6,0,5,6,0,3,4,0], label:"HENDRIX",         desc:"TONALIDAD HENDRIX VII-I"},
  ]},
  diminished: { name:"Diminished (W/H)", intervals:[0,2,3,5,6,8,9,11], progs:[
    {p:[0,2,4,6,2,4,6,0], label:"HORROR",          desc:"TENSIÓN CINEMATOGRÁFICA"},
    {p:[0,4,2,6,4,2,6,0], label:"GLITCH",          desc:"PESADILLA GLITCH"},
    {p:[0,2,4,6,0,4,2,0], label:"SYMMETRY",        desc:"SIMETRÍA DISSONANTE"},
  ]},
  pentatonicMajor: { name:"Pentatonic Major", intervals:[0,2,4,7,9], progs:[
    {p:[0,2,4,2,0,4,2,0], label:"FOLK UP",         desc:"FOLK ASCENDENTE PURO"},
    {p:[0,4,2,4,0,4,2,0], label:"COUNTRY",         desc:"COUNTRY ELECTRÓNICO"},
    {p:[0,2,1,4,2,1,4,0], label:"JAPANESE",        desc:"ESCALA JAPONESA YO"},
  ]},
  pentatonicMinor: { name:"Pentatonic Minor", intervals:[0,3,5,7,10], progs:[
    {p:[0,2,3,2,0,2,3,0], label:"BLUES PENTA",     desc:"BLUES PENTATÓNICO PURO"},
    {p:[0,4,3,2,4,3,2,0], label:"ROCK PENTA",      desc:"RIFF ROCK PENTATÓNICO"},
    {p:[0,2,4,3,4,2,3,0], label:"SOUL",            desc:"SOUL GROOVE CLÁSICO"},
  ]},
  wholeHalf: { name:"Whole-Half Octatonic", intervals:[0,2,3,5,6,8,9,11], progs:[
    {p:[0,2,4,6,4,2,0,4], label:"BEBOP",           desc:"LÍNEA BEBOP MODERNA"},
    {p:[0,4,2,6,4,6,2,0], label:"SYMMETRIC",       desc:"MOVIMIENTO SIMÉTRICO"},
  ]},
};

// ═══════════════════════════════════════════════════════════════════
//  UNIVERSAL PROGRESSIONS (work in any scale)
// ═══════════════════════════════════════════════════════════════════
const universalProgressions = [
  {p:[0,5,3,4], label:"I-vi-IV-V",       desc:"POP UNIVERSAL — CUATRO ACORDES ETERNOS"},
  {p:[0,3,4,0], label:"I-IV-V-I",        desc:"CADENCIA PERFECTA CLÁSICA"},
  {p:[0,4,5,3], label:"I-V-vi-IV",       desc:"AXIS OF AWESOME — LA FÓRMULA"},
  {p:[5,3,0,4], label:"vi-IV-I-V",       desc:"LOOP ETERNO EMOCIONAL"},
  {p:[0,1,3,4], label:"I-II-IV-V",       desc:"MOVIMIENTO ASCENDENTE BRILLANTE"},
  {p:[0,6,5,4], label:"I-VII-VI-V",      desc:"BAJADA ANDALUZA CLÁSICA"},
  {p:[5,4,0,3], label:"vi-V-I-IV",       desc:"ROMANTICISMO MODAL"},
  {p:[0,3,0,4], label:"I-IV-I-V",        desc:"GOSPEL SOUL — CADENCIA PLAGAL"},
  {p:[0,2,3,4], label:"I-III-IV-V",      desc:"ESCALADA DRAMÁTICA"},
  {p:[0,3,5,3], label:"I-IV-VI-IV",      desc:"LOOP DE TRANQUILIDAD"},
  {p:[2,5,0,4], label:"III-vi-I-V",      desc:"JAZZ TURNAROUND CLÁSICO"},
  {p:[0,1,4,0], label:"I-II-V-I",        desc:"II-V-I JAZZ FUNDAMENTAL"},
  {p:[4,0,3,4], label:"V-I-IV-V",        desc:"BLUEGRASS COUNTRY DRIVE"},
  {p:[0,5,6,3], label:"I-vi-VII-IV",     desc:"ROCK PROGRESIVO OSCURO"},
  {p:[0,4,3,0], label:"I-V-IV-I",        desc:"BLUES TURNAROUND CLÁSICO"},
  {p:[5,3,4,0], label:"vi-IV-V-I",       desc:"RESOLUCIÓN ÉPICA FINAL"},
  {p:[0,2,5,4], label:"I-III-vi-V",      desc:"CINEMATIC DRAMA"},
  {p:[3,0,4,0], label:"IV-I-V-I",        desc:"PLAGAL CADENCE LOOP"},
  {p:[0,6,3,4], label:"I-VII-IV-V",      desc:"MODAL INTERCHANGE ROCK"},
  {p:[0,1,3,5], label:"I-II-IV-VI",      desc:"ELEVACIÓN ETÉREA"},
];

// ═══════════════════════════════════════════════════════════════════
//  CHORD VOICING OFFSETS (intervals from root within a chord)
// ═══════════════════════════════════════════════════════════════════
const voicingDefs = {
  triad:   { name:"TRIAD",    label:"1-3-5",    degs:[0,2,4] },
  sus2:    { name:"SUS 2",    label:"1-2-5",    degs:[0,1,4] },
  sus4:    { name:"SUS 4",    label:"1-4-5",    degs:[0,3,4] },
  maj7:    { name:"MAJ 7",    label:"1-3-5-7",  degs:[0,2,4,6] },
  min7:    { name:"MIN 7",    label:"1-3-5-b7", degs:[0,2,4,5] },
  dom7:    { name:"DOM 7",    label:"1-3-5-b7", degs:[0,2,4,5] },
  add9:    { name:"ADD 9",    label:"1-3-5-9",  degs:[0,1,2,4] },
  stacked: { name:"STACKED",  label:"5ths",     degs:[0,4,1] },
  shell:   { name:"SHELL",    label:"1-3-7",    degs:[0,2,6] },
  power:   { name:"POWER",    label:"1-5",      degs:[0,4] },
};

// ═══════════════════════════════════════════════════════════════════
//  RESOLVE MATRIX
// ═══════════════════════════════════════════════════════════════════
const resolveMatrix = {
  0: { safe:[3,4],  cool:[5,6],   warn:[1],   name:"HOME (I)" },
  1: { safe:[4,0],  cool:[6],     warn:[2],   name:"DYNAMISM (II)" },
  2: { safe:[5,0],  cool:[3],     warn:[4],   name:"MOOD (III)" },
  3: { safe:[0,4],  cool:[1,6],   warn:[2],   name:"OPEN FEEL (IV)" },
  4: { safe:[0,5],  cool:[6,3],   warn:[1],   name:"TENSION (V)" },
  5: { safe:[3,4],  cool:[0,1],   warn:[6],   name:"EPIC (VI)" },
  6: { safe:[0],    cool:[4,2],   warn:[5],   name:"RESOLVE (VII)" },
};

// ═══════════════════════════════════════════════════════════════════
//  TECHNIQUES
// ═══════════════════════════════════════════════════════════════════
const techs = [
  'stab','paso','floreo','preg-resp','retardo','anticipa',
  'sincopa','pedal','escapada','ratchet','arpegg','melodico',
  'comb','bouncing','climbing','falling','question','answer',
  'trill','mordent','cascada','groove','call','echo',
  'bass-walk','ostinato','swing','chord-roll',
  'counterpoint','waltz','polyrhythm','chromatic',
];

const techInfo = {
  'stab':        { color:'#00ffcc', desc:'STAB — IMPACTO RÍTMICO SOBRE NOTA DEL ACORDE + COLOR' },
  'paso':        { color:'#33aaff', desc:'PASO — LÍNEA ESCALAR HACIA EL SIGUIENTE ACORDE' },
  'floreo':      { color:'#ffcc00', desc:'FLOREO — NOTA PRINCIPAL CON ORNAMENTOS VECINOS' },
  'preg-resp':   { color:'#ff88aa', desc:'PREGUNTA-RESPUESTA — TENSIÓN + RESOLUCIÓN' },
  'retardo':     { color:'#aa88ff', desc:'RETARDO — SUSPENSIÓN LARGA + RESOLUCIÓN TARDÍA' },
  'anticipa':    { color:'#88ffcc', desc:'ANTICIPACIÓN — NOTA DEL SIGUIENTE ACORDE ADELANTADA' },
  'sincopa':     { color:'#ffaa33', desc:'SÍNCOPA — ACENTOS EN OFFBEATS — GROOVE URBANO' },
  'pedal':       { color:'#33ff99', desc:'PEDAL — BAJO FIJO + MELODÍA SUPERIOR' },
  'escapada':    { color:'#ff5555', desc:'ESCAPADA — NOTA DE PASO + SALTO NO RESUELTO' },
  'ratchet':     { color:'#55aaff', desc:'RATCHET — REPETICIÓN QUE ESCALA Y RESUELVE' },
  'arpegg':      { color:'#ffff55', desc:'ARPEGIO — ACORDE DESPLEGADO SUBE/BAJA' },
  'melodico':    { color:'#aa55ff', desc:'MELÓDICO — ARCO NARRATIVO CON CLÍMAX EN BEAT 5' },
  'comb':        { color:'#ff88ff', desc:'COMB — SUBE GRADUALMENTE Y REGRESA' },
  'bouncing':    { color:'#88ff88', desc:'BOUNCE — REBOTE ENTRE TÓNICA Y 5TA' },
  'climbing':    { color:'#00ccff', desc:'CLIMBING — GRADOS ASCENDENTES — TENSIÓN MÁXIMA' },
  'falling':     { color:'#ff9944', desc:'FALLING — DESCENSO DESDE OCTAVA — RELAJACIÓN' },
  'question':    { color:'#ccffaa', desc:'QUESTION — TERMINA ALTA — BUSCA RESOLUCIÓN' },
  'answer':      { color:'#aaccff', desc:'ANSWER — TERMINA EN TÓNICA — RESOLUCIÓN PLENA' },
  'trill':       { color:'#ffccaa', desc:'TRILL — TRINO ENTRE DOS NOTAS + RESOLUCIÓN' },
  'mordent':     { color:'#ccaaff', desc:'MORDENT — NOTA + VECINA + REGRESO' },
  'cascada':     { color:'#aaffcc', desc:'CASCADA — GRUPOS DESCENDENTES DESDE OCTAVA' },
  'groove':      { color:'#ffaacc', desc:'GROOVE — PATRÓN SINCOPADO HOUSE/FUNK' },
  'call':        { color:'#ccffff', desc:'CALL — LLAMADA ALTA + RÉPLICA UNA OCTAVA ABAJO' },
  'echo':        { color:'#ffffcc', desc:'ECHO — FRASE + ECO DESPLAZADO' },
  'bass-walk':   { color:'#a855f7', desc:'BASS WALK — LÍNEA DE BAJO CROMÁTICA + MELODÍA' },
  'ostinato':    { color:'#fb923c', desc:'OSTINATO — PATRÓN REPETIDO + VARIACIÓN' },
  'swing':       { color:'#34d399', desc:'SWING — GROOVE JAZZ CON FEEL DESPLAZADO' },
  'chord-roll':  { color:'#f472b6', desc:'CHORD ROLL — ACORDE RÁPIDO + MELODÍA' },
  'counterpoint':{ color:'#60a5fa', desc:'CONTRAPUNTO — DOS VOCES INDEPENDIENTES' },
  'waltz':       { color:'#f9a8d4', desc:'VALS — PATRÓN 3/4 SOBRE COMPÁS 4/4' },
  'polyrhythm':  { color:'#a78bfa', desc:'POLIRRITMO — GRUPOS DE 3 SOBRE PULSO DE 4' },
  'chromatic':   { color:'#fbbf24', desc:'CROMÁTICO — CROMATISMO ASCENDENTE/DESCENDENTE' },
};

const techSuggestions = {
  0: ['stab','arpegg','pedal','groove','comb','ostinato','waltz'],
  1: ['paso','climbing','question','sincopa','bass-walk','chromatic'],
  2: ['floreo','trill','mordent','melodico','swing','counterpoint'],
  3: ['preg-resp','comb','call','melodico','chord-roll','waltz'],
  4: ['retardo','anticipa','ratchet','falling','answer','bass-walk','polyrhythm'],
  5: ['bouncing','arpegg','echo','question','swing','counterpoint'],
  6: ['escapada','cascada','falling','answer','anticipa','chord-roll','chromatic'],
};

// ═══════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════
let measureData = Array(MEASURES).fill(null).map(() => ({
  deg: 0, tech: 'stab', res: '16n', vel: 0.8,
}));

let isPlaying = false, currentStep = 0;
let chordsVisible = true, chordsAudioEnabled = true;

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════
function init() {
  const rootSel = document.getElementById('rootTone');
  rootNames.forEach((n, i) => rootSel.innerHTML += `<option value="${i}">${n}</option>`);

  const scaleSel = document.getElementById('scaleType');
  Object.keys(scales).forEach(k =>
    scaleSel.innerHTML += `<option value="${k}">${scales[k].name}</option>`);

  buildChordComposer();
  buildGrid();
}

// ═══════════════════════════════════════════════════════════════════
//  CHORD COMPOSER PANEL
// ═══════════════════════════════════════════════════════════════════
function buildChordComposer() {
  buildVoicingPanel();
  buildBuilderPanel();
  buildUniversalProgs();
}

function buildVoicingPanel() {
  const vg = document.getElementById('voicingGrid');
  vg.innerHTML = '';
  Object.entries(voicingDefs).forEach(([key, def]) => {
    const b = document.createElement('button');
    b.className = 'voicing-btn' + (key === activeVoicing ? ' active' : '');
    b.innerHTML = `<div>${def.name}</div><div style="font-size:0.42rem;color:#888;margin-top:1px">${def.label}</div>`;
    b.onclick = () => {
      activeVoicing = key;
      document.querySelectorAll('.voicing-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      refresh();
    };
    vg.appendChild(b);
  });

  const ctg = document.getElementById('chordTypeGrid');
  ctg.innerHTML = '';
  const chordTypes = [
    ['MAJOR','major'],['MINOR','minor'],['DOM7','dom7'],['MAJ7','maj7'],
    ['MIN7','min7'],['DIM','dim'],['AUG','aug'],['HALF-DIM','hdim'],
  ];
  chordTypes.forEach(([label]) => {
    const b = document.createElement('button');
    b.className = 'chord-type-btn';
    b.textContent = label;
    b.onclick = () => {
      document.querySelectorAll('.chord-type-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('advisor').textContent = `CHORD TYPE: ${label} SELECTED`;
    };
    ctg.appendChild(b);
  });
}

function buildUniversalProgs() {
  const cont = document.getElementById('universalProgs');
  cont.innerHTML = '';
  universalProgressions.forEach(prog => {
    const el = document.createElement('div');
    el.className = 'prog-item-v';
    el.innerHTML = `
      <span class="pi-label">${prog.label}</span>
      <span class="pi-nums">${prog.p.map(n=>n+1).join(' → ')}</span>
      <span class="pi-desc">${prog.desc}</span>
    `;
    el.onclick = () => {
      const scaleKey = document.getElementById('scaleType').value;
      const scale = scales[scaleKey];
      if (!scale) return;
      // Tile the 4-chord progression across 8 measures
      for (let i = 0; i < MEASURES; i++) {
        measureData[i].deg = prog.p[i % prog.p.length];
        const sugs = techSuggestions[measureData[i].deg] || [];
        if (sugs.length) measureData[i].tech = sugs[Math.floor(Math.random() * sugs.length)];
      }
      document.getElementById('advisor').textContent = `${prog.label} — ${prog.desc}`;
      renderMeasures(); refresh();
    };
    cont.appendChild(el);
  });
}

function buildScaleProgs(scale) {
  const cont = document.getElementById('scaleProgs');
  cont.innerHTML = '';
  if (!scale) return;
  scale.progs.forEach(prog => {
    const el = document.createElement('div');
    el.className = 'prog-item-v';
    el.innerHTML = `
      <span class="pi-label">${prog.label}</span>
      <span class="pi-nums">${prog.p.map(n=>n+1).join(' → ')}</span>
      <span class="pi-desc">${prog.desc}</span>
    `;
    el.onclick = () => {
      prog.p.forEach((d, i) => {
        if (!measureData[i]) return;
        measureData[i].deg = d;
        const sugs = techSuggestions[d] || [];
        if (sugs.length) measureData[i].tech = sugs[Math.floor(Math.random() * sugs.length)];
      });
      document.getElementById('advisor').textContent = prog.desc;
      renderMeasures(); refresh();
    };
    cont.appendChild(el);
  });
}

function buildBuilderPanel() {
  renderBuilderSlots();
  const avail = document.getElementById('availableChords');
  avail.innerHTML = '';
  for (let d = 0; d < 7; d++) {
    const b = document.createElement('button');
    b.className = 'avail-chord-btn';
    b.dataset.deg = d;
    b.textContent = `${d+1}`;
    b.onclick = () => addToBuilder(d);
    avail.appendChild(b);
  }
  // Also add labels based on current scale
  updateBuilderChordLabels();
}

function updateBuilderChordLabels() {
  const root = parseInt(document.getElementById('rootTone').value);
  const scaleKey = document.getElementById('scaleType').value;
  const scale = scales[scaleKey];
  if (!scale) return;
  document.querySelectorAll('.avail-chord-btn').forEach(btn => {
    const d = parseInt(btn.dataset.deg);
    const ni = scale.intervals.length;
    const note = rootNames[(root + scale.intervals[d % ni]) % 12];
    const rm = resolveMatrix[d];
    btn.innerHTML = `<div>${d+1}</div><div style="font-size:0.38rem;color:#888">${note}</div>`;
  });
}

function addToBuilder(deg) {
  if (builderSequence.length >= MEASURES) {
    // cycle
    builderSequence.shift();
  }
  builderSequence.push(deg);
  renderBuilderSlots();
}

function renderBuilderSlots() {
  const cont = document.getElementById('builderSlots');
  cont.innerHTML = '';
  const root = parseInt(document.getElementById('rootTone').value);
  const scaleKey = document.getElementById('scaleType').value;
  const scale = scales[scaleKey];

  for (let i = 0; i < MEASURES; i++) {
    const slot = document.createElement('div');
    slot.className = 'builder-slot';
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = `M${i+1}`;
    slot.appendChild(num);

    if (i < builderSequence.length) {
      const deg = builderSequence[i];
      const ni = scale ? scale.intervals.length : 7;
      const note = scale ? rootNames[(root + scale.intervals[deg % ni]) % 12] : `${deg+1}`;
      const chord = document.createElement('span');
      chord.className = 'slot-chord';
      chord.textContent = `${note} (${deg+1})`;
      const rm = document.createElement('button');
      rm.className = 'slot-remove';
      rm.textContent = '✕';
      rm.onclick = () => { builderSequence.splice(i, 1); renderBuilderSlots(); };
      slot.appendChild(chord);
      slot.appendChild(rm);
    } else {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:0.42rem;color:#333;font-style:italic;';
      empty.textContent = 'empty';
      slot.appendChild(empty);
    }
    cont.appendChild(slot);
  }
}

function applyBuilderSequence() {
  if (builderSequence.length === 0) return;
  for (let i = 0; i < MEASURES; i++) {
    measureData[i].deg = builderSequence[i % builderSequence.length];
    const sugs = techSuggestions[measureData[i].deg] || [];
    if (sugs.length) measureData[i].tech = sugs[Math.floor(Math.random() * sugs.length)];
  }
  document.getElementById('advisor').textContent = `BUILDER: ${builderSequence.map(d=>d+1).join('→')} APPLIED`;
  renderMeasures(); refresh();
}

function switchCPTab(name, btn) {
  document.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cp-panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.remove('hidden');
}

function setInversion(n, btn) {
  activeInversion = n;
  document.querySelectorAll('.inv-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refresh();
}

function updateChordVol(v) {
  chordSynth.set({ volume: parseInt(v) });
  document.getElementById('chordVolVal').textContent = v;
}

// ═══════════════════════════════════════════════════════════════════
//  BPM
// ═══════════════════════════════════════════════════════════════════
function updateBPM(v) {
  Tone.Transport.bpm.value = v;
  document.getElementById('bpmDisplay').textContent = v;
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD GRID
// ═══════════════════════════════════════════════════════════════════
function buildGrid() {
  const ed = document.getElementById('editor');
  ed.innerHTML = '';

  const root = parseInt(document.getElementById('rootTone').value);
  const scaleKey = document.getElementById('scaleType').value;
  const scale = scales[scaleKey];
  if (!scale) return;

  const scaleNotes = scale.intervals.map(i => rootNames[(root + i) % 12]);

  ed.appendChild(document.createElement('div')); // corner
  
  // Headers modification para Odesi
  for (let s = 0; s < STEPS; s++) {
    const isCall = Math.floor(s / 16) % 2 === 0;
    const odesiClass = isCall ? 'odesi-call' : 'odesi-resp';

    const d = document.createElement('div');
    d.className = 'beat-hdr ' + odesiClass + (s % 8 === 0 ? ' bar-start' : s % 4 === 0 ? ' mid-bar' : '');
    d.style.position = 'relative'; // Necesario para posicionar las etiquetas
    
    let content = s % 8 === 0 ? `M${s/8+1}` : (s % 4 === 0 ? '·' : '');
    
    // Inyecta el texto CALL/RESPONSE cada 2 compases
    if (s % 16 === 0) {
      content += `<span class="odesi-label ${odesiClass}">${isCall ? 'CALL' : 'RESPONSE'}</span>`;
    }
    
    d.innerHTML = content;
    ed.appendChild(d);
  }

  // Cells modification para Odesi
  chromaticNotes.forEach(n => {
    const noteOnly = n.replace(/\d+/, '');
    const inScale  = scaleNotes.includes(noteOnly);

    const hdr = document.createElement('div');
    hdr.className = 'note-hdr' + (inScale ? ' in-scale' : '');
    hdr.textContent = n;
    ed.appendChild(hdr);

    for (let s = 0; s < STEPS; s++) {
      const isCall = Math.floor(s / 16) % 2 === 0;
      const odesiClass = isCall ? 'odesi-call' : 'odesi-resp';

      const c = document.createElement('div');
      c.className = 'cell ' + odesiClass
        + (inScale ? ' in-scale-row' : '')
        + (s % 8 === 0 ? ' bar-start' : s % 4 === 0 ? ' half-bar' : '');
      c.dataset.note = n;
      c.dataset.step = s;
      ed.appendChild(c);
    }
  });

  buildProgButtons(scale);
  buildScaleProgs(scale);
  updateBuilderChordLabels();
  renderBuilderSlots();
  renderMeasures();
  updateChordsDisplay();
  refresh();
}

// ═══════════════════════════════════════════════════════════════════
//  PROG BUTTONS (footer)
// ═══════════════════════════════════════════════════════════════════
function buildProgButtons(scale) {
  const list = document.getElementById('progList');
  list.innerHTML = '';
  scale.progs.forEach(prog => {
    const b = document.createElement('button');
    b.className = 'btn-prog';
    b.innerHTML = `<span class="pl">${prog.label}</span><span class="pn">${prog.p.map(n=>n+1).join('-')}</span>`;
    b.onclick = () => {
      prog.p.forEach((d, i) => {
        if (!measureData[i]) return;
        measureData[i].deg = d;
        const sugs = techSuggestions[d] || [];
        if (sugs.length) measureData[i].tech = sugs[Math.floor(Math.random() * sugs.length)];
      });
      document.getElementById('advisor').textContent = prog.desc;
      renderMeasures(); refresh();
    };
    list.appendChild(b);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER MEASURE CARDS
// ═══════════════════════════════════════════════════════════════════
function renderMeasures() {
  const row = document.getElementById('measureRow');
  row.innerHTML = '';
  const scaleKey = document.getElementById('scaleType').value;
  const scale    = scales[scaleKey];
  const root     = parseInt(document.getElementById('rootTone').value);

  measureData.forEach((data, i) => {
    const prevDeg  = i > 0 ? measureData[i-1].deg : null;
    const sug      = prevDeg !== null ? resolveMatrix[prevDeg] : null;
    const sugTechs = techSuggestions[data.deg] || [];
    const rm       = resolveMatrix[data.deg];
    const ni       = scale ? scale.intervals.length : 7;
    const rootNote = scale ? rootNames[(root + scale.intervals[data.deg % ni]) % 12] : '';

    // Build chord notes for mini preview
    const voicing = voicingDefs[activeVoicing] || voicingDefs.triad;
    let chordNotes = voicing.degs.map(d => {
      const idx = (data.deg + d) % ni;
      return rootNames[(root + scale.intervals[idx]) % 12];
    });
    // Apply inversion
    for (let inv = 0; inv < activeInversion; inv++) {
      const first = chordNotes.shift();
      chordNotes.push(first);
    }

    const isCall  = odesiVisible && Math.floor(i / 2) % 2 === 0;
    const isResp  = odesiVisible && !isCall;
    const odesiTag = odesiVisible
      ? `<span class="m-odesi-tag ${isCall ? 'm-odesi-call' : 'm-odesi-resp'}">${isCall ? '▲ CALL' : '▽ RESP'}</span>`
      : '';

    let html = `<div class="m-card" id="mcard${i}">`;
    html += `<div class="m-card-label"><span>M${i+1}${odesiTag}</span><span class="deg-name">${rootNote} ${rm ? rm.name : ''}</span></div>`;

    // Mini chord preview
    html += `<div class="m-chord-preview">`;
    chordNotes.forEach(n => { html += `<span class="m-chord-note">${n}</span>`; });
    html += `</div>`;

    // Degree buttons
    html += `<div class="deg-grid">`;
    for (let d = 0; d < 7; d++) {
      const sc = sug
        ? sug.safe.includes(d) ? 'sug-safe'
          : sug.cool.includes(d) ? 'sug-cool'
          : sug.warn.includes(d) ? 'sug-warn' : ''
        : '';
      html += `<button class="btn-deg ${data.deg===d?'selected':''} ${sc}" onclick="event.stopPropagation();setDeg(${i},${d})">${d+1}</button>`;
    }
    html += `</div>`;

    html += `<select class="tech-select" onchange="setTech(${i},this.value)">`;
    techs.forEach(t => {
      const isSug = sugTechs.includes(t);
      html += `<option value="${t}" ${data.tech===t?'selected':''}>${isSug?'★ ':''} ${t.toUpperCase()}</option>`;
    });
    html += `</select>`;

    html += `<div class="vel-row"><span class="vel-label">VEL</span><input type="range" class="vel-slider" min="0.1" max="1" step="0.05" value="${data.vel}" oninput="setVel(${i},this.value)"></div>`;
    html += `</div>`;
    row.innerHTML += html;
  });

  updateChordsDisplay();
}

// ═══════════════════════════════════════════════════════════════════
//  SETTERS
// ═══════════════════════════════════════════════════════════════════
function setDeg(i, d) {
  measureData[i].deg = d;
  const rm = resolveMatrix[d];
  document.getElementById('advisor').textContent = rm ? `M${i+1}: ${rm.name}` : '';
  renderMeasures(); refresh();
}
function setTech(i, t) {
  measureData[i].tech = t;
  const info = techInfo[t];
  document.getElementById('advisor').textContent = info ? info.desc : t;
  refresh();
}
function setVel(i, v) {
  measureData[i].vel = parseFloat(v);
  refresh();
}

// ═══════════════════════════════════════════════════════════════════
//  NOTE HELPER
// ═══════════════════════════════════════════════════════════════════
function makeG(data, root, scale) {
  const ni = scale.intervals.length;
  return (df, oct) => {
    const idx = ((data.deg + df) % ni + ni) % ni;
    return rootNames[(root + scale.intervals[idx]) % 12] + oct;
  };
}

// Build voiced chord notes with inversion
function buildVoicedChord(data, root, scale, oct) {
  const ni = scale.intervals.length;
  const voicing = voicingDefs[activeVoicing] || voicingDefs.triad;
  let notes = voicing.degs.map(d => {
    const idx = ((data.deg + d) % ni + ni) % ni;
    return rootNames[(root + scale.intervals[idx]) % 12] + oct;
  });
  // Apply inversion: move bottom notes up an octave
  for (let inv = 0; inv < activeInversion && inv < notes.length; inv++) {
    const first = notes.shift();
    const noteName = first.replace(/\d+/, '');
    const octN = parseInt(first.match(/\d+/)[0]) + 1;
    notes.push(noteName + octN);
  }
  return notes;
}

// ═══════════════════════════════════════════════════════════════════
//  PAINT BLOCK
// ═══════════════════════════════════════════════════════════════════
function paintBlock(note, step, type, dur, vel) {
  const cell = document.querySelector(`.cell[data-note="${note}"][data-step="${step}"]`);
  if (!cell) return;
  const factor = Tone.Time(dur || '16n').toSeconds() / Tone.Time('16n').toSeconds();
  const block  = document.createElement('div');
  block.className   = `note-block ${type}`;
  block.style.width = `calc(${factor*100}% + ${Math.max(0,Math.floor(factor)-1)}px)`;
  block.dataset.dur  = dur || '16n';
  block.dataset.type = type;
  block.dataset.vel  = vel || 0.8;
  cell.appendChild(block);
  if (vel && type !== 'orn-node') {
    const vi = document.createElement('div');
    vi.className = 'vel-indicator';
    vi.style.width   = (vel * 100) + '%';
    vi.style.opacity = 0.4 + vel * 0.5;
    block.appendChild(vi);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  REFRESH
// ═══════════════════════════════════════════════════════════════════
function refresh() {
  document.querySelectorAll('.note-block').forEach(b => b.remove());
  document.querySelectorAll('.chord-bg,.chord-tone').forEach(c => {
    c.classList.remove('chord-bg');
    c.classList.remove('chord-tone');
  });

  const root = parseInt(document.getElementById('rootTone').value);
  const scaleKey = document.getElementById('scaleType').value;
  const scale    = scales[scaleKey];
  if (!scale) return;

  updateChordDisplay(root, scale);

  const voicing = voicingDefs[activeVoicing] || voicingDefs.triad;

  measureData.forEach((data, mIdx) => {
    const start = mIdx * 8;
    const G     = makeG(data, root, scale);
    const vel   = data.vel;
    const ni    = scale.intervals.length;

    // Chord tones background highlight
    voicing.degs.forEach(d => {
      const n = G(d, "3");
      for (let s = 0; s < 8; s++) {
        const c = document.querySelector(`.cell[data-note="${n}"][data-step="${start+s}"]`);
        if (c) c.classList.add(d === 0 ? 'chord-bg' : 'chord-tone');
      }
    });

    const R    = G(0,"4"); const R_Lo = G(0,"3"); const R_Hi = G(0,"5");
    const S2   = G(1,"4"); const T3   = G(2,"4"); const C4   = G(3,"4");
    const R5   = G(4,"4"); const S6   = G(5,"4"); const L7   = G(6,"4");

    const pd = (n,s,type,dur,v) => paintBlock(n,s,type,dur,v??vel);

    switch (data.tech) {
      case 'stab': {
        const stepVal  = Math.round(Tone.Time(data.res).toSeconds() / Tone.Time("16n").toSeconds());
        const stabNote = [0,3,5].includes(data.deg) ? R : data.deg === 4 ? R5 : T3;
        for (let s = 0; s < 8; s += Math.max(1, stepVal)) pd(stabNote, start+s, 'lead-node', data.res);
        pd(S6, start+4, 'orn-node', '32n', vel*0.5);
        break;
      }
      case 'paso': {
        const nextDeg = measureData[(mIdx+1)%MEASURES].deg;
        const goUp    = nextDeg > data.deg || (data.deg >= 5 && nextDeg <= 1);
        const line    = goUp ? [R,S2,T3,R5] : [R5,T3,S2,R];
        line.forEach((n,i) => pd(n, start+(i*2), 'lead-node', '8n'));
        break;
      }
      case 'floreo': {
        if (mIdx%2===0) {
          pd(R, start, 'lead-node', '8n');
          pd(S2, start+2, 'orn-node', '16n', vel*0.5);
          pd(R, start+3, 'lead-node', '16n');
          pd(R, start+4, 'lead-node', '8n');
          pd(G(-1,"4"), start+6, 'orn-node', '16n', vel*0.5);
          pd(R, start+7, 'lead-node', '16n');
        } else {
          pd(R, start, 'lead-node', '16n');
          pd(S2, start+1, 'orn-node', '16n', vel*0.5);
          pd(T3, start+2, 'lead-node', '8n');
          pd(S2, start+4, 'orn-node', '16n', vel*0.5);
          pd(R, start+5, 'lead-node', '16n');
          pd(G(-1,"4"), start+6, 'orn-node', '16n', vel*0.5);
          pd(R, start+7, 'lead-node', '16n');
        }
        break;
      }
      case 'preg-resp': {
        if (mIdx%2===0) {
          pd(R, start, 'lead-node', '8n');
          pd(T3, start+2, 'lead-node', '8n');
          pd(R_Hi, start+4, 'lead-node', '8n');
          pd(L7, start+6, 'orn-node', '16n', vel*0.5);
        } else {
          pd(R_Hi, start, 'lead-node', '8n');
          pd(R5, start+2, 'lead-node', '8n');
          pd(mIdx===MEASURES-1?R:T3, start+4, 'lead-node', '4n');
        }
        break;
      }
      case 'retardo': {
        const ten = mIdx%2===0 ? S2 : C4;
        const res = mIdx%2===0 ? R  : T3;
        pd(ten, start, 'orn-node', '16n', vel*0.6);
        pd(ten, start+1, 'lead-node', '4n');
        pd(res, start+4, 'lead-node', '8n');
        pd(res, start+6, 'orn-node', '16n', vel*0.5);
        break;
      }
      case 'anticipa': {
        const nextG    = makeG(measureData[(mIdx+1)%MEASURES], root, scale);
        const nextRoot = nextG(0,"4");
        pd(R, start, 'lead-node', '4n');
        pd(T3, start+4, 'lead-node', '8n');
        pd(nextRoot, start+6, 'orn-node', '16n', vel*0.6);
        pd(nextRoot, start+7, 'orn-node', '16n', vel*0.6);
        break;
      }
      case 'sincopa': {
        [{s:0,n:R,d:'16n'},{s:1,n:T3,orn:true,d:'16n'},{s:3,n:R5,d:'8n'},
         {s:5,n:T3,orn:true,d:'16n'},{s:6,n:R,d:'16n'}]
        .forEach(({s,n,orn,d}) => pd(n, start+s, orn?'orn-node':'lead-node', d, orn?vel*0.5:vel));
        break;
      }
      case 'pedal': {
        for (let s=0;s<8;s+=2) pd(R_Lo, start+s, 'lead-node', '16n', vel*0.7);
        [S6,R_Hi,L7,R_Hi].forEach((n,i) => pd(n, start+(i*2)+1, 'orn-node', '32n', vel*0.4));
        break;
      }
      case 'escapada': {
        pd(R, start, 'lead-node', '8n');
        pd(S2, start+2, 'lead-node', '16n');
        pd(G(6,"4"), start+3, 'orn-node', '32n', vel*0.4);
        pd(R5, start+4, 'lead-node', '4n');
        pd(T3, start+7, 'orn-node', '16n', vel*0.5);
        break;
      }
      case 'ratchet': {
        for (let s=0;s<4;s++) pd(R, start+s, 'lead-node', '32n', vel*(0.5+s*0.1));
        pd(T3, start+4, 'lead-node', '16n');
        pd(R5, start+5, 'lead-node', '16n');
        pd(S6, start+6, 'lead-node', '16n');
        pd(R_Hi, start+7, 'orn-node', '16n', vel*0.6);
        break;
      }
      case 'arpegg': {
        if (mIdx%2===0) {
          [0,2,4,6].forEach((d,i) => pd(G(d,"4"), start+(i*2), 'lead-node', '8n'));
        } else {
          [6,4,2,0].forEach((d,i) => pd(G(d,"4"), start+(i*2), 'lead-node', '8n'));
          pd(G(0,"5"), start+7, 'orn-node', '16n', vel*0.5);
        }
        break;
      }
      case 'melodico': {
        const seqs = [[0,2,4,5],[0,4,5,6],[6,4,2,0],[4,2,1,0],
                      [0,2,4,6],[0,5,4,3],[3,4,5,6],[6,4,2,0]];
        const seq  = seqs[mIdx % seqs.length];
        seq.forEach((d,i) => pd(G(d,"4"), start+(i*2), 'lead-node', '8n', vel*(i===2?1.0:0.75+i*0.05)));
        break;
      }
      case 'comb': {
        [R,T3,R5,R_Hi,R5,T3,S2,R].forEach((n,i) => {
          pd(n, start+i, i===3||i===7?'lead-node':i%2===0?'lead-node':'orn-node', '16n',
            i===3?vel:i%2===0?vel*0.9:vel*0.5);
        });
        break;
      }
      case 'bouncing': {
        [[R,R5],[R5,R],[R,R5],[R5,R_Hi]].forEach(([a,b],i) => {
          pd(a, start+(i*2),   'lead-node', '16n');
          pd(b, start+(i*2)+1, 'lead-node', '16n');
        });
        break;
      }
      case 'climbing': {
        for (let di=0;di<8;di++) {
          pd(G(di%7, di>=7?"5":"4"), start+di, di>=6?'orn-node':'lead-node', '16n', vel*(0.6+di*0.05));
        }
        break;
      }
      case 'falling': {
        pd(R_Hi, start, 'lead-node', '8n');
        pd(L7, start+2, 'lead-node', '8n');
        pd(S6, start+4, 'lead-node', '8n');
        pd(R5, start+6, 'lead-node', '8n');
        pd(T3, start+7, 'orn-node', '16n', vel*0.5);
        break;
      }
      case 'question': {
        pd(R, start, 'lead-node', '8n');
        pd(T3, start+2, 'lead-node', '8n');
        pd(R5, start+4, 'lead-node', '8n');
        pd(R_Hi, start+6, 'lead-node', '8n');
        pd(L7, start+7, 'orn-node', '16n', vel*0.5);
        break;
      }
      case 'answer': {
        pd(R_Hi, start, 'lead-node', '8n');
        pd(S6, start+2, 'lead-node', '8n');
        pd(R5, start+4, 'lead-node', '8n');
        pd(T3, start+6, 'lead-node', '4n');
        break;
      }
      case 'trill': {
        for (let s=0;s<4;s++)
          pd(s%2===0?R:S2, start+s, s%2===0?'lead-node':'orn-node', '16n', s%2===0?vel:vel*0.4);
        pd(R, start+4, 'lead-node', '8n');
        pd(T3, start+6, 'lead-node', '8n');
        break;
      }
      case 'mordent': {
        pd(R, start, 'lead-node', '16n');
        pd(S2, start+1, 'orn-node', '32n', vel*0.4);
        pd(R, start+2, 'lead-node', '8n');
        pd(R5, start+4, 'lead-node', '16n');
        pd(S6, start+5, 'orn-node', '32n', vel*0.4);
        pd(R5, start+6, 'lead-node', '8n');
        break;
      }
      case 'cascada': {
        [R_Hi,L7,S6,R5,C4,T3,S2,R].forEach((n,i) => {
          pd(n, start+i, i===0||i===3||i===7?'lead-node':'orn-node', '16n', i===0?vel:vel*(0.7-i*0.05));
        });
        break;
      }
      case 'groove': {
        [{s:0,n:R},{s:2,n:R5},{s:3,n:T3,orn:true},{s:4,n:R},{s:6,n:R5},{s:7,n:S2,orn:true}]
        .forEach(({s,n,orn}) => pd(n, start+s, orn?'orn-node':'lead-node', '16n', orn?vel*0.45:vel));
        break;
      }
      case 'call': {
        pd(R_Hi, start, 'lead-node', '8n');
        pd(L7, start+2, 'orn-node', '16n', vel*0.5);
        pd(R_Hi, start+3, 'lead-node', '16n');
        pd(R, start+4, 'lead-node', '8n');
        pd(T3, start+6, 'orn-node', '16n', vel*0.5);
        pd(R, start+7, 'lead-node', '16n');
        break;
      }
      case 'echo': {
        pd(R, start, 'lead-node', '16n');
        pd(T3, start+1, 'lead-node', '16n');
        pd(R5, start+2, 'lead-node', '16n');
        pd(R, start+4, 'orn-node', '16n', vel*0.45);
        pd(T3, start+5, 'orn-node', '16n', vel*0.35);
        pd(R5, start+6, 'orn-node', '16n', vel*0.25);
        pd(R, start+7, 'orn-node', '32n', vel*0.2);
        break;
      }
      case 'bass-walk': {
        pd(R_Lo, start, 'bass-node', '8n', vel*0.8);
        pd(G(1,"3"), start+2, 'bass-node', '16n', vel*0.7);
        pd(G(2,"3"), start+3, 'bass-node', '16n', vel*0.7);
        pd(G(4,"3"), start+4, 'bass-node', '8n', vel*0.75);
        pd(G(3,"3"), start+6, 'bass-node', '16n', vel*0.65);
        pd(G(4,"3"), start+7, 'bass-node', '16n', vel*0.7);
        pd(T3, start+2, 'lead-node', '4n', vel*0.6);
        pd(R5, start+6, 'lead-node', '8n', vel*0.65);
        break;
      }
      case 'ostinato': {
        const motif = mIdx%2===0 ? [R,T3,R5,T3] : [R,R5,T3,R];
        for (let rep=0;rep<2;rep++)
          motif.forEach((n,i) => pd(n, start+(rep*4)+i, 'lead-node', '16n', vel*(0.75+Math.random()*0.1)));
        break;
      }
      case 'swing': {
        pd(R, start, 'lead-node', '8n');
        pd(T3, start+3, 'orn-node', '16n', vel*0.5);
        pd(R5, start+4, 'lead-node', '8n');
        pd(S6, start+7, 'orn-node', '16n', vel*0.5);
        pd(R, start+2, 'orn-node', '32n', vel*0.35);
        pd(R5, start+6, 'orn-node', '32n', vel*0.35);
        break;
      }
      case 'chord-roll': {
        [0,2,4].forEach((d,i) => pd(G(d,"4"), start+i, 'orn-node', '32n', vel*(0.6+i*0.1)));
        pd(G(4,"4"), start+3, 'lead-node', '16n');
        [0,2,4].forEach((d,i) => pd(G(d,"4"), start+4+i, 'orn-node', '32n', vel*(0.5+i*0.1)));
        pd(G(6,"4"), start+7, 'lead-node', '16n');
        break;
      }
      case 'counterpoint': {
        // Two independent voices
        [R,T3,R5,T3].forEach((n,i) => pd(n, start+(i*2), 'lead-node', '8n', vel*0.85));
        [R_Hi,S6,R5,T3].forEach((n,i) => pd(n, start+(i*2)+1, 'orn-node', '16n', vel*0.5));
        break;
      }
      case 'waltz': {
        // 3-feel over 4/4 — strong beat, soft two, medium three, soft four
        pd(R, start, 'lead-node', '16n', vel);
        pd(T3, start+2, 'orn-node', '16n', vel*0.55);
        pd(R5, start+3, 'orn-node', '16n', vel*0.45);
        pd(R, start+4, 'lead-node', '16n', vel*0.8);
        pd(S6, start+6, 'orn-node', '16n', vel*0.5);
        pd(R5, start+7, 'orn-node', '16n', vel*0.4);
        break;
      }
      case 'polyrhythm': {
        // Groups of 3 over 8 steps: positions 0,3,6 (triplet feel)
        [0,3,6].forEach(s => pd(R, start+s, 'lead-node', '16n', vel*(0.8+s===0?0.2:0)));
        [1,4,7].forEach(s => pd(T3, start+s, 'orn-node', '16n', vel*0.45));
        pd(R5, start+2, 'orn-node', '32n', vel*0.35);
        pd(R5, start+5, 'orn-node', '32n', vel*0.35);
        break;
      }
      case 'chromatic': {
        // Chromatic passing tones approaching chord tone
        const chrNotes = [];
        const targetNote = G(0,"4");
        chrNotes.push(G(0,"4"),G(1,"4"),G(2,"4"),G(3,"4"),G(4,"4"),G(3,"4"),G(2,"4"),G(0,"4"));
        chrNotes.forEach((n,i) => pd(n, start+i,
          i===0||i===4||i===7?'lead-node':'orn-node', '16n',
          i===0?vel:vel*(0.5+i*0.04)));
        break;
      }
      default:
        pd(R, start, 'lead-node', '4n');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  TOGGLE CHORDS
// ═══════════════════════════════════════════════════════════════════
function toggleChords() {
  chordsAudioEnabled = !chordsAudioEnabled;
  chordsVisible = chordsAudioEnabled;
  const btn = document.getElementById('chordsBtn');
  const display = document.getElementById('chordsDisplay');
  if (chordsAudioEnabled) {
    btn.classList.add('active'); btn.classList.remove('inactive');
    btn.textContent = '🎼 CHORDS ON';
    display.style.display = 'flex';
    updateChordsDisplay();
  } else {
    btn.classList.remove('active'); btn.classList.add('inactive');
    btn.textContent = '🎼 CHORDS OFF';
    display.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TOGGLE ODESI C/R — Affects melody structure
// ═══════════════════════════════════════════════════════════════════
let odesiVisible = false;

// ODESI patterns: calls end high (tension), responses resolve down
const odesiCallTechs  = ['question', 'call', 'climbing', 'preg-resp', 'ratchet'];
const odesiRespTechs  = ['answer', 'falling', 'cascada', 'retardo', 'anticipa'];

function toggleOdesi() {
  odesiVisible = !odesiVisible;
  const btn = document.getElementById('odesiBtn');
  if (odesiVisible) {
    document.body.classList.add('show-odesi');
    btn.classList.add('active');
    btn.classList.remove('inactive');
    btn.textContent = '💡 ODESI ON';
    applyOdesiToMelody();
    document.getElementById('advisor').textContent = '💡 ODESI: CALL/RESPONSE — ESTRUCTURANDO MELODÍA...';
  } else {
    document.body.classList.remove('show-odesi');
    btn.classList.remove('active');
    btn.classList.add('inactive');
    btn.textContent = '💡 ODESI C/R';
    document.getElementById('advisor').textContent = 'ODESI OFF — MODO LIBRE';
  }
  renderMeasures();
  refresh();
}

function applyOdesiToMelody() {
  // Apply call/response structure to all measures:
  // Measures 0,1 = CALL, 2,3 = RESPONSE, 4,5 = CALL (variation), 6,7 = RESPONSE (final resolve)
  measureData.forEach((data, i) => {
    const block   = Math.floor(i / 2); // 0,1,2,3
    const isCall  = block % 2 === 0;   // 0,2 = call; 1,3 = response

    if (isCall) {
      // Pick a call technique appropriate for the current degree
      const callPool = odesiCallTechs.filter(t =>
        (techSuggestions[data.deg] || []).includes(t)
      );
      data.tech = callPool.length > 0
        ? callPool[Math.floor(Math.random() * callPool.length)]
        : odesiCallTechs[Math.floor(Math.random() * odesiCallTechs.length)];
    } else {
      // Pick a response technique
      const respPool = odesiRespTechs.filter(t =>
        (techSuggestions[data.deg] || []).includes(t)
      );
      data.tech = respPool.length > 0
        ? respPool[Math.floor(Math.random() * respPool.length)]
        : odesiRespTechs[Math.floor(Math.random() * odesiRespTechs.length)];

      // Final measure (7): always resolve to tonic feel
      if (i === 7) {
        data.tech = 'answer';
        data.deg  = 0;
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  UPDATE CHORDS DISPLAY (header strip)
// ═══════════════════════════════════════════════════════════════════
function updateChordsDisplay() {
  if (!chordsVisible) return;
  const root = parseInt(document.getElementById('rootTone').value);
  const scaleKey = document.getElementById('scaleType').value;
  const scale = scales[scaleKey];
  if (!scale) return;
  const display = document.getElementById('chordsDisplay');
  display.innerHTML = '';
  const voicing = voicingDefs[activeVoicing] || voicingDefs.triad;
  const ni = scale.intervals.length;

  measureData.forEach((data, i) => {
    const rootNote = rootNames[(root + scale.intervals[data.deg % ni]) % 12];
    let notes = voicing.degs.map(d => {
      const idx = ((data.deg + d) % ni + ni) % ni;
      return rootNames[(root + scale.intervals[idx]) % 12];
    });
    // Apply inversion label
    const invSuffix = activeInversion > 0 ? `/${notes[activeInversion % notes.length]}` : '';

    const label = document.createElement('div');
    label.className = 'chord-label';
    label.textContent = `${rootNote}${invSuffix} [${notes.join('-')}]`;
    label.title = `M${i+1}: ${rootNote} — Click to preview chord`;
    label.onclick = () => previewChord(data, root, scale);
    display.appendChild(label);
  });
}

// Preview chord on click
function previewChord(data, root, scale) {
  Tone.start();
  const notes = buildVoicedChord(data, root, scale, "4");
  chordSynth.triggerAttackRelease(notes, "4n", Tone.now(), 0.4);
}

// ═══════════════════════════════════════════════════════════════════
//  CHORD DISPLAY (footer)
// ═══════════════════════════════════════════════════════════════════
function updateChordDisplay(root, scale) {
  const step  = isPlaying ? currentStep : 0;
  const mIdx  = Math.floor(step / 8) % MEASURES;
  const data  = measureData[mIdx];
  const ni    = scale.intervals.length;
  const voicing = voicingDefs[activeVoicing] || voicingDefs.triad;
  const notes = voicing.degs.map(d => {
    const idx = ((data.deg + d) % ni + ni) % ni;
    return rootNames[(root + scale.intervals[idx]) % 12];
  });
  const rootN = rootNames[(root + scale.intervals[data.deg % ni]) % 12];
  const invLabel = activeInversion > 0 ? `/${notes[activeInversion % notes.length]}` : '';
  document.getElementById('chordDisplay').textContent = `${rootN}${invLabel} [${notes.join('-')}]`;
}

// ═══════════════════════════════════════════════════════════════════
//  PLAYBACK
// ═══════════════════════════════════════════════════════════════════
function togglePlayback() {
  const btn = document.getElementById('playBtn');
  const ph  = document.getElementById('playhead');
  const wrap= document.getElementById('seqWrap');

  if (isPlaying) {
    Tone.Transport.stop(); Tone.Transport.cancel();
    ph.style.display = 'none';
    btn.classList.remove('active'); btn.textContent = '▶ START';
    document.querySelectorAll('.m-card').forEach(c => c.classList.remove('active-measure'));
    document.querySelectorAll('.cell.playing').forEach(c => c.classList.remove('playing'));
    document.querySelectorAll('.chord-label').forEach(c => c.classList.remove('playing-chord'));
    isPlaying = false; return;
  }

  Tone.start();
  currentStep = 0;
  ph.style.display = 'block';
  btn.classList.add('active'); btn.textContent = '■ STOP';
  isPlaying = true;

  Tone.Transport.scheduleRepeat(time => {
    const root     = parseInt(document.getElementById('rootTone').value);
    const scaleKey = document.getElementById('scaleType').value;
    const scale    = scales[scaleKey];

    const editor = document.getElementById('editor');
    const cellW  = (editor.offsetWidth - 68) / STEPS;
    const ph2    = document.getElementById('playhead');
    ph2.style.left = (68 + currentStep * cellW) + 'px';

    const mIdx = Math.floor(currentStep / 8) % MEASURES;
    document.querySelectorAll('.m-card').forEach((c,i) => c.classList.toggle('active-measure', i===mIdx));

    // Chord label highlight
    document.querySelectorAll('.chord-label').forEach((cl, i) => {
      cl.classList.toggle('playing-chord', i === mIdx);
    });

    if (scale) updateChordDisplay(root, scale);

    document.querySelectorAll(`.cell[data-step="${currentStep}"] .note-block`).forEach(block => {
      const note = block.parentElement.dataset.note;
      const dur  = block.dataset.dur;
      const vel  = parseFloat(block.dataset.vel) || 0.8;
      const type = block.dataset.type;

      if (type === 'orn-node') {
        ornSynth.triggerAttackRelease(note, dur, time, vel);
      } else if (type === 'bass-node') {
        bassSynth.triggerAttackRelease(note, dur, time, vel);
      } else {
        leadSynth.triggerAttackRelease(note, dur, time, vel);
      }
    });

    // Chord at measure start — voiced with current voicing + inversion
    if (currentStep % 8 === 0 && scale && chordsAudioEnabled) {
      const data   = measureData[mIdx];
      const cNotes = buildVoicedChord(data, root, scale, "3");
      chordSynth.triggerAttackRelease(cNotes, "2n", time, 0.18);
    }

    currentStep = (currentStep + 1) % STEPS;
  }, "16n");

  Tone.Transport.start();
}

// ═══════════════════════════════════════════════════════════════════
//  SMART RANDOM
// ═══════════════════════════════════════════════════════════════════
function smartRandom() {
  const scaleKey = document.getElementById('scaleType').value;
  const scale    = scales[scaleKey];
  if (!scale) return;

  const rp = scale.progs[Math.floor(Math.random() * scale.progs.length)];
  rp.p.forEach((d, i) => { if (measureData[i]) measureData[i].deg = d; });

  measureData.forEach((m, i) => {
    const sugs = techSuggestions[m.deg] || techs;
    m.tech = sugs[Math.floor(Math.random() * sugs.length)];
    m.vel  = 0.6 + Math.random() * 0.35;
  });

  const resolveTeches = ['answer','falling','melodico','retardo','anticipa'];
  if (measureData[7]) measureData[7].tech = resolveTeches[Math.floor(Math.random()*resolveTeches.length)];
  if (measureData[3]) measureData[3].tech = resolveTeches[Math.floor(Math.random()*resolveTeches.length)];
  if (measureData[5]) { measureData[5].deg = 3; measureData[5].tech = 'climbing'; }
  if (measureData[6]) { measureData[6].deg = 4; measureData[6].tech = 'ratchet'; }

  renderMeasures(); refresh();
  document.getElementById('advisor').textContent = `🎲 ${rp.label} — ${rp.desc}`;
}

// ═══════════════════════════════════════════════════════════════════
//  AI COMPOSE
// ═══════════════════════════════════════════════════════════════════
function aiCompose() {
  const scaleKey = document.getElementById('scaleType').value;
  const scale    = scales[scaleKey];
  if (!scale) return;

  // Pick a random arc style
  const arcs = [
    { degs:[0,0,5,3,5,4,4,0], techs:['stab','arpegg','melodico','preg-resp','climbing','ratchet','retardo','answer'],
      vels:[0.7,0.72,0.78,0.75,0.82,0.9,0.85,0.72], name:"INTRO → TENSION → CLIMAX → RESOLVE" },
    { degs:[5,3,4,0,5,3,4,0], techs:['melodico','comb','climbing','answer','groove','bouncing','ratchet','stab'],
      vels:[0.72,0.75,0.80,0.78,0.82,0.85,0.88,0.7], name:"AXIS LOOP — vi IV V I" },
    { degs:[0,3,5,4,0,3,4,0], techs:['arpegg','paso','preg-resp','retardo','comb','climbing','anticipa','answer'],
      vels:[0.68,0.72,0.76,0.80,0.82,0.88,0.85,0.70], name:"EMOTIONAL ARC — I IV VI V" },
    { degs:[0,0,3,3,5,5,4,0], techs:['stab','ostinato','melodico','chord-roll','climbing','groove','ratchet','answer'],
      vels:[0.75,0.78,0.80,0.82,0.85,0.90,0.92,0.70], name:"PROGRESSIVE BUILD — DOUBLE MEASURES" },
  ];
  const arc = arcs[Math.floor(Math.random() * arcs.length)];

  arc.degs.forEach((d, i) => {
    if (!measureData[i]) return;
    measureData[i].deg  = d;
    measureData[i].tech = arc.techs[i];
    measureData[i].vel  = arc.vels[i];
  });

  renderMeasures(); refresh();
  document.getElementById('advisor').textContent = `🤖 AI: ${arc.name}`;
}

// ═══════════════════════════════════════════════════════════════════
//  CLEAR
// ═══════════════════════════════════════════════════════════════════
function clearAll() {
  measureData = Array(MEASURES).fill(null).map(() => ({ deg:0, tech:'stab', res:'16n', vel:0.8 }));
  builderSequence = [];
  renderBuilderSlots();
  renderMeasures(); refresh();
  document.getElementById('advisor').textContent = 'CLEARED';
}

// ═══════════════════════════════════════════════════════════════════
//  EXPORT MIDI — 4 tracks
// ═══════════════════════════════════════════════════════════════════
function exportMIDI() {
  const midi = new Midi();
  midi.header.setTempo(Tone.Transport.bpm.value);

  const leadTrack  = midi.addTrack(); leadTrack.name  = "Lead Melody";
  const ornTrack   = midi.addTrack(); ornTrack.name   = "Ornaments";
  const chordTrack = midi.addTrack(); chordTrack.name = "Chords";
  const bassTrack  = midi.addTrack(); bassTrack.name  = "Bass";

  const stepSec = Tone.Time("16n").toSeconds();
  const root     = parseInt(document.getElementById('rootTone').value);
  const scaleKey = document.getElementById('scaleType').value;
  const scale    = scales[scaleKey];

  measureData.forEach((data, mIdx) => {
    const t = mIdx * 8 * stepSec;
    const cNotes = buildVoicedChord(data, root, scale, "3");
    cNotes.forEach(n =>
      chordTrack.addNote({ name:n, time:t, duration:8*stepSec, velocity:0.3 })
    );
  });

  for (let s=0; s<STEPS; s++) {
    document.querySelectorAll(`.cell[data-step="${s}"] .note-block`).forEach(block => {
      const name = block.parentElement.dataset.note;
      const t    = s * stepSec;
      const dur  = Tone.Time(block.dataset.dur).toSeconds();
      const vel  = parseFloat(block.dataset.vel) || 0.8;
      const type = block.dataset.type;
      if (type === 'orn-node')    ornTrack.addNote({name, time:t, duration:dur, velocity:vel});
      else if (type==='bass-node') bassTrack.addNote({name, time:t, duration:dur, velocity:vel});
      else                         leadTrack.addNote({name, time:t, duration:dur, velocity:vel});
    });
  }

  const blob = new Blob([midi.toArray()], { type:"audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `architect_v3_${document.getElementById('rootTone').value}_${scaleKey}.mid`;
  a.click();
}

// ═══════════════════════════════════════════════════════════════════
//  GLOBAL EXPORTS
// ═══════════════════════════════════════════════════════════════════
window.updateBPM       = updateBPM;
window.togglePlayback  = togglePlayback;
window.clearAll        = clearAll;
window.smartRandom     = smartRandom;
window.aiCompose       = aiCompose;
window.exportMIDI      = exportMIDI;
window.buildGrid       = buildGrid;
window.setDeg          = setDeg;
window.setTech         = setTech;
window.setVel          = setVel;
window.toggleChords    = toggleChords;
window.toggleOdesi     = toggleOdesi;
window.switchCPTab     = switchCPTab;
window.setInversion    = setInversion;
window.applyBuilderSequence = applyBuilderSequence;
window.updateChordVol  = updateChordVol;

init();
  });
});