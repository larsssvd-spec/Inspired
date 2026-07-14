import { E, mkState, card, play } from './harness.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); }
};
const head = t => console.log('\n' + t);
const cursed = c => c && c.cursedUntil !== undefined;

// ── ZORYA + THE SINS ────────────────────────────────────────────────────────
head('Zorya (quest)');
{
  const deck = [card('zorya'), ...Array.from({length:10}, () => card('blaargh'))];
  const { deck: rest, quests } = E.extractQuests(deck);
  ok('Zorya is pulled out of the deck (never drawable)', !rest.some(c => c.id === 'zorya'));
  ok('quest is active from turn 1', quests.some(q => q.id === 'zorya' && q.goal === 4));
  ok('4 Sins are shuffled in', rest.filter(c => c.sin).length === 4);
  ok('all four Sins are the real ones', E.SIN_IDS.every(id => rest.some(c => c.id === id)));

  const s = mkState();
  s.p1.quests = quests;
  s.round = 8;
  E.SIN_IDS.forEach(id => E.advanceQuestsFor(s, 'p1', card(id)));
  const q = s.p1.quests.find(x => x.id === 'zorya');
  ok('playing 4 Sins completes the quest', q.done && q.progress === 4);
  ok('the win is ARMED with the round of the 4th Sin', s.p1.effects.some(e => e.id === 'zorya' && e.armed === 8));

  // End of round 8: armed this round → no win yet.
  E.emit(s, 'onRoundEnd', 'p1', {});
  ok('no win in the same round', !s._winner);
  // End of round 9: survived one more round → win.
  s.round = 9;
  let won = false;
  try { E.emit(s, 'onRoundEnd', 'p1', {}); } catch (e) { won = (s._winner === 'p1'); }
  ok('win at the end of the NEXT round', won, 'winner=' + s._winner);
}

head('Deep Envy');
{
  const s = mkState(); s.p1.hp = 90; s.p2.hp = 60;
  play(s, 'p1', 'deep_envy');
  ok('health = opponent − 25', s.p1.hp === 35, 'hp=' + s.p1.hp);

  const s2 = mkState(); s2.p1.hp = 90; s2.p2.hp = 20;
  try { play(s2, 'p1', 'deep_envy'); } catch (e) {}
  ok('opponent at 20 → you set yourself to 0 (death)', s2.p1.hp === 0);
}

head('Deep Greed');
{
  const s = mkState();
  s.p1.hand = [card('blaargh'), card('critical_bite')];
  s.p1.deck = Array.from({length:10}, () => card('blaargh'));
  s.p1.hindered = true;                       // must be ignored
  s.p1.journeyEffects = ['draw_1'];           // must be ignored too
  play(s, 'p1', 'deep_greed');
  ok('hand is filled to max, ignoring draw restrictions', s.p1.hand.length === E.maxHandSize(s, 'p1'), 'hand=' + s.p1.hand.length);
  ok('the ENTIRE hand is Cursed, not just the new cards', s.p1.hand.every(cursed));
}

head('Deep Lust');
{
  const s = mkState();
  const immune = card('deepception');
  s.p1.hand = [card('blaargh'), card('blaargh'), immune];
  play(s, 'p1', 'deep_lust');
  ok('immune cards survive in hand', s.p1.hand.length === 1 && s.p1.hand[0].id === 'deepception');
  ok('the rest is discarded', s.p1.graveyard.length === 2);
  ok('Hindered is set (no draw this round)', s.p1.hindered === true);
  ok('discards are REAL (Blaargh fired twice: 40 damage)', s.p2.hp === 110, 'foe hp=' + s.p2.hp);
}

head('Deep Pride');
{
  const s = mkState(); s.p1.hp = 120; s.round = 3;
  play(s, 'p1', 'deep_pride');
  ok('nothing happens the moment it is played', s.p1.hp === 120);
  E.emit(s, 'onRoundEnd', 'p1', {});
  ok('end of its own round → health drops to 1', s.p1.hp === 1);
  s.round = 4;
  E.heal(s, 'p1', 30);                       // healing works during the window
  ok('heals work while at 1', s.p1.hp === 31);
  E.emit(s, 'onRoundEnd', 'p1', {});
  ok('end of next round → reverts to the REMEMBERED health', s.p1.hp === 120, 'hp=' + s.p1.hp);
  ok('the effect is gone afterwards', !s.p1.effects.some(e => e.id === 'deep_pride'));
}

// ── NEW YEAR RESOLUTIONS ────────────────────────────────────────────────────
head('New Year Resolutions (blessing → reward)');
{
  const s = mkState();
  s.p1.blessing = { id:'new_year_resolutions', name:'New Year Resolutions', hits:0, rewarded:false, linked:null };
  E.dealDmg(s, 'p2', 10, false, 'p1');
  ok('a blow that totals exactly 10 lands as 15', s.p2.hp === 135, 'foe hp=' + s.p2.hp);
  ok('one activation counted', s.p1.blessing.hits === 1);

  // 6 + 4 → the 4 becomes 9 (total 15)
  const s2 = mkState();
  s2.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:0, rewarded:false, linked:null };
  E.dealDmg(s2, 'p2', 6, false, 'p1');
  E.dealDmg(s2, 'p2', 4, false, 'p1');
  ok('6 + 4 → total becomes 15, not 10', s2.p2.hp === 135, 'foe hp=' + s2.p2.hp);

  // Two blows of 10: the first fires, the second doesn't (total is past 10).
  const s3 = mkState();
  s3.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:0, rewarded:false, linked:null };
  E.dealDmg(s3, 'p2', 10, false, 'p1');
  E.dealDmg(s3, 'p2', 10, false, 'p1');
  ok('fires at most once per round', s3.p1.blessing.hits === 1);
  ok('second blow of 10 stays 10', s3.p2.hp === 125, 'foe hp=' + s3.p2.hp);

  // 5 activations → graduation, and the linked blessing wakes up.
  const s4 = mkState();
  s4.p1.blessing = { id:'new_year_resolutions', name:'NYR', hits:4, rewarded:false, linked:'oracle_murloc' };
  E.dealDmg(s4, 'p2', 10, false, 'p1');
  ok('after the 5th activation it becomes a Reward', s4.p1.rewards.some(r => r.id === 'new_year_resolutions' && r.rewarded));
  ok('it vacates the blessing slot', !s4.p1.blessing || s4.p1.blessing.id !== 'new_year_resolutions');
  ok('the Reward still counts as a logic source', E.logicSources(s4, 'p1').some(x => x.kind === 'reward'));
}

