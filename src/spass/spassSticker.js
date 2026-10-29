// ============================================================
// Spaß-Paket S1 – Sticker-Album: Sticker für Erfolge (je Spiel getrennt: Autorennen / Motorrad, ~18 Stück), Emoji-Sticker.
//   R.SpassSticker.katalog(spiel)            [{ id, emoji, name, text }]  (spiel = 'auto' | 'motorrad')
//   R.SpassSticker.ereignis(spiel, name, d)  Ereignis melden → Liste NEU freigeschalteter Sticker (leer, wenn nichts neu)
//   R.SpassSticker.stand(spiel) / .hat(spiel, id) / .zurueck(spiel)
// Ereignisse: tuning { voll } (S2) · sieg · ziel { platz, streckeId, nacht, zwei } · muenzen { rennen (im Rennen gesammelt), gesamt } · trampolin · kanone · geist · hupe · stimme ·
//   sprung { sek } · S4: kurz { sterne, alle } · frei { gefunden } · freiAufgabe { geschafft, gesamt } · ko · koFinale · foto · salto · ring · bus · wheelie { m } · stoppie { m } · S5: huepfer { n } · teleport · dino · S6: magnet · gleiten · grind { m } · wand { m } · halfpipe { hoch } · riese · mini · haustier · kostuem · S3: superman · handstand · backflip (Motorrad) · fassrolle (Auto) · zeitlupe
// Speicher: localStorage 'rennspiel.spass.sticker.<spiel>' (ohne localStorage im Arbeitsspeicher). Reine Logik, ohne DOM (Node-Test).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;
  const STRECKEN = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1'];
  const GEMEINSAM = [
    { id: 'sieg', emoji: '🏆', name: 'Erster Sieg', text: 'Du hast ein Rennen gewonnen!' },
    { id: 'podium', emoji: '🥉', name: 'Aufs Treppchen', text: 'Platz 1, 2 oder 3 geschafft.' },
    { id: 'ziel', emoji: '🏁', name: 'Im Ziel', text: 'Dein erstes Rennen zu Ende gefahren.' },
    { id: 'muenzen10', emoji: '🪙', name: '10 Goldstücke', text: '10 Goldstücke in einem Rennen gesammelt.' },
    { id: 'muenzen100', emoji: '💰', name: 'Goldschatz', text: 'Insgesamt 100 Goldstücke gesammelt.' },
    { id: 'trampolin', emoji: '🤸', name: 'Trampolin-Hüpfer', text: 'Über ein Trampolin gesprungen.' },
    { id: 'trampolin10', emoji: '🎪', name: 'Zirkus-Star', text: '10 Trampolin-Sprünge.' },
    { id: 'kanone', emoji: '💥', name: 'Kanonenkugel', text: 'Aus der Kanone geschossen worden!' },
    { id: 'kanone5', emoji: '🚀', name: 'Raketenfahrer', text: '5 Kanonenschüsse.' },
    { id: 'geist', emoji: '👻', name: 'Geist geschlagen', text: 'Schneller als dein eigener Geist!' },
    { id: 'strecken', emoji: '🗺️', name: 'Weltreisender', text: 'Jede Strecke einmal zu Ende gefahren.' },
    { id: 'hupe', emoji: '📯', name: 'Hupen-Profi', text: 'Zum ersten Mal gehupt.' },
    { id: 'stimme', emoji: '🎤', name: 'Eigene Stimme', text: 'Eine Hupe oder einen Jubel aufgenommen.' },
    { id: 'nacht', emoji: '🌙', name: 'Nachtfahrer', text: 'Ein Rennen bei Nacht beendet.' },
    { id: 'zwei', emoji: '👫', name: 'Zu zweit', text: 'Ein Rennen zu zweit gefahren.' },
    { id: 'tuning1', emoji: '🔧', name: 'Erstes Tuning', text: 'Die erste Tuning-Stufe gekauft.' },
    { id: 'tuningVoll', emoji: '🏁', name: 'Voll getunt', text: 'Ein Fahrzeug in allem auf Stufe 5 getunt.' },
    { id: 'zeitlupe', emoji: '🎬', name: 'Zeitlupen-Sprung', text: 'Ein so großer Sprung, dass die Zeitlupe kam!' },
    // S4: neue Modi
    { id: 'kurz1', emoji: '⭐', name: 'Level-Starter', text: 'Das erste Kurz-Level geschafft.' },
    { id: 'kurz3', emoji: '🌟', name: 'Drei Sterne', text: 'Ein Kurz-Level mit 3 Sternen geschafft.' },
    { id: 'kurzAlle', emoji: '🎖️', name: 'Level-Meister', text: 'Alle 12 Kurz-Level geschafft.' },
    { id: 'frei1', emoji: '❓', name: 'Kisten-Finder', text: 'Die erste ❓-Kiste gefunden.' },
    { id: 'freiAlle', emoji: '🗺️', name: 'Schatzsucher', text: 'Alle 12 ❓-Kisten einer Strecke geschafft.' },
    { id: 'ko', emoji: '🥇', name: 'K.-o.-Sieger', text: 'Die K.-o.-Rallye gewonnen.' },
    { id: 'koFinale', emoji: '🏁', name: 'Im Finale', text: 'Bei der K.-o.-Rallye bis ins Finale gekommen.' },
    { id: 'foto', emoji: '📸', name: 'Fotograf', text: 'Das erste Foto gemacht.' },
    // S5: neue Welten
    { id: 'mond', emoji: '🌙', name: 'Mondfahrer', text: 'Ein Rennen auf dem Mond zu Ende gefahren.' },
    { id: 'mondHupf', emoji: '🦘', name: 'Mondhüpfer', text: '10 Hüpfer über Mond-Bodenwellen in einem Rennen.' },
    { id: 'tiefsee', emoji: '🐋', name: 'Tiefseetaucher', text: 'Ein Rennen im Unterwasser-Glastunnel beendet.' },
    { id: 'regenbogen', emoji: '🌈', name: 'Regenbogen-Fan', text: 'Ein Rennen im Regenbogenland beendet.' },
    { id: 'teleport', emoji: '🌀', name: 'Teleporter', text: 'Durch ein Teleport-Tor gefahren.' },
    { id: 'dinofreund', emoji: '🦖', name: 'Dino-Freund', text: 'Der Dino-Begleiter hat für dich gebrüllt.' },
    // S6: Fahr-Zauber
    { id: 'magnet', emoji: '🧲', name: 'Magnetfahrer', text: 'Kopfüber an der Decke der Magnet-Röhre gefahren.' },
    { id: 'gleiter', emoji: '🪂', name: 'Gleitflieger', text: 'Über eine Schlucht gesegelt und sicher gelandet.' },
    { id: 'grind', emoji: '🛹', name: 'Geländer-Rutscher', text: '20 Meter auf einem Geländer gegrindet.' },
    { id: 'wandfahrer', emoji: '🧱', name: 'Wandläufer', text: '15 Meter an der Wand entlanggefahren.' },
    { id: 'halfpipe', emoji: '🛝', name: 'Halfpipe-Held', text: 'In der Halfpipe über 3 Meter hoch gefahren.' },
    { id: 'riese', emoji: '🏔️', name: 'Riesen-Spaß', text: 'Acht Sekunden lang ein Riese gewesen.' },
    { id: 'mini', emoji: '🐜', name: 'Mini-Flitzer', text: 'Mini geworden und blitzschnell gefahren.' },
    { id: 'haustier', emoji: '🐶', name: 'Tierfreund', text: 'Mit einem Haustier ein Rennen gefahren.' },
    { id: 'kostuem', emoji: '🎭', name: 'Verkleidet', text: 'Ein Rennen im Kostüm gefahren.' },
  ];
  const AUTO = [
    { id: 'sprung', emoji: '✈️', name: 'Weitspringer', text: 'Länger als 1,5 Sekunden in der Luft.' },
    { id: 'fassrolle', emoji: '🛢️', name: 'Erste Fassrolle', text: 'Das Auto in der Luft um die Längsachse gedreht!' },
    { id: 'sammler', emoji: '⭐', name: 'Sticker-Sammler', text: '10 Sticker gesammelt.' },
    { id: 'siege3', emoji: '🔥', name: 'Dreimal Erster', text: '3 Rennen gewonnen.' },
  ];
  const MOTO = [
    { id: 'superman', emoji: '🦸', name: 'Superman', text: 'Der Fahrer fliegt gestreckt über dem Motorrad!' },
    { id: 'handstand', emoji: '🤹', name: 'Handstand', text: 'Ein Handstand auf dem Lenker in der Luft.' },
    { id: 'backflip', emoji: '🔄', name: 'Backflip', text: 'Ein Rückwärtssalto in der Luft.' },
    { id: 'salto', emoji: '🤸‍♂️', name: 'Erster Salto', text: 'Einen Salto in der Luft gedreht!' },
    { id: 'ring', emoji: '🔥', name: 'Feuerring', text: 'Durch den Feuerring gesprungen.' },
    { id: 'bus', emoji: '🚌', name: 'Bus-Springer', text: 'Über die Busse gesprungen.' },
    { id: 'wheelie', emoji: '🏍️', name: 'Hinterrad-Held', text: '30 Meter auf dem Hinterrad gefahren.' },
    { id: 'stoppie', emoji: '🛑', name: 'Vorderrad-Held', text: '20 Meter auf dem Vorderrad gebremst.' },
    { id: 'sammler', emoji: '⭐', name: 'Sticker-Sammler', text: '10 Sticker gesammelt.' },
    { id: 'siege3', emoji: '🔥', name: 'Dreimal Erster', text: '3 Rennen gewonnen.' },
  ];
  const katalog = (spiel) => GEMEINSAM.concat(spiel === 'motorrad' ? MOTO : AUTO);

  const ram = {};
  const key = (sp) => 'rennspiel.spass.sticker.' + sp;
  function neuerStand() { return { got: {}, z: { muenzen: 0, siege: 0, trampolin: 0, kanone: 0, strecken: {} } }; }
  function stand(sp) {
    let o = null;
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) o = JSON.parse(ls.getItem(key(sp)) || 'null'); } catch (e) { o = null; }
    if (!o) o = ram[sp] ? JSON.parse(JSON.stringify(ram[sp])) : null;
    if (!o || typeof o !== 'object') o = neuerStand();
    o.got = o.got && typeof o.got === 'object' ? o.got : {};
    o.z = Object.assign(neuerStand().z, o.z || {});
    if (!o.z.strecken || typeof o.z.strecken !== 'object') o.z.strecken = {};
    return o;
  }
  function sichern(sp, o) {
    ram[sp] = JSON.parse(JSON.stringify(o));
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) ls.setItem(key(sp), JSON.stringify(o)); } catch (e) { /* egal */ }
  }

  /** Ereignis auswerten (rein auf einem Stand-Objekt; schreibt nichts). Liefert die ids, die neu hinzukommen. */
  function auswerten(sp, o, name, d) {
    d = d || {};
    const neu = [], geben = (id) => { if (!o.got[id]) { o.got[id] = Date.now(); neu.push(id); } };
    const z = o.z;
    switch (name) {
      case 'ziel':
        geben('ziel');
        if (d.platz === 1) { z.siege++; geben('sieg'); if (z.siege >= 3) geben('siege3'); }
        if (d.platz >= 1 && d.platz <= 3) geben('podium');
        if (d.nacht) geben('nacht');
        if (d.zwei) geben('zwei');
        if (d.streckeId === 'mond') geben('mond');
        if (d.streckeId === 'unterwasser') geben('tiefsee');
        if (d.streckeId === 'regenbogenland') geben('regenbogen');
        if (d.streckeId) { z.strecken[d.streckeId] = 1; if (STRECKEN.every((s) => z.strecken[s])) geben('strecken'); }
        break;
      case 'muenzen':
        if (d.rennen >= 10) geben('muenzen10');
        if (d.neu > 0) z.muenzen += d.neu;
        if (z.muenzen >= 100) geben('muenzen100');
        break;
      case 'trampolin': z.trampolin++; geben('trampolin'); if (z.trampolin >= 10) geben('trampolin10'); break;
      case 'kanone': z.kanone++; geben('kanone'); if (z.kanone >= 5) geben('kanone5'); break;
      case 'geist': geben('geist'); break;
      case 'hupe': geben('hupe'); break;
      case 'stimme': geben('stimme'); break;
      case 'tuning': geben('tuning1'); if (d.voll) geben('tuningVoll'); break;   // S2: Tuning gekauft ({ voll: alles auf Stufe 5 })
      case 'sprung': if (sp !== 'motorrad' && d.sek >= 1.5) geben('sprung'); break;
      case 'zeitlupe': geben('zeitlupe'); break;                                  // S3: großer Sprung mit Zeitlupe (beide Spiele)
      case 'kurz': if (d.sterne >= 1) geben('kurz1'); if (d.sterne >= 3) geben('kurz3'); if (d.alle) geben('kurzAlle'); break;   // S4: Kurz-Level ({ sterne, alle })
      case 'frei': if (d.gefunden >= 1) geben('frei1'); break;                    // S4: Freie Fahrt – Kiste gefunden
      case 'freiAufgabe': if (d.gesamt > 0 && d.geschafft >= d.gesamt) geben('freiAlle'); break;   // S4: alle Aufgaben einer Strecke
      case 'ko': geben('ko'); geben('koFinale'); break;                           // S4: K.-o.-Rallye gewonnen
      case 'koFinale': geben('koFinale'); break;
      case 'foto': geben('foto'); break;
      case 'huepfer': if (d.n >= 10) geben('mondHupf'); break;                   // S5: Mond-Hüpfer ({ n } im Rennen)
      case 'teleport': geben('teleport'); break;
      case 'dino': geben('dinofreund'); break;
      case 'magnet': geben('magnet'); break;                                     // S6: Fahr-Zauber
      case 'gleiten': geben('gleiter'); break;
      case 'grind': if (d.m >= 20) geben('grind'); break;
      case 'wand': if (d.m >= 15) geben('wandfahrer'); break;
      case 'halfpipe': if (d.hoch >= 3) geben('halfpipe'); break;
      case 'riese': geben('riese'); break;
      case 'mini': geben('mini'); break;
      case 'haustier': geben('haustier'); break;
      case 'kostuem': geben('kostuem'); break;
      case 'superman': case 'handstand': case 'backflip': if (sp === 'motorrad') geben(name); break;   // S3
      case 'fassrolle': if (sp !== 'motorrad') geben('fassrolle'); break;
      case 'salto': if (sp === 'motorrad') geben('salto'); break;
      case 'ring': if (sp === 'motorrad') geben('ring'); break;
      case 'bus': if (sp === 'motorrad') geben('bus'); break;
      case 'wheelie': if (sp === 'motorrad' && d.m >= 30) geben('wheelie'); break;
      case 'stoppie': if (sp === 'motorrad' && d.m >= 20) geben('stoppie'); break;
      default: break;
    }
    if (Object.keys(o.got).filter((i) => i !== 'sammler').length >= 10) geben('sammler');
    return neu;
  }

  function ereignis(sp, name, d) {
    const o = stand(sp), ids = auswerten(sp, o, name, d);
    if (ids.length || name === 'ziel' || name === 'trampolin' || name === 'kanone' || name === 'muenzen') sichern(sp, o);
    const kat = katalog(sp);
    return ids.map((id) => kat.find((k) => k.id === id)).filter(Boolean);
  }
  R.SpassSticker = {
    STRECKEN, katalog, stand, ereignis, auswerten,
    hat: (sp, id) => !!stand(sp).got[id],
    anzahl: (sp) => katalog(sp).filter((k) => stand(sp).got[k.id]).length,
    zurueck: (sp) => { sichern(sp, neuerStand()); },
  };
})();
