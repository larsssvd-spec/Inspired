import { E, mkState, card, play } from './harness.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); }
};
const head = t => console.log('\n' + t);
const cursed = c => c && c.cursedUntil !== undefined;
const byId = id => E.CARDS_DATA.find(c => c.id === id);

// ── 1. DATA INTEGRITY ───────────────────────────────────────────────────────
head('Card data integrity (41 cards)');
{
  const ids = E.CARDS_DATA.map(c => c.id);
  ok('every card id is unique', new Set(ids).size === ids.length);
  ok('every card has a name and text', E.CARDS_DATA.every(c => c.name && c.text));
  ok('every card has a valid rarity', E.CARDS_DATA.every(c => ['common','legendary'].includes(c.rarity)));

  const logicKeys = Object.keys(E.CARD_LOGIC);
  const orphans = logicKeys.filter(k => !ids.includes(k));
  ok('no logic entry points at a card that does not exist', orphans.length === 0, orphans.join(','));

  const noArt = E.CARDS_DATA.filter(c => c.collectible && !c.art).map(c => c.id);
  ok('every collectible card has an art path', noArt.length === 0, noArt.join(','));

  const reqs = E.CARDS_DATA.filter(c => c.requiresPlayed);
  ok('every requiresPlayed points at a real card', reqs.every(c => ids.includes(c.requiresPlayed)));

  const questCards = E.CARDS_DATA.filter(c => c.quest);
  ok('every quest card has a QUEST_DEFS entry', questCards.every(c => !!E.QUEST_DEFS[c.quest]));
  ok('quest cards are typed as quests', questCards.every(c => c.type === 'quest'));

  const tokenIds = [...Object.values(E.CARD_TOKENS).flatMap(t => t.ids)];
  ok('every token in CARD_TOKENS exists', tokenIds.every(id => ids.includes(id)));
  ok('every token is noDeck + not collectible',
     tokenIds.every(id => byId(id).noDeck === true && !byId(id).collectible));
  ok('every variant in CARD_VARIANTS points at a real card',
     Object.keys(E.CARD_VARIANTS).every(id => ids.includes(id)));

  const blessings = E.CARDS_DATA.filter(c => c.type === 'blessing');
  ok('blessing cards exist and are collectible', blessings.length >= 1 && blessings.every(c => c.collectible));
}