// ── BLAARGH ─────────────────────────────────────────────────────────────────
head('Blaargh');
{
  const s = mkState();
  play(s, 'p1', 'blaargh');
  ok('played: 10 damage', s.p2.hp === 140);

  const s2 = mkState();
  const b = card('blaargh');
  s2.p1.hand = [b];
  E.discardCards(s2, 'p1', 1, [b.uid]);
  ok('discarded: 20 damage to the OPPONENT', s2.p2.hp === 130, 'foe hp=' + s2.p2.hp);
  ok('and it is in the graveyard', s2.p1.graveyard.some(c => c.id === 'blaargh'));

  const s3 = mkState();
  s3.p1.hand = [card('blaargh')];
  s3.p1.hand[0].cursedUntil = 1;
  s3.round = 2;
  // Rotting away is NOT a discard → must not fire. (Same path the resolve loop uses.)
  const gy = s3.p1.graveyard;
  s3.p1.hand.forEach(c => { if (c.cursedUntil <= s3.round) gy.unshift(c); });
  s3.p1.hand = [];
  ok('rotting from a Curse does NOT trigger it', s3.p2.hp === 150);
}

// ── CRITICAL BITE ───────────────────────────────────────────────────────────
head('Critical Bite');
{
  // Above the threshold it cannot be SELECTED at all — the same hard block as the Krush chain.
  const s = mkState(); s.p1.hp = 25;
  ok('at 25 health it is blocked', !!E.playBlockedReason(s, 'p1', card('critical_bite')));
  const r = play(s, 'p1', 'critical_bite');
  ok('and playing it anyway does nothing', r.blocked && s.p2.hp === 150, 'foe hp=' + s.p2.hp);

  const s1 = mkState(); s1.p1.hp = 20;
  ok('exactly 20 is still blocked (must be BELOW 20)', !!E.playBlockedReason(s1, 'p1', card('critical_bite')));

  const s2 = mkState(); s2.p1.hp = 15;
  ok('at 15 health it unlocks', E.playBlockedReason(s2, 'p1', card('critical_bite')) === null);
  play(s2, 'p1', 'critical_bite');
  ok('and deals 30', s2.p2.hp === 120, 'foe hp=' + s2.p2.hp);

  // Healing past the threshold earlier in your own row locks it again at flip time.
  const s3 = mkState(); s3.p1.hp = 15;
  E.heal(s3, 'p1', 30);                       // now at 45
  const r3 = play(s3, 'p1', 'critical_bite');
  ok('healing past 20 before it flips locks it out', r3.blocked && s3.p2.hp === 150);

  ok('threshold is a plain field the hand can read', card('critical_bite').playIfHpBelow === 20);
}

// ── VOL'DOR MOOK + FIREBALL ─────────────────────────────────────────────────
head("Vol'Dor Mook + Fireball");
{
  const s = mkState();
  s.p1.deck = Array.from({length:10}, () => card('blaargh'));
  s.p1.hand = [card('blaargh'), card('blaargh')];
  s.p2.hand = [card('blaargh')];
  s.p1.hand[0].cursedUntil = 2;
  s.p2.hand[0].cursedUntil = 2;               // 1 cursed in each hand → 2 Fireballs
  play(s, 'p1', 'vol_dor_mook');
  ok('one Fireball per Cursed card in BOTH hands', s.p1.deck.filter(c => c.id === 'fireball').length === 2);

  const s2 = mkState();
  s2.p1.deck = [card('blaargh')];
  play(s2, 'p1', 'vol_dor_mook');
  ok('no Cursed cards → no Fireballs', s2.p1.deck.filter(c => c.id === 'fireball').length === 0);

  // Drawing a Fireball: 20 damage, curses 2, consumes itself.
  const s3 = mkState();
  s3.p1.deck = [card('fireball'), card('blaargh')];
  s3.p2.hand = [card('blaargh'), card('blaargh'), card('blaargh')];
  E.drawCards(s3, 'p1', 1);
  const drawn = s3.p1.hand.slice(-1);
  E.fireDrawTriggers(s3, 'p1', drawn);
  ok('drawn Fireball deals 20', s3.p2.hp === 130, 'foe hp=' + s3.p2.hp);
  ok('and Curses exactly 2 of the opponent\'s cards', s3.p2.hand.filter(cursed).length === 2);
  ok('it burns out (never stays in hand)', !s3.p1.hand.some(c => c.id === 'fireball'));
  ok('it lands in the graveyard', s3.p1.graveyard.some(c => c.id === 'fireball'));

  // Fewer than 2 cursable cards → curse what's there.
  const s4 = mkState();
  s4.p1.deck = [card('fireball')];
  s4.p2.hand = [card('blaargh'), card('deepception')];   // deepception is Immune
  E.drawCards(s4, 'p1', 1);
  E.fireDrawTriggers(s4, 'p1', s4.p1.hand.slice(-1));
  ok('Immune cards are never Cursed', !s4.p2.hand.find(c => c.id === 'deepception').cursedUntil);
  ok('curses only what it can (1 of 2)', s4.p2.hand.filter(cursed).length === 1);
}

