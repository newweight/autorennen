#!/usr/bin/env python3
"""Wandelt die Swift-Datenlisten (Akademie, Eroeffnungsbuch, Wissensbasis) 1:1 in JavaScript-Module um.
Aufruf:  python3 swift_daten_konverter.py <SchachSpiel.swift> <Zielordner kern/>
Die Texte werden woertlich uebernommen (keine Umformulierung). Es gibt keine Backslash-Escapes in den Swift-Daten."""
import sys, re, json

src = open(sys.argv[1], encoding='utf-8').read()
out = sys.argv[2]

def parse_call_args(s, i):
    """s[i] == '(' -> liest label:value-Paare bis zur passenden ')'. Gibt (dict, index nach ')')."""
    assert s[i] == '('
    i += 1
    res = {}
    n = len(s)
    while True:
        while s[i] in ' \n\t,': i += 1
        if s[i] == ')': return res, i + 1
        m = re.match(r'([A-Za-z_]+)\s*:\s*', s[i:])
        label = m.group(1); i += m.end()
        val, i = parse_value(s, i)
        res[label] = val

def parse_value(s, i):
    c = s[i]
    if c == '"':
        j = i + 1; buf = []
        while s[j] != '"':
            if s[j] == '\\': raise ValueError('Backslash in Swift-String bei %d' % j)
            buf.append(s[j]); j += 1
        return ''.join(buf), j + 1
    if c == '[':
        j = i + 1; arr = []
        while True:
            while s[j] in ' \n\t,': j += 1
            if s[j] == ']': return arr, j + 1
            v, j = parse_value(s, j); arr.append(v)
    m = re.match(r'-?\d+', s[i:])
    if m: return int(m.group(0)), i + m.end()
    if s.startswith('true', i): return True, i + 4
    if s.startswith('false', i): return False, i + 5
    raise ValueError('unbekannter Wert bei %d: %r' % (i, s[i:i+30]))

def find_all(name):
    items = []
    for m in re.finditer(r'\b' + name + r'\(', src):
        # nur Aufrufe mit label (keine Deklaration "struct X {")
        if not re.match(r'\(\s*[a-z]+\s*:', src[m.end() - 1:m.end() + 20]): continue
        d, _ = parse_call_args(src, m.end() - 1)
        items.append(d)
    return items

def js(v):
    return json.dumps(v, ensure_ascii=False, indent=None)

def fmt_list(items, keyorder):
    lines = []
    for d in items:
        parts = []
        for k in keyorder:
            if k in d: parts.append('%s: %s' % (k, js(d[k])))
        lines.append('    {' + ', '.join(parts) + '}')
    return '[\n' + ',\n'.join(lines) + '\n  ]'

HEAD = '''/* GENERIERT von _werkzeug/swift_daten_konverter.py aus SchachSpiel.swift (Texte woertlich uebernommen). Nicht von Hand aendern. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';
  K.Daten = K.Daten || {};
'''
TAIL = '});\n'

# ---- Akademie ----
lessons = find_all('ChessLesson')
for l in lessons:
    l.setdefault('freePlayMoves', 0); l.setdefault('freePlayAI', 3); l.setdefault('winByMate', False)
    assert 'id' in l and 'fen' in l
# levelInfo
li = re.search(r'static let levelInfo: \[\(name: String, subtitle: String\)\] = \[(.*?)\n    \]', src, re.S).group(1)
levels = re.findall(r'\("([^"]*)",\s*"([^"]*)"\)', li)
unlock = float(re.search(r'static let unlockQuote = ([0-9.]+)', src).group(1))
open(out + '/daten_akademie.js', 'w', encoding='utf-8').write(
    HEAD +
    '  K.Daten.levelInfo = [\n' + ',\n'.join('    {name: %s, subtitle: %s}' % (js(a), js(b)) for a, b in levels) + '\n  ];\n' +
    '  K.Daten.unlockQuote = %s;\n' % unlock +
    '  K.Daten.lessons = ' + fmt_list(lessons, ['id','level','title','teach','fen','prompt','solutions','hint','successText','failText','freePlayMoves','freePlayAI','winByMate']) + ';\n' + TAIL)

# ---- Eroeffnungsbuch ----
op = find_all('OpeningEntry')
open(out + '/daten_buch.js', 'w', encoding='utf-8').write(
    HEAD + '  K.Daten.openingEntries = ' + fmt_list(op, ['eco','name','moves','explanation','bookSource']) + ';\n' + TAIL)

# ---- Wissensbasis ----
bc = find_all('BookConcept'); fg = find_all('FamousGameRef')
open(out + '/daten_wissen.js', 'w', encoding='utf-8').write(
    HEAD + '  K.Daten.bookConcepts = ' + fmt_list(bc, ['book','author','category','concept','explanation']) + ';\n' +
    '  K.Daten.famousGames = ' + fmt_list(fg, ['name','white','black','year','eco','opening','keyLesson']) + ';\n' + TAIL)

print('Aufgaben', len(lessons), 'Stufen', len(levels), 'Buch', len(op), 'Konzepte', len(bc), 'Partien', len(fg))