// ── 2. DECKBUILDER RULES ────────────────────────────────────────────────────
head('Deckbuilder rules');
{
  // A collection with 2 of every common and 1 of every legendary.
  const collection = {};
  E.CARDS_DATA.filter(c => c.collectible).forEach(c => { collection[c.id] = c.rarity === 'legendary' ? 1 : 2; });
  E.setProfile({ collection, fairyDust: 0, decks: {} });

  const deck = { name:'T', cards:{} };
  ok('you cannot add a card you do not own',
     !!E.whyNotAdd({ name:'x', cards:{} }, { id:'nope_i_dont_own_this', rarity:'common' }));

  deck.cards['blaargh'] = 2;
  ok('common copy limit is 2', !!E.whyNotAdd(deck, byId('blaargh')));
  deck.cards['zorya'] = 1;
  ok('legendary copy limit is 1', !!E.whyNotAdd(deck, byId('zorya')));

  // Quests: max 2
  const qDeck = { name:'q', cards:{ zorya:1, opening_ceremony:1 } };
  ok('max 2 quests per deck', !!E.whyNotAdd(qDeck, byId('zorya')));

  // Blessings: max 1
  const bDeck = { name:'b', cards:{ new_year_resolutions:1 } };
  ok('max 1 blessing per deck', !!E.whyNotAdd(bDeck, byId('new_year_resolutions')));

  // Size cap of 40
  // Fill to exactly 40 out of the real collection (12 commons ×2 = 24, then legendaries ×1).
  const full = { name:'f', cards:{} };
  E.CARDS_DATA.filter(c => c.collectible && c.rarity === 'common').forEach(c => { full.cards[c.id] = 2; });
  for (const c of E.CARDS_DATA.filter(c => c.collectible && c.rarity === 'legendary')) {
    if (E.deckSize(full) >= 40) break;
    if (!E.whyNotAdd(full, c)) full.cards[c.id] = 1;
  }
  // Track the ceiling instead of hard-coding it: this grows with every card added, and the
  // moment it reaches 40 the deckbuilder becomes usable. Reports the gap either way.
  const ceiling = E.deckSize(full);
  ok('the card pool can fill a legal 40-card deck', ceiling >= 40,
     'biggest legal deck right now: ' + ceiling + '/40 — need ' + Math.ceil((40 - ceiling) / 2) + ' more commons');
  ok('a 39-card deck is not playable', !E.deckValid({ cards:{ blaargh:2 } }));

  // Pruning after disenchanting
  E.setProfile({ collection: { blaargh: 1 }, decks:{} });
  const pruned = { name:'p', cards:{ blaargh: 2, zorya: 1 } };
  const removed = E.pruneDeck(pruned);
  ok('pruning drops copies you no longer own', pruned.cards.blaargh === 1);
  ok('pruning removes cards you own none of', pruned.cards.zorya === undefined);
  ok('and it reports exactly what was removed', removed.length === 2);

  // Linked blessing needs to be owned AND needs its carrier in the deck
  // A REAL blessing you disenchanted → unlinked. (An UNKNOWN id is left alone: see the
  // out-of-date-client tests below.)
  E.setProfile({ collection: { new_year_resolutions: 1 }, decks:{} });   // hearth NOT owned
  const linked = { name:'l', cards:{ new_year_resolutions:1 }, linkedBlessing:'hearth_of_our_galaxy' };
  E.pruneDeck(linked);
  ok('a linked blessing you no longer own is unlinked', linked.linkedBlessing === null);

  const orphanLink = { name:'o', cards:{ blaargh:1 }, linkedBlessing:'new_year_resolutions' };
  E.pruneDeck(orphanLink);
  ok('a linked blessing without its carrier is unlinked', orphanLink.linkedBlessing === null);

  // Building a real deck out of a saved one
  E.setProfile({ collection, decks:{} });
  const built = E.buildDeckFrom(full);
  ok('a saved deck expands into real cards', built.length === E.deckSize(full));
  ok('every built card has its own uid', new Set(built.map(c => c.uid)).size === built.length);
}

// ── 3. BLESSING EXTRACTION ──────────────────────────────────────────────────
head('Blessings enter play like quests');
{
  const deck = [card('new_year_resolutions'), ...Array.from({length:5}, () => card('blaargh'))];
  const out = E.extractQuests(deck, 'oracle_murloc');
  ok('the blessing is pulled out of the deck (never drawable)', !out.deck.some(c => c.type === 'blessing'));
  ok('it is active from turn 1', out.blessing && out.blessing.id === 'new_year_resolutions');
  ok('it starts at 0 activations', out.blessing.hits === 0 && out.blessing.rewarded === false);
  ok('the linked blessing rides along', out.blessing.linked === 'oracle_murloc');

  const noLink = E.extractQuests([card('new_year_resolutions')], null);
  ok('no linked blessing is fine', noLink.blessing.linked === null);
  const none = E.extractQuests([card('blaargh')], null);
  ok('a deck without a blessing has none', none.blessing === null);
}

// ── 4. A FULL ROUND THROUGH THE REAL RESOLVE LOOP ───────────────────────────
head('A full round through resolveRound()');
{
  E.setMyRole('p1'); E.setSolo(true);
  const s = mkState();
  s.firstPlayer = 'p1';
  s.p1.deck = Array.from({length:10}, () => card('blaargh'));
  s.p2.deck = Array.from({length:10}, () => card('blaargh'));
  s.p1.selectedCards = [card('blaargh')];              // 10 damage
  s.p2.selectedCards = [card('critical_bite')];        // fizzles at 150 hp
  E.resolveRound(s);
  const r1 = E.getLocalGs();                           // solo: the result lands in localGs
  ok('a played card deals its damage', r1.p2.hp === 140, 'foe hp=' + r1.p2.hp);
  ok('Critical Bite fizzled at full health', r1.p1.hp === 150, 'you hp=' + r1.p1.hp);
  ok('the round advanced', r1.round === 2);
  ok('played cards moved to the graveyard', r1.p1.graveyard.some(c => c.id === 'blaargh'));
  ok('both players drew back up', r1.p1.hand.length > 0 && r1.p2.hand.length > 0);
  ok('selections were cleared', r1.p1.selectedCards.length === 0 && r1.p2.selectedCards.length === 0);
  ok('lastPlayed is kept for the result screen', r1.p1.lastPlayed.length === 1);
  ok('this round\'s damage is recorded', r1.p1.dmgDealtThisRound === 10, 'this=' + r1.p1.dmgDealtThisRound);
  ok('and last round\'s total is carried (Hangover Hex reads it)', r1.p1.dmgDealtLastRound === 0);
}