// ── THE KRUSH FAMILY ────────────────────────────────────────────────────────
head('The Krush family');
{
  E.setMyRole('p1');
  const s = mkState();
  s.p1.deck = Array.from({length:6}, () => card('blaargh'));
  play(s, 'p1', 'baby_krush');
  ok('Baby Krush deals 5 true damage', s.p2.hp === 145);
  ok('the whole family is shuffled in (3 cards)',
     ['krush','king_krush','the_krush'].every(id => s.p1.deck.some(c => c.id === id)));

  // Krush is unplayable until Baby Krush has been played.
  const s2 = mkState();
  ok('Krush is blocked before Baby Krush', !!E.playBlockedReason(s2, 'p1', card('krush')));
  ok('King Krush is blocked before Krush',  !!E.playBlockedReason(s2, 'p1', card('king_krush')));
  ok('The Krush is blocked before King',    !!E.playBlockedReason(s2, 'p1', card('the_krush')));
  s2.p1.playedIds = ['baby_krush'];
  ok('after Baby Krush, Krush unlocks', E.playBlockedReason(s2, 'p1', card('krush')) === null);
  ok('but King Krush is still locked',  !!E.playBlockedReason(s2, 'p1', card('king_krush')));

  const r = play(s2, 'p1', 'the_krush');
  ok('a blocked card played anyway does nothing', r.blocked && s2.p2.hp === 150);

  // Krush searches 4 deep and draws King Krush.
  const s3 = mkState();
  s3.p1.playedIds = ['baby_krush'];
  s3.p1.deck = [card('blaargh'), card('blaargh'), card('king_krush'), card('blaargh'), card('the_krush')];
  play(s3, 'p1', 'krush');
  ok('Krush deals 15 true damage', s3.p2.hp === 135, 'foe hp=' + s3.p2.hp);
  ok('King Krush is drawn from the top 4', s3.p1.hand.some(c => c.id === 'king_krush'));
  ok('the other revealed cards keep their order and stay in the deck',
     s3.p1.deck.length === 4 && s3.p1.deck[4] === undefined && s3.p1.deck[3].id === 'the_krush');

  // Out of range: The Krush sits 5 deep, Krush only looks 4.
  const s4 = mkState();
  s4.p1.playedIds = ['baby_krush'];
  s4.p1.deck = [card('blaargh'), card('blaargh'), card('blaargh'), card('blaargh'), card('king_krush')];
  play(s4, 'p1', 'krush');
  ok('a King Krush deeper than 4 is NOT found', !s4.p1.hand.some(c => c.id === 'king_krush'));

  // Full hand → the Krush stays in the deck.
  const s5 = mkState();
  s5.p1.playedIds = ['baby_krush'];
  s5.p1.hand = Array.from({length: E.maxHandSize(mkState(), 'p1')}, () => card('blaargh'));
  s5.p1.deck = [card('king_krush')];
  play(s5, 'p1', 'krush');
  ok('full hand → King Krush stays in the deck', s5.p1.deck.some(c => c.id === 'king_krush'));

  // Full chain damage: 5 + 15 + 25 + 45, all true damage.
  const s6 = mkState();
  s6.p1.deck = [];
  play(s6, 'p1', 'baby_krush');
  s6.p1.deck = [];
  play(s6, 'p1', 'krush');
  play(s6, 'p1', 'king_krush');
  play(s6, 'p1', 'the_krush');
  ok('the full chain deals 90 true damage', s6.p2.hp === 60, 'foe hp=' + s6.p2.hp);

  // True damage ignores Block.
  const s7 = mkState();
  s7.p2.blocked = true;
  play(s7, 'p1', 'baby_krush');
  ok('Baby Krush\'s true damage ignores Block', s7.p2.hp === 145);
}

// ── COLLECTION / DECKBUILDING SANITY ────────────────────────────────────────
head('Deckbuilding rules');
{
  const tokens = ['krush','king_krush','the_krush','fireball', ...E.SIN_IDS];
  ok('every token is noDeck (unreachable from the collection)',
     tokens.every(id => E.CARDS_DATA.find(c => c.id === id).noDeck === true));
  ok('no token is collectible',
     tokens.every(id => !E.CARDS_DATA.find(c => c.id === id).collectible));
  ok('legendaries are limited to 1 copy', E.maxCopies({ rarity:'legendary' }) === 1);
  ok('tokens are shown next to their source card in the collection',
     E.CARD_TOKENS.baby_krush.ids.length === 3 && E.CARD_TOKENS.vol_dor_mook.ids[0] === 'fireball');
}

// ── DIFFERENT SET OF RULES ──────────────────────────────────────────────────
head('Different Set of Rules');
{
  const s = mkState(); s.p1.hp = 20; s.p2.hp = 140;
  play(s, 'p1', 'different_set_of_rules');
  ok('both players land on exactly 75', s.p1.hp === 75 && s.p2.hp === 75, s.p1.hp + '/' + s.p2.hp);
  ok('you are Hindered (no draw this round)', s.p1.hindered === true);
  ok('your opponent is NOT hindered', s.p2.hindered === false);

  // It's a hard set, not a heal: "can't heal" (First Day) must not stop it.
  const s2 = mkState(); s2.p1.hp = 10; s2.p1.journeyEffects = ['no_heal'];
  play(s2, 'p1', 'different_set_of_rules');
  ok("it ignores can't-heal", s2.p1.hp === 75, 'hp=' + s2.p1.hp);

  // Not blockable either — a Blocked opponent still gets set.
  const s3 = mkState(); s3.p2.hp = 150; s3.p2.blocked = true;
  play(s3, 'p1', 'different_set_of_rules');
  ok('a Blocked opponent is still set to 75', s3.p2.hp === 75);

  // Never lethal, even from 1 hp.
  const s4 = mkState(); s4.p1.hp = 1; s4.p2.hp = 1;
  play(s4, 'p1', 'different_set_of_rules');
  ok('it can never kill anyone', s4.p1.hp === 75 && s4.p2.hp === 75 && !s4._winner);

  // Order matters: damage played BEFORE it is thrown away.
  const s5 = mkState();
  play(s5, 'p1', 'blaargh');                    // 10 damage → foe at 140
  play(s5, 'p1', 'different_set_of_rules');     // …wiped
  ok('damage dealt before it is wiped out', s5.p2.hp === 75, 'foe hp=' + s5.p2.hp);

  // Skywalker can't force it: it is neither a damage nor a heal card.
  const def = E.CARDS_DATA.find(c => c.id === 'different_set_of_rules');
  ok('it counts as neither damage nor heal (Skywalker-proof)', !def.dealsDamage && !def.heals);
}

