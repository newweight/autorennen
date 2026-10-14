// ============================================================
// Gemeinsame Konstanten der Brettspiele (4 gewinnt, Schach) – Browser UND Server (UMD).
// ZENTRAL: alle Farben und Texte, damit man sie später leicht an die Original-Swift-Apps angleichen kann.
//   Browser: window.BRETT.K      Server/Tests: require('.../konstanten.js')
// FARBEN werden von rahmen.js als CSS-Variablen (--c-<name>) gesetzt.
// ============================================================
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f();
  else { root.BRETT = root.BRETT || {}; root.BRETT.K = f(); }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    VERSION: 1,
    PFAD: '/ws-brett',                       // WebSocket-Pfad auf dem Spiel-Server
    SPIELE: ['vier', 'schach'],
    CODE_ZEICHEN: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',   // ohne 0/O/1/I (wie beim Autorennen)
    CODE_LAENGE: 4,
    RAUM_MINUTEN: 10,                        // Raum bleibt so lange, wenn alle weg sind (Wiederverbinden)
    MAX_RAEUME: 40,
    MAX_ZUSCHAUER: 8,

    // Spielernamen: nur aus dieser Liste (kein Freitext – Kinder-Sicherheit wie beim Autorennen)
    NAMEN: [
      { id: 'fuchs', emoji: '🦊', text: 'Fuchs' }, { id: 'baer', emoji: '🐻', text: 'Bär' }, { id: 'hase', emoji: '🐰', text: 'Hase' },
      { id: 'loewe', emoji: '🦁', text: 'Löwe' }, { id: 'pinguin', emoji: '🐧', text: 'Pinguin' }, { id: 'delfin', emoji: '🐬', text: 'Delfin' },
      { id: 'eule', emoji: '🦉', text: 'Eule' }, { id: 'igel', emoji: '🦔', text: 'Igel' }, { id: 'tiger', emoji: '🐯', text: 'Tiger' },
      { id: 'panda', emoji: '🐼', text: 'Panda' }, { id: 'frosch', emoji: '🐸', text: 'Frosch' }, { id: 'drache', emoji: '🐲', text: 'Drache' },
    ],

    // Farben (CSS-Variablen --c-…)
    FARBEN: {
      hintergrund1: '#18224d', hintergrund2: '#0c1230', text: '#ffffff', gelb: '#ffd23f', gruen: '#3ccf6e', rot: '#e63946',
      knopf: '#2f6bff', knopfText: '#ffffff', karte: 'rgba(255,255,255,.1)',
      vierBrett: '#1d4ed8', vierBrettRand: '#143ba8', vierRot: '#e63946', vierGelb: '#ffd23f', vierGewinn: '#ffffff',
      schachHell: '#f0d9b5', schachDunkel: '#b58863', schachAuswahl: '#7ccf5a', schachZug: 'rgba(30,120,40,.55)',
      schachLetzter: 'rgba(255,220,60,.55)', schachSchach: '#ff4d4d', schachWeiss: '#ffffff', schachSchwarz: '#2a2a35',
      schachWeissRand: '#3a2a1a', schachSchwarzRand: '#f2e6d0',
    },

    // Texte (Deutsch, kindgerecht)
    TEXTE: {
      vier: { titel: '4 gewinnt', emoji: '🔴', untertitel: 'Vier in einer Reihe gewinnt!', rot: 'Rot', gelb: 'Gelb',
        regeln: 'Wirf abwechselnd einen Stein ein. Wer zuerst vier in einer Reihe hat – waagrecht, senkrecht oder schräg – gewinnt!' },
      schach: { titel: 'Schach', emoji: '♟️', untertitel: 'Das Spiel der Könige', weiss: 'Weiß', schwarz: 'Schwarz',
        regeln: 'Tippe eine Figur an – grüne Punkte zeigen, wohin sie ziehen darf. Fange den König des anderen (Schachmatt)!' },
      zuZweit: 'Zu zweit', zuZweitSub: 'am selben Gerät', computer: 'Gegen Computer', computerSub: 'leicht, mittel oder schwer',
      online: 'Online', onlineSub: 'mit Freunden, per Raumcode', alleSpiele: 'Alle Spiele', menue: 'Menü',
      stufen: [{ id: 1, emoji: '😊', text: 'Leicht' }, { id: 2, emoji: '🙂', text: 'Mittel' }, { id: 3, emoji: '😎', text: 'Schwer' }],
      nochmal: 'Nochmal', revanche: 'Revanche', revancheWarte: 'Warte auf den anderen …', zurueck: 'Zurück', aufgeben: 'Aufgeben', drehen: 'Brett drehen',
      amZug: 'ist dran', du: 'Du bist dran!', gegnerDran: 'Warte … die anderen sind dran', computerDenkt: 'Computer denkt …',
      unentschieden: 'Unentschieden!', gewonnen: 'gewonnen!', istSchach: 'Schach!', matt: 'Schachmatt!', patt: 'Patt – niemand kann ziehen. Unentschieden!',
      fuenfzig: 'Unentschieden (50 Züge ohne Schlagen)', wiederholung: 'Unentschieden (dreimal dieselbe Stellung)',
      material: 'Unentschieden (zu wenig Figuren zum Mattsetzen)', voll: 'Brett voll – unentschieden!',
      aufgegeben: 'hat aufgegeben', raumErstellen: 'Raum erstellen', beitreten: 'Beitreten', raumCode: 'Raumcode', warten: 'Warte auf einen Mitspieler …',
      zuschauer: 'Zuschauen', verbunden: 'Verbunden', getrennt: 'Verbindung weg … versuche es wieder', gegnerWeg: 'Der andere ist kurz weg – wir warten …',
      umwandeln: 'In was soll sich der Bauer verwandeln?', raumZu: 'Der Raum wurde geschlossen.',
    },
  };
});
