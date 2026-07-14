#!/bin/bash
# Validate index.html before it ever leaves this machine.
#
# It used to check only the JavaScript — which is exactly how a build with 311 duplicated
# lines of HTML sailed through: the JS was fine, the document was not. Every id existed
# twice, the JS bound to one copy and the browser rendered the other, and the page came
# apart. So: the module AND the document, every time.
set -e
cd /home/claude

# ── 1. The module must parse as a real ES module ──────────────────────────────
# It has to be checked as .mjs. `node --check` on a .js file parses it as CommonJS and
# silently accepts things a module rejects — that false OK let a broken build through for
# several rounds of edits.
python3 -c "
import re
html = open('index.html').read()
m = re.search(r'<script type=\"module\">(.*?)</script>', html, flags=re.S)
open('mod.mjs','w').write(m.group(1))
"
node --check mod.mjs
echo "✓ module parses"

# ── 2. The document must be structurally sound ────────────────────────────────
python3 - <<'PY'
import re, sys
html = open('index.html').read()
fail = []

# Duplicate ids: the exact failure that broke the collection screen.
ids = re.findall(r'\bid="([^"]+)"', html)
dupes = sorted({i for i in ids if ids.count(i) > 1})
if dupes:
    fail.append('duplicate ids: ' + ', '.join(dupes))

# Unbalanced divs mean a chunk was cut or pasted wrong.
body = html[html.index('<body'):html.index('<script type="module">')]
o, c = len(re.findall(r'<div\b', body)), len(re.findall(r'</div>', body))
if o != c:
    fail.append('div tags unbalanced: %d open vs %d close' % (o, c))

# Every screen and every overlay exactly once.
for el in ['screen-lobby','screen-collection','screen-game',
           'ov-peek','ov-result','ov-discard','ov-grave','ov-deckpick','ov-vault','ov-linkpick']:
    n = html.count('id="'+el+'"')
    if n != 1:
        fail.append('%s appears %dx (must be exactly 1)' % (el, n))

# The elements the JS reaches for must actually be there. If a refactor deletes one, the
# game breaks at runtime with a null — this catches it here instead.
for el in ['col-grid','deck-list','deck-cards','deck-name','hand','arena-opp','arena-you','action-info',
           'card-preview','build-stamp']:
    if html.count('id="'+el+'"') != 1:
        fail.append('missing or duplicated element: ' + el)

if fail:
    print('\n✗ DOCUMENT BROKEN')
    for f in fail:
        print('   -', f)
    sys.exit(1)
print('✓ document sound (%d ids, all unique, %d divs balanced)' % (len(ids), o))
PY

# ── 3. The game must still behave ─────────────────────────────────────────────
node test.mjs  > /tmp/t1.log 2>&1 || { cat /tmp/t1.log; exit 1; }
node test2.mjs > /tmp/t2.log 2>&1 || { cat /tmp/t2.log; exit 1; }
echo "✓ $(grep -o '[0-9]* passed' /tmp/t1.log) + $(grep -o '[0-9]* passed' /tmp/t2.log)"