head('Cursed cards rot at the end of the round');
{
  E.setSolo(true);
  const s = mkState();
  s.firstPlayer = 'p1';
  s.p1.deck = Array.from({length:5}, () => card('blaargh'));
  s.p2.deck = Array.from({length:5}, () => card('blaargh'));
  const doomed = card('critical_bite');
  doomed.cursedUntil = 1;                    // must be played this round or rot
  s.p1.hand = [doomed];
  E.resolveRound(s);
  const r2 = E.getLocalGs();
  ok('an unplayed Cursed card rots away', !r2.p1.hand.some(c => c.uid === doomed.uid));
  ok('and it lands in the graveyard', r2.p1.graveyard.some(c => c.uid === doomed.uid));
  ok('rotting did NOT count as a discard', r2.p2.hp === 150);
}

head('Hindered blocks the draw, then clears');
{
  E.setSolo(true);
  const s = mkState();
  s.firstPlayer = 'p1';
  s.p1.deck = Array.from({length:6}, () => card('blaargh'));
  s.p2.deck = Array.from({length:6}, () => card('blaargh'));
  s.p1.selectedCards = [card('deep_lust')];   // discards hand + Hindered
  s.p1.hand = [];
  E.resolveRound(s);
  const r3 = E.getLocalGs();
  ok('Deep Lust means no draw that round', r3.p1.hand.length === 0, 'hand=' + r3.p1.hand.length);
  ok('the opponent still drew', r3.p2.hand.length === 2, 'foe hand=' + r3.p2.hand.length);
  ok('Hindered clears afterwards', r3.p1.hindered === false);
}

// ── 5. OLDER CARDS STILL WORK ───────────────────────────────────────────────
head('Older cards');
{
  // Fireblast Confetti: 5 + 10 per Celebration still held
  const s = mkState();
  s.p1.hand = [card('arcane_cake_celebration'), card('larrys_lover')];
  play(s, 'p1', 'fireblast_confetti');
  ok('Fireblast Confetti scales with held Celebrations', s.p2.hp === 150 - 25, 'foe hp=' + s.p2.hp);

  // Pest Doctor: 10, or 25 if the opponent played a Cursed card this round
  const s2 = mkState();
  play(s2, 'p1', 'pest_doctor');
  ok('Pest Doctor deals 10 normally', s2.p2.hp === 140, 'foe hp=' + s2.p2.hp);

  // Detective Bubbles: 10 self-damage now, 15 heal queued
  const s3 = mkState();
  play(s3, 'p1', 'detective_bubbles');
  ok('Detective Bubbles hurts you 10', s3.p1.hp === 140);
  ok('and queues a heal for next round', (s3.p1.pendingHeals || []).length === 1);

  // Skywalker: forces a card type on the opponent next round
  const s4 = mkState();
  play(s4, 'p1', 'skywalker', { _choice: 'damage' });
  ok('Skywalker forces a type on the opponent', s4.p2.forcedTypeNext === 'damage');

  // Full Pyrax: hard-set health to 150
  const s5 = mkState();
  s5.p1.hp = 20;
  play(s5, 'p1', 'full_pyrax');
  ok('Full Pyrax sets health to 150', s5.p1.hp === 150);

  // Enchanted Orb fizzles when actually played
  const s6 = mkState();
  play(s6, 'p1', 'enchanted_orb');
  ok('a played Enchanted Orb does nothing', s6.p1.hp === 150 && s6.p2.hp === 150);

  // Murloc Things: uncurse your hand
  const s7 = mkState();
  const c1 = card('blaargh'), c2 = card('blaargh');
  c1.cursedUntil = 2; c2.cursedUntil = 2;
  s7.p1.hand = [c1, c2];
  play(s7, 'p1', 'murloc_things');
  ok('Murloc Things uncurses your hand', !cursed(c1) && !cursed(c2));

  // Deepception is Immune and can't be taken or cursed
  ok('Deepception is Immune', E.isImmune(card('deepception')));
  ok('Immune cards are not takeable', !E.takeable(card('deepception')));
  const s8 = mkState();
  const dc = card('deepception');
  ok('an Immune card cannot be Cursed', E.curseCard(s8, dc) === false && !cursed(dc));
}

