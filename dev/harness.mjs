// Loads the REAL engine out of index.html. Nothing is reimplemented here: the module source
// is executed as-is, with the browser and Firebase stubbed out, and the engine's own
// functions are handed back. If a test passes here, it passes because the shipped code works.
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const src  = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

// Strip the Firebase imports; everything they provide is stubbed below.
const body = src.replace(/^import .*?;$/gm, '');

// ── Stubs ───────────────────────────────────────────────────────────────────
const el = new Proxy({}, {
  get(t, k) {
    if (k === 'classList')   return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    if (k === 'style')       return new Proxy({}, { get: () => () => {}, set: () => true });
    if (k === 'dataset')     return {};
    if (k === 'children' || k === 'childNodes') return [];
    if (k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
    if (typeof k === 'string' && k.startsWith('offset')) return 100;
    if (k === 'clientHeight' || k === 'clientWidth') return 100;
    if (k === 'getBoundingClientRect') return () => ({ top:0, left:0, right:0, bottom:0, width:0, height:0 });
    return () => el;   // every method call returns another fake element
  },
  set() { return true; }
});
const doc = {
  getElementById: () => el, querySelector: () => el, querySelectorAll: () => [],
  createElement: () => el, createElementNS: () => el, createDocumentFragment: () => el,
  addEventListener(){}, body: el, fonts: { ready: { then(){} } }, activeElement: null
};
export const mockDB = { profile: null, writes: [] };

const stubs = {
  document: doc,
  window: { addEventListener(){}, innerWidth:1600, innerHeight:900, location:{ href:'' } },
  requestAnimationFrame: () => 0,
  setTimeout: () => 0,
  setInterval: () => 0,
  clearInterval: () => 0,
  confirm: () => true,
  alert: () => {},
  // Firebase — no game in these tests ever writes to the network.
  initializeApp: () => ({}), getDatabase: () => ({}), ref: (db, path) => ({ path }),
  set:    async (r, v) => { mockDB.writes.push({ op:'set',    path:r&&r.path, value:v }); mockDB.profile = v; },
  update: async (r, v) => { mockDB.writes.push({ op:'update', path:r&&r.path, value:v }); Object.assign(mockDB.profile||{}, v); },
  get:    async () => ({ exists: () => !!mockDB.profile, val: () => mockDB.profile }),
  onValue: () => {},
  getAuth: () => ({}), createUserWithEmailAndPassword: async () => {},
  signInWithEmailAndPassword: async () => {}, signOut: async () => {},
  onAuthStateChanged: () => {}, updateProfile: async () => {}
};

// Hand back exactly the engine symbols the tests need, plus a setter for myRole (krushSearch
// reads it to decide whether the deck reveal is printed for you or hidden).
const tail = `
;return {
  CARDS_DATA, CARD_LOGIC, QUEST_DEFS, SIN_IDS, CARD_TOKENS, CARD_VARIANTS,
  JOURNEY_LOGIC, CHOOSE_OPTIONS, SPLIT_CARDS,
  MAX_COPIES, DECK_SIZE, MAX_QUESTS, MAX_BLESSINGS, CRAFT_COST, DISENCHANT,
  mkCard, buildCtx, dealDmg, setHealth, heal, curseCard, isImmune, takeable,
  shuffleIntoDeck, extractQuests, advanceQuestsFor, playBlockedReason,
  fireDiscard, discardCards, drawCards, fireDrawTriggers, maxHandSize,
  logicSources, foldValue, emit, nyrBecomeReward, krushSearch, instantWin,
  logs, maxCopies, checkDeath, hasJourney, hasTag, selectLimit, buildDeck,
  stampOwner, fromEnemyDeck, stealCard, vaultOf, vaultCards, discardTo,
  resolveRound, collectibleCards, ownedCount,
  deckSize, deckDefs, deckValid, whyNotAdd, pruneDeck, buildDeckFrom, deckLimitFor, deckGhosts, deckProblem,
  setMyRole: (v)=>{ myRole=v; },
  setSolo:   (v)=>{ soloMode=v; },
  setProfile:(p)=>{ myProfile=p; },
  setLocalGs:(g)=>{ localGs=g; },
  getLocalGs:()=>localGs,
  APP_VERSION,
  loadProfile, saveDecks, saveCollection,
  isStale:  ()=>staleClient,
  setStale: (v)=>{ staleClient=v; },
  setUser:  (u)=>{ currentUser=u; }
};`;

export const E = new Function(...Object.keys(stubs), body + tail)(...Object.values(stubs));

// A blank two-player state, same shape the game creates.
export function mkState(over = {}) {
  const side = () => ({
    name:'X', hp:150, maxHp:150, deck:[], hand:[], graveyard:[], void:[],
    blessing:null, rewards:[], quests:[], journeyEffects:[], journeyHistory:[],
    blocked:false, hindered:false, forcedType:null, forcedTypeNext:null,
    pendingHeals:[], shieldRounds:0, cakesPlayed:0, dmgDealtThisRound:0,
    dmgDealtLastRound:0, extraDraw:0, noDraw:false, selectedCards:[],
    confirmed:false, lastPlayed:[], playedIds:[], effects:[]
  });
  const s = { round:1, phase:'select', p1:side(), p2:side(), ...over };
  s.p1.name='You'; s.p2.name='Foe';
  return s;
}

export const card = id => E.mkCard(E.CARDS_DATA.find(c => c.id === id));
// Play a card exactly like runCard does: requirement guard → register → onPlay.
export function play(state, r, id, extra = {}) {
  const c = card(id);
  const blocked = E.playBlockedReason(state, r, c);
  if (blocked) return { blocked };
  if (!state[r].playedIds.includes(c.id)) state[r].playedIds.push(c.id);
  const L = E.CARD_LOGIC[c.id];
  if (L && L.onPlay) L.onPlay(E.buildCtx(state, r, { card: Object.assign(c, extra) }));
  return { card: c };
}
