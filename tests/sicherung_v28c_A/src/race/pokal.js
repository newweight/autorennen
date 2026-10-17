// ============================================================
// Runde 6 (W3-F): Pokal-Serie (D1) und „Letzter fliegt raus" (D7)
//
// R.Pokal (rein, ohne DOM/Three.js – auch in Node testbar):
//   strecken(groesse)        feste Strecken-Reihenfolge je Pokal-Größe (config.pokal.reihenfolge)
//   punkte(platz)            1.=10, 2.=8, 3.=6, 4.=5, 5.=4, 6.=3, 7.=2, ab 8. = 1 (config.pokal.punkte/punkteRest)
//   staerke(start, nr)       KI-Stärke im Rennen nr (0-basiert): je Rennen eine Stufe höher, höchstens maxStaerke (legende);
//                            eine Startstärke über maxStaerke (unschlagbar) bleibt, wie sie ist
//   gewinne(name) / gutschreiben(name)   Pokal-Gewinne je Fahrer, localStorage rennspiel.pokale.v1 (Rückfall: RAM)
//   new Serie({groesse, startStaerke, basis})
//       rennenEinstellungen()  { streckeId, schwierigkeit } für das nächste Rennen
//       ergebnisEintragen(zeilen)   Ergebniszeilen (main.js rennenFertig) → Punkte; gibt die Punkte je Name zurück
//       tabelle()              Gesamtstand: Punkte ↓, Siege ↓, beste Platzierungen, letztes Rennen
//       fertig / sieger / nr / anzahl
// R.PokalAnzeige (DOM): Zwischenstand-Tafel, Siegerehrung (Podest, Konfetti, Fanfare), Rückfrage „Pokal abbrechen?".
// R.Puff (Three.js): „Puff"-Wolke, wenn ein Auto bei „Letzter fliegt raus" ausscheidet.
// Die Rennleitung für „Letzter fliegt raus" steckt in raceManager.js (Option elimination).
// ============================================================
(function () {
  const R = window.Rennspiel;
  const C = () => (R.config && R.config.pokal) || {};
  const STD_REIHENFOLGE = { 3: ['wiese', 'wald', 'fantasie'], 4: ['wiese', 'wald', 'wueste', 'fantasie'], 5: ['wiese', 'wald', 'wueste', 'fantasie', 'dino'] };

  function speicher() { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } }
  let _ram = {};   // Rückfall, wenn localStorage fehlt (gilt bis zum Neuladen)

  const Pokal = {
    get KEY() { return C().speicherSchluessel || 'rennspiel.pokale.v1'; },

    /** Erlaubte Pokal-Größe (3/4/5), sonst Standard. */
    groesse(g) {
      const gs = C().groessen || [3, 4, 5];
      return gs.includes(+g) ? +g : (C().groesseStandard || gs[0]);
    },

    /** Strecken-IDs des Pokals in fester Reihenfolge (nur Strecken, die es im Katalog gibt). */
    strecken(groesse) {
      const g = Pokal.groesse(groesse), r = C().reihenfolge || STD_REIHENFOLGE;
      const liste = (r[g] || STD_REIHENFOLGE[g] || STD_REIHENFOLGE[3]).slice();
      return R.trackCatalog ? liste.filter((id) => R.trackCatalog.some((t) => t.id === id)) : liste;
    },

    /** Punkte für einen Platz (1-basiert); 0 für ungültige Plätze. */
    punkte(platz) {
      const p = C().punkte || [10, 8, 6, 5, 4, 3, 2];
      if (!(platz >= 1)) return 0;
      return platz <= p.length ? p[platz - 1] : (C().punkteRest !== undefined ? C().punkteRest : 1);
    },

    /** Stärken in Rang-Reihenfolge (leicht … unschlagbar). */
    staerken() {
      const S = (R.config && R.config.schwierigkeiten) || {};
      return Object.keys(S).sort((a, b) => (S[a].rang || 0) - (S[b].rang || 0));
    },

    /** KI-Stärke für Rennen nr (0-basiert) eines Pokals mit Startstärke start. */
    staerke(start, nr) {
      const l = Pokal.staerken();
      let i = l.indexOf(start);
      if (i < 0) i = Math.max(0, l.indexOf((R.config && R.config.schwierigkeitStandard) || 'mittel'));
      const max = l.indexOf(C().maxStaerke || 'legende');
      if (max >= 0 && i >= max) return l[i];          // schon an/über der Obergrenze (z. B. unschlagbar): bleibt
      const ziel = i + Math.max(0, nr | 0);
      return l[max >= 0 ? Math.min(max, ziel) : Math.min(l.length - 1, ziel)];
    },

    laden() {
      const s = speicher();
      if (!s) return Object.assign({}, _ram);
      try {
        const o = JSON.parse(s.getItem(Pokal.KEY) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) { return {}; }
    },
    speichern(o) {
      _ram = Object.assign({}, o);
      const s = speicher();
      if (s) { try { s.setItem(Pokal.KEY, JSON.stringify(o)); } catch (e) { /* ignorieren */ } }
    },
    /** Anzahl gewonnener Pokale eines Fahrers. */
    gewinne(name) { const n = Pokal.laden()[name]; return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; },
    /** Einen Pokal gutschreiben; gibt die neue Anzahl zurück. */
    gutschreiben(name) {
      const o = Pokal.laden();
      o[name] = (Number.isFinite(o[name]) ? Math.floor(o[name]) : 0) + 1;
      Pokal.speichern(o);
      return o[name];
    },
  };

  // ------------------------------------------------------------
  // Serie: Stand eines laufenden Pokals
  // ------------------------------------------------------------
  class Serie {
    /** @param {{groesse:number, startStaerke:string, basis?:object}} opt */
    constructor(opt) {
      const o = opt || {};
      this.groesse = Pokal.groesse(o.groesse);
      this.strecken = Pokal.strecken(this.groesse);
      this.startStaerke = o.startStaerke || (R.config && R.config.schwierigkeitStandard) || 'mittel';
      this.basis = o.basis || null;        // Einstellungen vor dem Pokal (werden danach wiederhergestellt)
      this.nr = 0;                         // Index des nächsten Rennens
      this.stand = {};                     // name → { name, istSpieler, spielerNr, auto, punkte, plaetze[], siege, zuletzt }
      this.rennen = [];                    // je Rennen: { streckeId, staerke, zeilen: [{name, platz, punkte}] }
      this.gewinnGespeichert = false;
    }
    get anzahl() { return this.strecken.length; }
    get fertig() { return this.nr >= this.anzahl; }
    get streckeId() { return this.strecken[Math.min(this.nr, this.anzahl - 1)]; }
    get staerkeJetzt() { return Pokal.staerke(this.startStaerke, Math.min(this.nr, this.anzahl - 1)); }

    /** Einstellungen für das nächste Rennen (der Rest kommt aus den gespeicherten Einstellungen). */
    rennenEinstellungen() { return { streckeId: this.streckeId, schwierigkeit: this.staerkeJetzt }; }

    /**
     * Ergebnis eines Rennens eintragen (Zeilen wie main.js rennenFertig: platz, name, istSpieler, spielerNr, auto).
     * @returns {Object<string, number>} Punkte dieses Rennens je Name
     */
    ergebnisEintragen(zeilen) {
      if (this.fertig) return {};
      const neu = {}, eintrag = { streckeId: this.streckeId, staerke: this.staerkeJetzt, zeilen: [] };
      (zeilen || []).forEach((z) => {
        const p = Pokal.punkte(z.platz);
        const s = this.stand[z.name] || (this.stand[z.name] = { name: z.name, punkte: 0, plaetze: [], siege: 0 });
        s.istSpieler = !!z.istSpieler; s.spielerNr = z.spielerNr; if (z.auto) s.auto = z.auto;
        s.punkte += p; s.plaetze.push(z.platz); s.zuletzt = z.platz;
        if (z.platz === 1) s.siege++;
        neu[z.name] = p;
        eintrag.zeilen.push({ name: z.name, platz: z.platz, punkte: p });
      });
      this.rennen.push(eintrag);
      this.nr++;
      this.letztePunkte = neu;
      return neu;
    }

    /** Gesamtstand, sortiert (Platz 1 zuerst); jede Zeile bekommt `rang` (1-basiert). */
    tabelle() {
      const besser = (a, b) => {          // beste Platzierungen der Reihe nach vergleichen
        const x = a.plaetze.slice().sort((m, n) => m - n), y = b.plaetze.slice().sort((m, n) => m - n);
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
          const d = (x[i] || 99) - (y[i] || 99);
          if (d) return d;
        }
        return 0;
      };
      const t = Object.keys(this.stand).map((k) => this.stand[k]).sort((a, b) =>
        b.punkte - a.punkte || b.siege - a.siege || besser(a, b) || (a.zuletzt || 99) - (b.zuletzt || 99));
      t.forEach((z, i) => { z.rang = i + 1; });
      return t;
    }
    get sieger() { return this.tabelle()[0] || null; }
  }
  Pokal.Serie = Serie;
  R.Pokal = Pokal;

  if (typeof document === 'undefined') return;     // Node-Tests: nur die Logik

  // ------------------------------------------------------------
  // Anzeige: Zwischenstand, Siegerehrung, Rückfrage
  // ------------------------------------------------------------
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const streckeName = (id) => { const t = R.trackCatalog && R.trackCatalog.find((x) => x.id === id); return t ? t.name : id; };
  const staerkeName = (k) => ((R.config.schwierigkeiten || {})[k] || {}).name || k;

  /** Kurze Fanfare über die Ton-Engine (nichts, wenn Ton aus/nicht bereit). */
  function fanfare() {
    const A = R.Audio;
    if (!A || !A._bereit || !A._bereit() || !A._ton) return;
    const n = [[523.25, 0, 0.16], [523.25, 0.18, 0.16], [523.25, 0.36, 0.16], [659.25, 0.54, 0.42], [587.33, 1.0, 0.16],
      [659.25, 1.18, 0.16], [783.99, 1.36, 0.9]];
    n.forEach(([f, t, d]) => { A._ton(f, f, d, 'triangle', 0.42, t); A._ton(f * 2, f * 2, d, 'square', 0.05, t); A._ton(f / 2, f / 2, d, 'sine', 0.25, t); });
  }

  class PokalAnzeige {
    constructor(spiel, ui) {
      this.spiel = spiel;
      this.wurzel = document.createElement('div');
      this.wurzel.className = 'overlay ergebnis pokal';
      this.wurzel.id = 'pokal';
      this.wurzel.style.display = 'none';
      ui.appendChild(this.wurzel);
      this.frageEl = document.createElement('div');
      this.frageEl.className = 'overlay pokal-frage';
      this.frageEl.id = 'pokal-frage';
      this.frageEl.style.display = 'none';
      ui.appendChild(this.frageEl);
      this.art = null;           // 'zwischen' | 'sieger' | null
      this.frageOffen = false;
      this.frageFokus = 1;       // 0 = Ja, 1 = Nein (Standard: Nein)
      this.seit = 0;
      const klick = (e) => { const t = e.target.closest('[data-a]'); if (t) this.aktion(t.dataset.a); };
      this.wurzel.addEventListener('click', klick);
      this.frageEl.addEventListener('click', klick);
    }

    /** Fängt die Anzeige gerade Tasten ab? */
    offen() { return this.frageOffen || !!this.art; }

    verstecken() {
      this.art = null; this.wurzel.style.display = 'none'; this.wurzel.innerHTML = '';
      this.frageSchliessen();
    }

    _autoZelle(a) {
      if (!a) return '<td class="auto"></td>';
      return `<td class="auto"><i style="background:${HEX(a.farbe)}"></i>${esc(a.name)}</td>`;
    }

    /** Zwischenstand nach Rennen serie.nr (Tabelle Fahrer/Auto/+Punkte/Punkte, „Weiter"). */
    zwischenstand(serie) {
      this.art = 'zwischen'; this.seit = performance.now();
      const tab = serie.tabelle(), neu = serie.letztePunkte || {};
      const letzte = serie.rennen[serie.rennen.length - 1];
      const platzIm = {}; (letzte ? letzte.zeilen : []).forEach((z) => { platzIm[z.name] = z.platz; });
      const zeilen = tab.map((z) =>
        `<tr class="${z.istSpieler ? 'spieler p' + ((z.spielerNr || 0) + 1) : 'computer'}">` +
        `<td class="platz">${z.rang}.</td><td class="name">${z.istSpieler ? R.fahrerEmoji(z.name) : '🤖'} ${esc(z.name)}</td>` +
        this._autoZelle(z.auto) +
        `<td class="p-rennen">${platzIm[z.name] ? platzIm[z.name] + '.' : ''}</td>` +
        `<td class="p-plus">+${neu[z.name] || 0}</td><td class="p-punkte">${z.punkte}</td></tr>`).join('');
      const naechste = serie.fertig ? '' :
        `<div class="pokal-naechstes">Nächstes Rennen: <b>${esc(streckeName(serie.streckeId))}</b> · Computer: <b>${esc(staerkeName(serie.staerkeJetzt))}</b></div>`;
      const punkte = serie.strecken.map((id, i) =>
        `<span class="pokal-etappe${i < serie.nr ? ' fertig' : ''}${i === serie.nr ? ' jetzt' : ''}">${i + 1}. ${esc(streckeName(id))}</span>`).join('<span class="m-pfeil">›</span>');
      this.wurzel.innerHTML =
        `<div class="ergebnis-karte pokal-karte"><h1>🏆 Pokal – Zwischenstand</h1>` +
        `<div class="pokal-etappen">${punkte}</div>` +
        `<div class="pokal-untertitel">Rennen ${serie.nr} von ${serie.anzahl} geschafft${letzte ? ' (' + esc(streckeName(letzte.streckeId)) + ')' : ''}</div>` +
        `<table><thead><tr><th>Platz</th><th>Fahrer</th><th>Auto</th><th>Rennen</th><th>+</th><th>Punkte</th></tr></thead><tbody>${zeilen}</tbody></table>` +
        naechste +
        `<div class="knoepfe"><div class="knopf gruen" data-a="weiter">▶ Weiter <kbd>Enter</kbd></div>` +
        `<div class="knopf blau" data-a="abbrechen">🚪 Pokal abbrechen <kbd>Esc</kbd></div></div></div>`;
      this.wurzel.style.display = '';
    }

    /** Siegerehrung: Podest 🥇🥈🥉 (2 – 1 – 3), Konfetti, Fanfare, restliche Plätze klein. */
    siegerehrung(serie, info) {
      this.art = 'sieger'; this.seit = performance.now();
      const tab = serie.tabelle(), AV = R.AutoVorschau;
      const medaille = ['🥇', '🥈', '🥉'];
      const karte = (z, i) => {
        if (!z) return '<div class="podest-platz leer"></div>';
        let bild = '';
        try { const url = AV && AV.verfuegbar !== false && AV.kachel && z.auto ? AV.kachel(z.auto) : null; if (url) bild = `<img src="${url}" alt="">`; } catch (e) { /* egal */ }
        if (!bild && z.auto) bild = `<div class="podest-farbe" style="background:${HEX(z.auto.farbe)}"></div>`;
        return `<div class="podest-platz p${i + 1}${z.istSpieler ? ' spieler' : ''}">` +
          `<div class="podest-medaille">${medaille[i]}</div>` +
          `<div class="podest-fahrer">${z.istSpieler ? R.fahrerEmoji(z.name) : '🤖'} ${esc(z.name)}</div>` +
          `<div class="podest-auto">${bild}<span>${z.auto ? esc(z.auto.name) : ''}</span></div>` +
          `<div class="podest-punkte">${z.punkte} Punkte</div>` +
          `<div class="podest-sockel">${i + 1}</div></div>`;
      };
      const rest = tab.slice(3).map((z) => `<span class="podest-rest">${z.rang}. ${z.istSpieler ? '' : '🤖 '}${esc(z.name)} · ${z.punkte}</span>`).join('');
      const s = tab[0];
      const gewinn = info && info.pokale ? `<div class="pokal-gewinn">🏆 ${esc(s.name)} hat jetzt ${info.pokale} ${info.pokale === 1 ? 'Pokal' : 'Pokale'}!</div>` : '';
      const n = C().konfetti || 90, farben = ['#ffd23a', '#ff5a3a', '#2fcf5a', '#2f8bff', '#ff8fd8', '#ffffff', '#ff8a1f'];
      let konfetti = '';
      for (let i = 0; i < n; i++) {
        const links = (i * 37.7) % 100, verz = ((i * 13) % 40) / 10, dauer = 2.6 + ((i * 7) % 20) / 10, dreh = (i * 47) % 360;
        konfetti += `<i style="left:${links.toFixed(1)}%;background:${farben[i % farben.length]};animation-delay:${verz}s;animation-duration:${dauer}s;transform:rotate(${dreh}deg)"></i>`;
      }
      this.wurzel.innerHTML =
        `<div class="konfetti">${konfetti}</div>` +
        `<div class="ergebnis-karte pokal-karte sieger"><h1>🏆 Siegerehrung 🏆</h1>` +
        `<div class="pokal-untertitel">${serie.anzahl} Rennen · ${serie.strecken.map(streckeName).map(esc).join(' → ')}</div>` +
        `<div class="podest">${karte(tab[1], 1)}${karte(tab[0], 0)}${karte(tab[2], 2)}</div>` +
        gewinn + (rest ? `<div class="podest-reste">${rest}</div>` : '') +
        `<div class="knoepfe"><div class="knopf gruen" data-a="neu">🏆 Neuer Pokal <kbd>Enter</kbd></div>` +
        `<div class="knopf blau" data-a="menue">🏠 Hauptmenü <kbd>Esc</kbd></div></div></div>`;
      this.wurzel.style.display = '';
      fanfare();
    }

    /** Rückfrage „Pokal abbrechen?" (über allem; Pfeile/Enter oder Maus). */
    frage(text, ja, nein) {
      this.frageOffen = true; this.frageFokus = 1; this._ja = ja; this._nein = nein; this._frageText = text;
      this.frageEl.style.display = '';
      this._frageZeichnen();
    }
    _frageZeichnen() {
      this.frageEl.innerHTML = `<div class="pause-karte pokal-frage-karte"><h1>🚪 ${esc(this._frageText)}</h1>` +
        `<div class="pokal-frage-text">Die Punkte gehen verloren.</div>` +
        `<div class="knoepfe"><div class="knopf${this.frageFokus === 0 ? ' fokus' : ''}" data-a="ja">Ja, abbrechen</div>` +
        `<div class="knopf gruen${this.frageFokus === 1 ? ' fokus' : ''}" data-a="nein">Nein, weiterfahren</div></div></div>`;
    }
    frageSchliessen() { this.frageOffen = false; this.frageEl.style.display = 'none'; this.frageEl.innerHTML = ''; }

    aktion(a) {
      const sp = this.spiel;
      if (a === 'ja' || a === 'nein') {
        const fn = a === 'ja' ? this._ja : this._nein;
        this.frageSchliessen();
        if (fn) fn();
        return;
      }
      if (this.frageOffen) return;
      if (performance.now() - this.seit < ((R.config.ui && R.config.ui.ergebnisSperreMs) || 0)) return;
      if (a === 'weiter' && this.art === 'zwischen') sp.pokalWeiter();
      else if (a === 'abbrechen') sp.pokalAbbruchFragen();
      else if (a === 'neu' && this.art === 'sieger') sp.pokalNeu();
      else if (a === 'menue' && this.art === 'sieger') sp.pokalBeenden();
    }

    taste(code) {
      const T = R.config.tasten, P1 = T.spieler[0], P2 = T.spieler[1];
      if (this.frageOffen) {
        if ([P1.links, P1.rechts, P2.links, P2.rechts, P1.gas, P1.bremse, P2.gas, P2.bremse].includes(code)) { this.frageFokus = 1 - this.frageFokus; this._frageZeichnen(); }
        else if (T.bestaetigen.includes(code)) this.aktion(this.frageFokus === 0 ? 'ja' : 'nein');
        else if (code === T.pause) this.aktion('nein');
        return;
      }
      if (T.bestaetigen.includes(code)) this.aktion(this.art === 'sieger' ? 'neu' : 'weiter');
      else if (code === T.pause) this.aktion(this.art === 'sieger' ? 'menue' : 'abbrechen');
    }
  }
  R.PokalAnzeige = PokalAnzeige;

  // ------------------------------------------------------------
  // „Puff"-Wolke (Three.js): 14 hellgraue Kugeln fliegen auseinander, wachsen und verblassen
  // ------------------------------------------------------------
  class Puff {
    constructor(szene, x, y, z) {
      this.szene = szene; this.zeit = 0;
      this.dauer = ((C().elimination || {}).puffDauer) || 0.9;
      if (typeof THREE === 'undefined' || !szene) { this.fertig = true; return; }
      this.gruppe = new THREE.Group();
      this.gruppe.position.set(x, y + 0.8, z);
      const geo = this.geo = new THREE.SphereGeometry(0.85, 8, 6);   // eigene Geometrie (szeneAbbauen gibt sie frei)
      this.material = new THREE.MeshLambertMaterial({ color: 0xf4f1ea, emissive: 0x3a3630, transparent: true, opacity: 0.97, depthWrite: false });
      this.teile = [];
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(geo, this.material);
        const w = i / 14 * Math.PI * 2, h = (i % 3) * 0.35;
        m.userData.v = { x: Math.cos(w) * (2.2 + (i % 4) * 0.5), y: 1.2 + h * 2, z: Math.sin(w) * (2.2 + (i % 4) * 0.5) };
        m.position.set(Math.cos(w) * 0.4, h, Math.sin(w) * 0.4);
        this.gruppe.add(m); this.teile.push(m);
      }
      // ein heller Blitz in der Mitte
      this.blitz = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9, depthWrite: false }));
      this.blitz.scale.setScalar(2.2);
      this.gruppe.add(this.blitz);
      szene.add(this.gruppe);
    }
    /** @returns {boolean} noch aktiv? */
    update(dt) {
      if (this.fertig) return false;
      this.zeit += dt;
      const u = Math.min(1, this.zeit / this.dauer);
      for (const m of this.teile) {
        const v = m.userData.v;
        m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt;
        v.y -= 1.5 * dt;
        m.scale.setScalar(1 + u * 2.2);
      }
      this.material.opacity = 0.95 * (1 - u);
      this.blitz.material.opacity = Math.max(0, 0.9 * (1 - u * 3));
      this.blitz.scale.setScalar(2.2 + u * 4);
      if (u >= 1) this.entfernen();
      return !this.fertig;
    }
    entfernen() {
      if (this.fertig) return;
      this.fertig = true;
      if (this.gruppe && this.szene) this.szene.remove(this.gruppe);
      if (this.material) this.material.dispose();
      if (this.geo) this.geo.dispose();
      if (this.blitz) this.blitz.material.dispose();
    }
  }
  R.Puff = Puff;
})();