// ── 6. INTERACTIONS BETWEEN OLD AND NEW ─────────────────────────────────────
head('Interactions');
{
  // Devour Hope destroys cards YOU shuffle into your OWN deck — including the new tokens.
  const s = mkState();
  s.p1.effects = [{ id:'devour_hope' }];
  s.p1.deck = [card('blaargh')];
  play(s, 'p1', 'baby_krush');
  ok('Devour Hope eats the Krush family on the way in',
     !s.p1.deck.some(c => ['krush','king_krush','the_krush'].includes(c.id)));
  // Devour Hope hits the OPPONENT for 5 true per devoured card: 5 (Baby Krush) + 3×5 = 20.
  ok('each devoured card burns the opponent for 5 true', s.p2.hp === 130, 'foe hp=' + s.p2.hp);
  ok('the devoured cards go to the void, not the deck', (s.p1.void || []).length === 3);

  const s2 = mkState();
  s2.p1.effects = [{ id:'devour_hope' }];
  s2.p1.deck = [card('blaargh')];
  s2.p1.hand = [card('blaargh')];
  s2.p1.hand[0].cursedUntil = 2;
  play(s2, 'p1', 'vol_dor_mook');
  ok('Devour Hope eats Fireballs too', !s2.p1.deck.some(c => c.id === 'fireball'));

  // New Year Resolutions also boosts TRUE damage (it folds before the hp subtraction).
  const s3 = mkState();
  s3.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:0, rewarded:false, linked:null };
  E.dealDmg(s3, 'p2', 10, true, 'p1');
  ok('NYR upgrades true damage as well', s3.p2.hp === 135, 'foe hp=' + s3.p2.hp);

  // Blocked blows never reach the modifier → they don't count as an activation.
  const s4 = mkState();
  s4.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:0, rewarded:false, linked:null };
  s4.p2.blocked = true;
  E.dealDmg(s4, 'p2', 10, false, 'p1');
  ok('a blocked blow does not activate NYR', s4.p1.blessing.hits === 0 && s4.p2.hp === 150);

  // Baby Krush (5 true) + Blaargh (10) = 15 total → NYR must NOT fire (never exactly 10).
  const s5 = mkState();
  s5.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:0, rewarded:false, linked:null };
  s5.p1.deck = [];
  play(s5, 'p1', 'baby_krush');   // 5
  play(s5, 'p1', 'blaargh');      // 10 → total would be 15, never exactly 10
  ok('NYR does not fire when the total skips past 10', s5.p1.blessing.hits === 0, 'hits=' + s5.p1.blessing.hits);
  ok('so the damage stays 15', s5.p2.hp === 135, 'foe hp=' + s5.p2.hp);

  // Deep Greed draws a deck full of Fireballs → each one goes off.
  const s6 = mkState();
  s6.p1.deck = [card('fireball'), card('fireball'), card('blaargh'), card('blaargh')];
  s6.p2.hand = [card('blaargh'), card('blaargh'), card('blaargh'), card('blaargh')];
  play(s6, 'p1', 'deep_greed');
  ok('Deep Greed sets off every Fireball it draws', s6.p2.hp === 110, 'foe hp=' + s6.p2.hp);
  ok('the Fireballs are not left in hand', !s6.p1.hand.some(c => c.id === 'fireball'));

  // Blaargh discarded by Deep Lust while NYR is up: 20 damage, so no exact-10 trigger.
  const s7 = mkState();
  s7.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:0, rewarded:false, linked:null };
  s7.p1.hand = [card('blaargh')];
  play(s7, 'p1', 'deep_lust');
  ok('a discarded Blaargh deals its 20 (no NYR trigger)', s7.p2.hp === 130 && s7.p1.blessing.hits === 0);

  // Zorya's Sins are real Sins for the quest, even the ones that hurt you.
  const s8 = mkState();
  s8.round = 1;
  s8.p1.quests = E.extractQuests([card('zorya')]).quests;
  E.SIN_IDS.forEach(id => E.advanceQuestsFor(s8, 'p1', card(id)));
  ok('all four Sins advance the Zorya quest', s8.p1.quests[0].done);

  // Critical Bite becomes live exactly when Deep Pride drops you to 1.
  const s9 = mkState();
  s9.p1.hp = 120; s9.round = 2;
  play(s9, 'p1', 'deep_pride');
  E.emit(s9, 'onRoundEnd', 'p1', {});
  ok('Deep Pride puts you at 1 health', s9.p1.hp === 1);
  ok('which turns Critical Bite live', E.CARDS_DATA.find(c => c.id === 'critical_bite').playIfHpBelow > s9.p1.hp);
  play(s9, 'p1', 'critical_bite');
  ok('and it now deals its 30', s9.p2.hp === 120, 'foe hp=' + s9.p2.hp);
}