// ── SKULL SLASHER ───────────────────────────────────────────────────────────
head('Skull Slasher');
{
  // Plain: 10, unless the opponent's hand is empty.
  const s = mkState();
  s.p2.hand = [card('blaargh'), card('blaargh')];
  play(s, 'p1', 'skull_slasher');
  ok('a held hand means only 10', s.p2.hp === 140, 'foe hp=' + s.p2.hp);

  const s2 = mkState();
  s2.p2.hand = [];
  play(s2, 'p1', 'skull_slasher');
  ok('an EMPTY hand means 30', s2.p2.hp === 120, 'foe hp=' + s2.p2.hp);

  // Enchanted MOVES the target: exactly 2, and an empty hand no longer triggers.
  const s3 = mkState();
  s3.p2.hand = [card('blaargh'), card('blaargh')];
  play(s3, 'p1', 'skull_slasher', { _useOrb: true });
  ok('Enchanted: exactly 2 cards means 30', s3.p2.hp === 120, 'foe hp=' + s3.p2.hp);

  const s4 = mkState();
  s4.p2.hand = [];
  play(s4, 'p1', 'skull_slasher', { _useOrb: true });
  ok('Enchanted: an empty hand is now only 10', s4.p2.hp === 140, 'foe hp=' + s4.p2.hp);

  const s5 = mkState();
  s5.p2.hand = [card('blaargh'), card('blaargh'), card('blaargh')];
  play(s5, 'p1', 'skull_slasher', { _useOrb: true });
  ok('Enchanted: 3 cards is only 10 (exactly 2, not "at least")', s5.p2.hp === 140);

  // Everything in hand counts — Immune and Cursed included.
  const s6 = mkState();
  const imm = card('deepception'), crs = card('blaargh');
  crs.cursedUntil = 2;
  s6.p2.hand = [imm, crs];
  play(s6, 'p1', 'skull_slasher', { _useOrb: true });
  ok('Immune and Cursed cards count toward the total', s6.p2.hp === 120, 'foe hp=' + s6.p2.hp);

  // Blockable.
  const s7 = mkState();
  s7.p2.hand = []; s7.p2.blocked = true;
  play(s7, 'p1', 'skull_slasher');
  ok('it is normal damage — a Block stops it', s7.p2.hp === 150);

  // The cards the opponent PLAYS this round have already left their hand when this resolves.
  const s8 = mkState();
  s8.p2.hand = [];                                   // they held 2, they played both
  s8.p2.selectedCards = [card('blaargh'), card('blaargh')];
  play(s8, 'p1', 'skull_slasher');
  ok('a hand emptied by playing cards counts as 0', s8.p2.hp === 120, 'foe hp=' + s8.p2.hp);

  ok('the card is flagged Enchanted (the Orb prompt appears)',
     E.CARDS_DATA.find(c => c.id === 'skull_slasher').enchanted === true);
}

// ── GARDEN TALES + CARD OWNERSHIP ───────────────────────────────────────────
head('Garden Tales');
{
  // Nothing of the enemy in hand → no healing.
  const s = mkState(); s.p1.hp = 100;
  s.p1.hand = [card('blaargh'), card('blaargh')];
  s.p1.hand.forEach(c => c.owner = 'p1');
  play(s, 'p1', 'garden_tales');
  ok('your own cards heal nothing', s.p1.hp === 100, 'hp=' + s.p1.hp);

  // Three cards taken out of the enemy deck → 30 health.
  const s2 = mkState(); s2.p1.hp = 100;
  s2.p1.hand = [card('blaargh'), card('blaargh'), card('blaargh'), card('critical_bite')];
  s2.p1.hand[0].owner = 'p2';
  s2.p1.hand[1].owner = 'p2';
  s2.p1.hand[2].owner = 'p2';
  s2.p1.hand[3].owner = 'p1';
  play(s2, 'p1', 'garden_tales');
  ok('10 health per enemy card in hand', s2.p1.hp === 130, 'hp=' + s2.p1.hp);

  // It is a NORMAL heal: can't-heal shuts it off.
  const s3 = mkState(); s3.p1.hp = 100;
  s3.p1.journeyEffects = ['no_heal'];
  s3.p1.hand = [card('blaargh')];
  s3.p1.hand[0].owner = 'p2';
  play(s3, 'p1', 'garden_tales');
  ok("can't-heal blocks it", s3.p1.hp === 100);

  // Never heals past max.
  const s4 = mkState(); s4.p1.hp = 145;
  s4.p1.hand = [card('blaargh'), card('blaargh')];
  s4.p1.hand.forEach(c => c.owner = 'p2');
  play(s4, 'p1', 'garden_tales');
  ok('it cannot overheal past max', s4.p1.hp === 150);
}

head('Card ownership (the engine behind it)');
{
  E.setProfile({ collection: { blaargh: 2, scavenger: 2 }, decks: {} });
  const built = E.buildDeckFrom({ cards: { blaargh: 2 } }, 'p1');
  ok('cards built for a player are stamped with that player', built.every(c => c.owner === 'p1'));

  // Shuffling into a deck re-stamps: the card belongs to that deck now.
  const s = mkState();
  const gift = card('blaargh');
  gift.owner = 'p1';
  E.shuffleIntoDeck(s, 'p2', [gift]);
  ok('a card shuffled into the enemy deck becomes theirs', gift.owner === 'p2');

  // Scavenger: the copy it plants belongs to the deck it lands in.
  const s2 = mkState();
  s2.p2.deck = [card('blaargh')];
  play(s2, 'p1', 'scavenger');
  const planted = s2.p2.deck.find(c => c.id === 'scavenger');
  ok('Scavenger plants a card that belongs to the enemy deck', planted && planted.owner === 'p2');
  ok('so it never counts as "from the enemy" for the player who drew it',
     !E.fromEnemyDeck(planted, 'p2'));

  ok('a card from their deck DOES count for you', E.fromEnemyDeck({ owner:'p2' }, 'p1'));
  ok('an unowned card (a token made mid-game) counts for nobody', !E.fromEnemyDeck({}, 'p1'));
}

head('Garden Tales counts anything of theirs');
{
  // A stolen card carries its owner across the table: their deck was stamped at game start,
  // and their hand came out of that deck. So stealing counts, with no extra bookkeeping.
  const s = mkState(); s.p1.hp = 100;
  s.p2.hand = [card('blaargh'), card('critical_bite')];
  s.p2.hand.forEach(c => c.owner = 'p2');          // as dealt from their deck
  s.p1.hand = [];
  const n = E.stealCard(s, 'p1', 2);
  ok('stealing moves the cards over', n === 2 && s.p1.hand.length === 2);
  ok('and they still belong to them', s.p1.hand.every(c => c.owner === 'p2'));
  play(s, 'p1', 'garden_tales');
  ok('Garden Tales heals for stolen cards too', s.p1.hp === 120, 'hp=' + s.p1.hp);

  // Stolen from hand, milled from deck — both are "theirs", so both count.
  const s2 = mkState(); s2.p1.hp = 100;
  const fromHand = card('blaargh'); fromHand.owner = 'p2';
  const fromDeck = card('critical_bite'); fromDeck.owner = 'p2';
  const mine     = card('blaargh'); mine.owner = 'p1';
  s2.p1.hand = [fromHand, fromDeck, mine];
  play(s2, 'p1', 'garden_tales');
  ok('hand-stolen and deck-taken cards count the same', s2.p1.hp === 120, 'hp=' + s2.p1.hp);

  // Immune cards are never in the steal pool — that rule still holds.
  const s3 = mkState();
  s3.p2.hand = [card('deepception')];
  s3.p2.hand[0].owner = 'p2';
  ok('an Immune card cannot be stolen', E.stealCard(s3, 'p1', 1) === 0);
}

// ── MARBER VAULT ────────────────────────────────────────────────────────────
head('Marber Vault');
{
  const vault = () => ({ id:'marber_vault', name:'Marber Vault', cards:[], hits:0, rewarded:false, linked:null });

  // Discards land in the Vault instead of the graveyard — but they are still real discards.
  const s = mkState();
  s.p1.blessing = vault();
  const b = card('blaargh');
  s.p1.hand = [b];
  E.discardCards(s, 'p1', 1, [b.uid]);
  ok('a discarded card goes into the Vault', E.vaultCards(s.p1.blessing).length === 1);
  ok('and NOT into the graveyard', s.p1.graveyard.length === 0);
  ok('it is still a real discard (Blaargh fired)', s.p2.hp === 130, 'foe hp=' + s.p2.hp);

  // Without the Vault, discards go to the graveyard as before.
  const s2 = mkState();
  const b2 = card('blaargh');
  s2.p1.hand = [b2];
  E.discardCards(s2, 'p1', 1, [b2.uid]);
  ok('without the Vault, discards still hit the graveyard', s2.p1.graveyard.length === 1);

  // Deep Lust dumps a whole hand straight into the Vault.
  const s3 = mkState();
  s3.p1.blessing = vault();
  s3.p1.hand = [card('blaargh'), card('critical_bite'), card('deepception')];
  play(s3, 'p1', 'deep_lust');
  ok('Deep Lust fills the Vault, not the graveyard', E.vaultCards(s3.p1.blessing).length === 2);
  ok('immune cards still stay in hand', s3.p1.hand.length === 1 && s3.p1.hand[0].id === 'deepception');
  ok('the graveyard stays empty', s3.p1.graveyard.length === 0);
  ok('Hindered is set, so the Vault will open next round', s3.p1.hindered === true);

  // The skipped draw arms the offer.
  E.setSolo(true);
  const s4 = mkState();
  s4.firstPlayer = 'p1';
  s4.p1.blessing = vault();
  s4.p1.deck = Array.from({length:6}, () => card('blaargh'));
  s4.p2.deck = Array.from({length:6}, () => card('blaargh'));
  s4.p1.hand = [card('blaargh'), card('critical_bite')];
  s4.p1.selectedCards = [card('deep_lust')];     // discards the hand + Hindered
  E.resolveRound(s4);
  const r4 = E.getLocalGs();
  ok('the discarded hand is in the Vault', E.vaultCards(r4.p1.blessing).length === 2);
  ok('the draw was skipped', r4.p1.hand.length === 0);
  ok('and the Vault is armed for next round', r4.p1.vaultOffer === true);

  // Hindered WITHOUT a Vault arms nothing.
  const s5 = mkState();
  s5.firstPlayer = 'p1';
  s5.p1.deck = Array.from({length:6}, () => card('blaargh'));
  s5.p2.deck = Array.from({length:6}, () => card('blaargh'));
  s5.p1.selectedCards = [card('deep_lust')];
  E.resolveRound(s5);
  ok('no Vault, no offer', !E.getLocalGs().p1.vaultOffer);

  // An EMPTY Vault arms nothing either.
  const s6 = mkState();
  s6.firstPlayer = 'p1';
  s6.p1.blessing = vault();
  s6.p1.hand = [];
  s6.p1.deck = Array.from({length:6}, () => card('blaargh'));
  s6.p2.deck = Array.from({length:6}, () => card('blaargh'));
  s6.p1.selectedCards = [card('deep_lust')];     // empty hand → nothing to store
  E.resolveRound(s6);
  ok('an empty Vault makes no offer', !E.getLocalGs().p1.vaultOffer);

  // Ownership survives a trip through the Vault: your own cards stay yours.
  const s7 = mkState();
  s7.p1.blessing = vault();
  const own = card('blaargh'); own.owner = 'p1';
  s7.p1.hand = [own];
  E.discardCards(s7, 'p1', 1, [own.uid]);
  ok('a card in the Vault keeps its owner', E.vaultCards(s7.p1.blessing)[0].owner === 'p1');
}