head('The deck counter cannot lie');
{
  E.setProfile({ collection: { blaargh: 2, critical_bite: 2 }, decks: {} });

  // A deck holding a card id that no longer exists must NOT count it. The old deckSize summed
  // the raw entries while buildDeckFrom skipped unknown ids — so the picker said 40/40 and you
  // sat down with a short deck. This is that bug, nailed down.
  const rotten = { name:'rotten', cards: { blaargh: 2, a_card_that_no_longer_exists: 10 } };
  ok('a dead card id is not counted', E.deckSize(rotten) === 2, 'size=' + E.deckSize(rotten));
  ok('the counter matches what actually gets built',
     E.deckSize(rotten) === E.buildDeckFrom(rotten).length,
     E.deckSize(rotten) + ' vs ' + E.buildDeckFrom(rotten).length);
  ok('and such a deck is reported as invalid', !E.deckValid(rotten));
  ok('the dead ids can be listed', E.deckGhosts(rotten).length === 1);

  // A healthy deck counts exactly what it builds — with Alter Ego cards counting as one slot
  // but building two cards. That is the one intentional difference.
  const clean = { name:'clean', cards: { blaargh: 2, critical_bite: 2 } };
  ok('a clean deck counts what it builds', E.deckSize(clean) === E.buildDeckFrom(clean).length);
}

head('An out-of-date client must never gut a deck');
{
  E.setProfile({ collection: { blaargh: 2 }, decks: {} });

  // A deck holding a card this build has never heard of (because it was built on a newer
  // version) must be left completely alone. THIS is the bug that ate Lars's deck: prune saw
  // an unknown id, decided "you don't own that", and deleted it from Firebase for good.
  const fromFuture = { name:'future', cards: { blaargh: 2, card_from_a_newer_build: 3 } };
  const removed = E.pruneDeck(fromFuture);
  ok('unknown cards are NOT deleted', fromFuture.cards.card_from_a_newer_build === 3);
  ok('and they are not reported as removed', removed.length === 0);
  ok('the deck is flagged unplayable here instead', !E.deckValid(fromFuture));
  ok('with an honest reason', /newer version/i.test(E.deckProblem(fromFuture) || ''));

  // Cards you genuinely disenchanted are still pruned — that part must keep working.
  E.setProfile({ collection: { blaargh: 1 }, decks: {} });
  const sold = { name:'sold', cards: { blaargh: 2 } };
  const removed2 = E.pruneDeck(sold);
  ok('a disenchanted copy is still removed', sold.cards.blaargh === 1);
  ok('and it IS reported, by name', removed2.length === 1 && removed2[0].name === 'Blaargh');
}

console.log('\n' + '─'.repeat(46));
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