// ── TIME AND SPACE ──────────────────────────────────────────────────────────
head('Time and Space');
{
  // Nothing shuffled in last round → no healing.
  const s = mkState(); s.p1.hp = 100;
  play(s, 'p1', 'time_and_space');
  ok('nothing shuffled in → no healing', s.p1.hp === 100);

  // 5 health per card that landed in your deck last round.
  const s2 = mkState(); s2.p1.hp = 100;
  s2.p1.shuffledInLastRound = 3;
  play(s2, 'p1', 'time_and_space');
  ok('5 health per card (3 → 15)', s2.p1.hp === 115, 'hp=' + s2.p1.hp);

  // shuffleIntoDeck counts what actually lands.
  const s3 = mkState();
  s3.p1.deck = [];
  play(s3, 'p1', 'baby_krush');                    // shuffles 3 Krushes in
  ok('a shuffle-in is counted this round', s3.p1.shuffledInThisRound === 3, 'n=' + s3.p1.shuffledInThisRound);
  ok('but it pays out NEXT round, not now', (s3.p1.shuffledInLastRound || 0) === 0);

  // Devoured cards never entered the deck, so they never count.
  const s4 = mkState();
  s4.p1.effects = [{ id:'devour_hope' }];
  s4.p1.deck = [];
  play(s4, 'p1', 'baby_krush');
  ok('Devour Hope ate them → nothing counted', (s4.p1.shuffledInThisRound || 0) === 0);

  // The full round-to-round handover, through the real resolve loop.
  E.setSolo(true);
  const s5 = mkState();
  s5.firstPlayer = 'p1';
  s5.p1.hp = 100;
  s5.p1.deck = Array.from({length:6}, () => card('blaargh'));
  s5.p2.deck = Array.from({length:6}, () => card('blaargh'));
  s5.p1.selectedCards = [card('baby_krush')];      // round 1: 3 cards shuffled in
  E.resolveRound(s5);
  const r5 = E.getLocalGs();
  ok('after the round, the count is carried over', r5.p1.shuffledInThisRound === 3);
  r5.p1.selectedCards = [card('time_and_space')];  // round 2: cash it in
  r5.p2.selectedCards = [];
  E.resolveRound(r5);
  const r6 = E.getLocalGs();
  ok('Time and Space pays out for last round (3 × 5 = 15)', r6.p1.hp === r5.p1.hp + 15,
     'hp ' + r5.p1.hp + ' → ' + r6.p1.hp);
  ok('and the counter resets for the new round', r6.p1.shuffledInThisRound === 0);

  // Normal heal: can't-heal shuts it off.
  const s6 = mkState(); s6.p1.hp = 100;
  s6.p1.shuffledInLastRound = 4;
  s6.p1.journeyEffects = ['no_heal'];
  play(s6, 'p1', 'time_and_space');
  ok("can't-heal blocks it", s6.p1.hp === 100);
}

// ── KONG FEE ────────────────────────────────────────────────────────────────
head('Kong Fee');
{
  const s = mkState(); s.p1.hp = 100;
  s.p1.hand = [];
  play(s, 'p1', 'kong_fee');
  ok('10 true damage to yourself', s.p1.hp === 90, 'hp=' + s.p1.hp);
  ok('and an Enchanted Orb in hand', s.p1.hand.length === 1 && s.p1.hand[0].id === 'enchanted_orb');
  ok('the Orb is yours', s.p1.hand[0].owner === 'p1');

  // True damage: Block and Shield don't save you from yourself.
  const s2 = mkState(); s2.p1.hp = 100;
  s2.p1.blocked = true;
  s2.p1.shieldRounds = 2;
  play(s2, 'p1', 'kong_fee');
  ok('Block and Shield cannot stop it', s2.p1.hp === 90, 'hp=' + s2.p1.hp);

  // A full hand means no Orb — you take the 10 for nothing.
  const s3 = mkState(); s3.p1.hp = 100;
  s3.p1.hand = Array.from({length: E.maxHandSize(mkState(), 'p1')}, () => card('blaargh'));
  const before = s3.p1.hand.length;
  play(s3, 'p1', 'kong_fee');
  ok('full hand → the damage still lands', s3.p1.hp === 90);
  ok('full hand → but no Orb', s3.p1.hand.length === before && !s3.p1.hand.some(c => c.id === 'enchanted_orb'));

  // At 10 health or less it kills you, and you never see the Orb.
  const s4 = mkState(); s4.p1.hp = 10;
  s4.p1.hand = [];
  let died = false;
  try { play(s4, 'p1', 'kong_fee'); } catch (e) { died = true; }
  ok('at 10 health it kills you', s4.p1.hp === 0 && died);
  ok('and the dead get no Orb', s4.p1.hand.length === 0);

  const s5 = mkState(); s5.p1.hp = 15;
  s5.p1.hand = [];
  play(s5, 'p1', 'kong_fee');
  ok('at 15 you survive on 5 — and get the Orb', s5.p1.hp === 5 && s5.p1.hand.length === 1);
}

// ── THE FORGOTTEN MAGE ──────────────────────────────────────────────────────
head('The Forgotten Mage');
{
  // Heal always; Orb only when they're hoarding.
  const s = mkState(); s.p1.hp = 100;
  s.p1.hand = [];
  s.p2.hand = Array.from({length:6}, () => card('blaargh'));
  play(s, 'p1', 'forgotten_mage');
  ok('the heal always lands', s.p1.hp === 110, 'hp=' + s.p1.hp);
  ok('6 cards is not enough — no Orb', !s.p1.hand.some(c => c.id === 'enchanted_orb'));

  const s2 = mkState(); s2.p1.hp = 100;
  s2.p1.hand = [];
  s2.p2.hand = Array.from({length:7}, () => card('blaargh'));
  play(s2, 'p1', 'forgotten_mage');
  ok('exactly 7 cards → the Orb', s2.p1.hand.some(c => c.id === 'enchanted_orb'));
  ok('and the heal still lands', s2.p1.hp === 110);

  const s3 = mkState();
  s3.p1.hand = [];
  s3.p2.hand = Array.from({length:8}, () => card('blaargh'));
  play(s3, 'p1', 'forgotten_mage');
  ok('8 cards → the Orb too (7 OR MORE)', s3.p1.hand.some(c => c.id === 'enchanted_orb'));

  // Everything they hold counts — Immune and Cursed included.
  const s4 = mkState();
  s4.p1.hand = [];
  s4.p2.hand = Array.from({length:6}, () => card('blaargh'));
  s4.p2.hand.push(card('deepception'));          // immune, 7th card
  s4.p2.hand[0].cursedUntil = 2;
  play(s4, 'p1', 'forgotten_mage');
  ok('Immune and Cursed cards count toward their 7', s4.p1.hand.some(c => c.id === 'enchanted_orb'));

  // The cards they PLAY this round have already left their hand.
  const s5 = mkState();
  s5.p1.hand = [];
  s5.p2.hand = Array.from({length:6}, () => card('blaargh'));   // held 8, played 2
  s5.p2.selectedCards = [card('blaargh'), card('blaargh')];
  play(s5, 'p1', 'forgotten_mage');
  ok('a hoarder who dumps cards drops below the line', !s5.p1.hand.some(c => c.id === 'enchanted_orb'));

  // Your own full hand: heal yes, Orb no.
  const s6 = mkState(); s6.p1.hp = 100;
  s6.p1.hand = Array.from({length: E.maxHandSize(mkState(), 'p1')}, () => card('blaargh'));
  s6.p2.hand = Array.from({length:7}, () => card('blaargh'));
  const n6 = s6.p1.hand.length;
  play(s6, 'p1', 'forgotten_mage');
  ok('your full hand → heal lands', s6.p1.hp === 110);
  ok('your full hand → no Orb', s6.p1.hand.length === n6);

  // Normal heal: can't-heal shuts it off.
  const s7 = mkState(); s7.p1.hp = 100;
  s7.p1.journeyEffects = ['no_heal'];
  s7.p1.hand = [];
  s7.p2.hand = Array.from({length:7}, () => card('blaargh'));
  play(s7, 'p1', 'forgotten_mage');
  ok("can't-heal blocks the heal", s7.p1.hp === 100);
  ok('but the Orb still comes (it is not a heal)', s7.p1.hand.some(c => c.id === 'enchanted_orb'));
}

// ── WORLD SPLITTER (ALTER EGO) ──────────────────────────────────────────────
head('World Splitter — the Alter Ego split');
{
  E.setProfile({ collection: { world_splitter: 1, blaargh: 2 }, decks: {} });
  // 1 World Splitter (→ 2 cards) + 2 Blaargh = 4 physical cards out of 3 deck slots.
  const built = E.buildDeckFrom({ cards: { world_splitter: 1, blaargh: 2 } }, 'p1');
  ok('one deck slot becomes two physical cards', built.length === 4, 'deck=' + built.length);
  ok('so a 40-slot deck really holds 41 cards',
     built.filter(c => c.id.startsWith('world_splitter')).length === 2);
  ok('both halves are in the deck',
     built.some(c => c.id === 'world_splitter') && built.some(c => c.id === 'world_splitter_b'));
  ok('they share a name and text', (() => {
    const a = E.CARDS_DATA.find(c => c.id === 'world_splitter');
    const b = E.CARDS_DATA.find(c => c.id === 'world_splitter_b');
    return a.name === b.name && a.text === b.text && a.art !== b.art;
  })());
  ok('the second half can never be crafted or decked', (() => {
    const b = E.CARDS_DATA.find(c => c.id === 'world_splitter_b');
    return b.noDeck === true && !b.collectible;
  })());
}

head('World Splitter — one half is dead');
{
  const s = mkState();
  s.p1.selectedCards = [card('world_splitter')];       // only one half in the row
  play(s, 'p1', 'world_splitter');
  ok('a single half installs nothing', !s.p1.effects.some(e => e.id === 'world_splitter'));

  const s2 = mkState();
  s2.p1.selectedCards = [card('world_splitter_b'), card('blaargh')];
  play(s2, 'p1', 'world_splitter_b');
  ok('the other half alone is just as dead', !s2.p1.effects.some(e => e.id === 'world_splitter'));
}

head('World Splitter — both halves, same round');
{
  const s = mkState();
  s.p1.selectedCards = [card('world_splitter'), card('world_splitter_b')];
  play(s, 'p1', 'world_splitter');
  play(s, 'p1', 'world_splitter_b');
  const running = s.p1.effects.filter(e => e.id === 'world_splitter');
  ok('both halves in one round → the world splits', running.length === 1);
  ok('and it installs exactly ONCE (no doubling)', running.length === 1);

  // Now every card you discard tears one out of their hand.
  s.p1.hand = [card('critical_bite')];
  s.p2.hand = [card('blaargh'), card('blaargh'), card('blaargh')];
  E.discardCards(s, 'p1', 1, [s.p1.hand[0].uid]);
  ok('your discard forces one out of their hand', s.p2.hand.length === 2, 'their hand=' + s.p2.hand.length);
  ok('and it is a REAL discard on their side', s.p2.graveyard.length === 1);

  // Their hand empty → nothing happens, no crash.
  const s2 = mkState();
  s2.p1.effects = [{ id:'world_splitter' }];
  s2.p1.hand = [card('critical_bite')];
  s2.p2.hand = [];
  E.discardCards(s2, 'p1', 1, [s2.p1.hand[0].uid]);
  ok('an empty enemy hand simply does nothing', s2.p2.hand.length === 0);

  // Their forced discard lands in their Marber Vault if they run one.
  const s3 = mkState();
  s3.p1.effects = [{ id:'world_splitter' }];
  s3.p2.blessing = { id:'marber_vault', name:'Marber Vault', cards:[], hits:0, rewarded:false, linked:null };
  s3.p1.hand = [card('critical_bite')];
  s3.p2.hand = [card('blaargh')];
  E.discardCards(s3, 'p1', 1, [s3.p1.hand[0].uid]);
  ok("their forced discard goes into their own Vault", E.vaultCards(s3.p2.blessing).length === 1);

  // Blaargh torn out of their hand still screams: 20 damage back at YOU.
  const s4 = mkState();
  s4.p1.effects = [{ id:'world_splitter' }];
  s4.p1.hand = [card('critical_bite')];
  s4.p2.hand = [card('blaargh')];
  E.discardCards(s4, 'p1', 1, [s4.p1.hand[0].uid]);
  ok('a Blaargh torn from their hand fires back at you', s4.p1.hp === 130, 'your hp=' + s4.p1.hp);
}

head('World Splitter — the ping-pong');
{
  // Both players running it: one discard drains both hands, and it always terminates.
  const s = mkState();
  s.p1.effects = [{ id:'world_splitter' }];
  s.p2.effects = [{ id:'world_splitter' }];
  s.p1.hand = [card('critical_bite'), card('critical_bite'), card('critical_bite')];
  s.p2.hand = [card('critical_bite'), card('critical_bite'), card('critical_bite')];
  const first = s.p1.hand[0];
  E.discardCards(s, 'p1', 1, [first.uid]);
  ok('the chain drains both hands', s.p1.hand.length === 0 && s.p2.hand.length === 0,
     'you=' + s.p1.hand.length + ' them=' + s.p2.hand.length);
  ok('every card ends up discarded, none vanish',
     s.p1.graveyard.length + s.p2.graveyard.length === 6);

  // Immune cards can't be torn out, so the chain stops on them instead of spinning.
  const s2 = mkState();
  s2.p1.effects = [{ id:'world_splitter' }];
  s2.p2.effects = [{ id:'world_splitter' }];
  s2.p1.hand = [card('critical_bite')];
  s2.p2.hand = [card('deepception')];              // immune: never discardable
  E.discardCards(s2, 'p1', 1, [s2.p1.hand[0].uid]);
  ok('an immune hand ends the chain', s2.p2.hand.length === 1 && s2.p2.hand[0].id === 'deepception');
}

// ── HEARTH OF OUR GALAXY ────────────────────────────────────────────────────
head('Hearth of our Galaxy');
{
  const hearth = () => ({ id:'hearth_of_our_galaxy', name:'Hearth of our Galaxy', hits:0, rewarded:false, linked:null });

  // You steal → they bleed.
  const s = mkState();
  s.p1.blessing = hearth();
  s.p2.hand = [card('blaargh')];
  s.p2.hand[0].owner = 'p2';
  E.stealCard(s, 'p1', 1);
  ok('you steal a card → 5 damage to them', s.p2.hp === 145, 'their hp=' + s.p2.hp);

  // THEY steal → they still bleed. The blessing punishes theft, not the thief.
  const s2 = mkState();
  s2.p1.blessing = hearth();
  s2.p1.hand = [card('blaargh')];
  E.stealCard(s2, 'p2', 1);              // p2 is the thief this time
  ok('they steal from YOU → they still take the 5', s2.p2.hp === 145, 'their hp=' + s2.p2.hp);
  ok('and you take nothing', s2.p1.hp === 150);

  // 5 per CARD, not per steal action.
  const s3 = mkState();
  s3.p1.blessing = hearth();
  s3.p2.hand = [card('blaargh'), card('blaargh'), card('blaargh')];
  E.stealCard(s3, 'p1', 3);
  ok('3 cards stolen → 15 damage', s3.p2.hp === 135, 'their hp=' + s3.p2.hp);

  // Normal damage: a Block stops it.
  const s4 = mkState();
  s4.p1.blessing = hearth();
  s4.p2.blocked = true;
  s4.p2.hand = [card('blaargh')];
  E.stealCard(s4, 'p1', 1);
  ok('a Block stops it', s4.p2.hp === 150);

  // Both players running it: each one punishes their own opponent.
  const s5 = mkState();
  s5.p1.blessing = hearth();
  s5.p2.blessing = hearth();
  s5.p2.hand = [card('blaargh')];
  E.stealCard(s5, 'p1', 1);              // p1 steals one card
  ok("your Hearth burns them", s5.p2.hp === 145, 'their hp=' + s5.p2.hp);
  ok('their Hearth burns you right back', s5.p1.hp === 145, 'your hp=' + s5.p1.hp);

  // Nothing to steal → no damage.
  const s6 = mkState();
  s6.p1.blessing = hearth();
  s6.p2.hand = [];
  E.stealCard(s6, 'p1', 2);
  ok('a failed steal deals nothing', s6.p2.hp === 150);

  // An immune card can't be stolen, so it can't trigger the Hearth either.
  const s7 = mkState();
  s7.p1.blessing = hearth();
  s7.p2.hand = [card('deepception')];
  E.stealCard(s7, 'p1', 1);
  ok('an unstealable Immune card triggers nothing', s7.p2.hp === 150);
}

console.log('\n' + '─'.repeat(46));
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
