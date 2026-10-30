// ============================================================
// Runde 6 (W3-G): Garage („R.Garage") – Münz-Konto, Lackfarben, Reparatur je Fahrer + Auto (R1: alte Upgrades entfernt, nur noch Tuning)
//
// Speicher localStorage 'rennspiel.garage.v1' (config.garage.speicherSchluessel), alle Zugriffe in try/catch
// (ohne localStorage – Node-Tests, Privatmodus – bleibt alles im Arbeitsspeicher):
//   { "<Fahrer>": { muenzen: 57, upgradesErstattet: true, erstattung: 90 (Hinweis offen, optional),
//                   autos: { "<autoId>": { farbe: 0xff5fb8 | null, farben: [gekaufte Farben], rest: 0..100 } } } }
//   farbe null = Originallack. rest = Schaden-Prozent am Ende des letzten Rennens (nur mit Schaden an, sonst 100).
//
//   R1 (30.10.): Die alten Garage-Upgrades (Motor/Reifen/Bremsen Stufe 0–3) gibt es nicht mehr. Beim Laden wird je Fahrer
//   EINMAL (Merker upgradesErstattet) der bezahlte Preis (Stufe 1 = 30, 2 = 30+60, 3 = 30+60+100 je Art und Auto) als
//   Goldstücke gutgeschrieben, die alten Felder werden gelöscht, `erstattung` merkt die Summe für den einmaligen Hinweis.
// Logik (rein, ohne DOM): konto, gutschreiben, autoDaten, farbenFuer, farbeKaufen, fahrzeugWerte, reparieren, restSetzen,
//   startProzent, preisgeld, autos, hinweisHolen/hinweisZeigen (einmaliger Erstattungs-Hinweis).
// Bildschirm: new R.Garage.Bildschirm(spiel, ui, beiZu) – drei Schritte: Fahrer → Auto → Werkstatt.
//   Tastatur: Pfeile bewegen, Enter = wählen/kaufen, Esc = zurück, , . / Q E = Bühne drehen. Maus: alles klickbar,
//   Farben: Maus darüber = Vorschau auf der Bühne. Die KI bekommt nie Garage-Werte (main.js nur für Spieler).
// ============================================================
(function () {
  const R = window.Rennspiel;

  function G() { return R.config.garage || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  // R1: nur noch für die Erstattung – so viel kostete Stufe 1, 2, 3 früher (je Art); nicht mehr in config.garage
  const ALTE_UPGRADE_PREISE = [30, 60, 100];
  const ALTE_ARTEN = ['motor', 'reifen', 'bremsen'];
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

  function speicher() { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } }
  let _ram = {};

  function laden() {
    const s = speicher();
    let o = null;
    if (s) { try { o = JSON.parse(s.getItem(G().speicherSchluessel || 'rennspiel.garage.v1') || 'null'); } catch (e) { o = null; } }
    else o = JSON.parse(JSON.stringify(_ram));
    o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    if (erstatten(o)) speichern(o);      // R1: alte Upgrades einmalig in Goldstücke tauschen (idempotent)
    return o;
  }
  /**
   * R1: alte Upgrade-Stufen (autos[id].motor/reifen/bremsen, 0–3) in bezahlte Goldstücke umrechnen.
   * Je Fahrer genau einmal (Merker upgradesErstattet); danach werden die alten Felder immer gelöscht und nie wieder bezahlt.
   * @returns {boolean} true, wenn sich etwas geändert hat (dann muss gespeichert werden)
   */
  function erstatten(o) {
    let geaendert = false;
    for (const name of Object.keys(o)) {
      const f = o[name];
      if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
      const autos = f.autos && typeof f.autos === 'object' && !Array.isArray(f.autos) ? f.autos : null;
      if (autos) {
        for (const id of Object.keys(autos)) {
          const a = autos[id];
          if (!a || typeof a !== 'object') continue;
          if (ALTE_ARTEN.some((k) => k in a)) {
            if (f.upgradesErstattet !== true) {
              let summe = 0;
              ALTE_ARTEN.forEach((k) => {
                const st = Number.isFinite(a[k]) ? Math.max(0, Math.min(ALTE_UPGRADE_PREISE.length, Math.floor(a[k]))) : 0;
                for (let i = 0; i < st; i++) summe += ALTE_UPGRADE_PREISE[i];
              });
              if (summe > 0) {
                f.muenzen = ganz(f.muenzen, 0, 1e9, 0) + summe;
                f.erstattung = ganz(f.erstattung, 0, 1e9, 0) + summe;
              }
            }
            ALTE_ARTEN.forEach((k) => { delete a[k]; });
            geaendert = true;
          }
        }
      }
      if (f.upgradesErstattet !== true) { f.upgradesErstattet = true; geaendert = true; }
    }
    return geaendert;
  }
  function speichern(o) {
    _ram = JSON.parse(JSON.stringify(o));
    const s = speicher();
    if (s) { try { s.setItem(G().speicherSchluessel || 'rennspiel.garage.v1', JSON.stringify(o)); } catch (e) { /* egal */ } }
  }
  const ganz = (n, lo, hi, d) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : d);

  /** Eintrag eines Fahrers (geprüft, mit Standardwerten). */
  function fahrerEintrag(o, name) {
    const f = o[name] && typeof o[name] === 'object' ? o[name] : {};
    f.muenzen = ganz(f.muenzen, 0, 1e9, 0);
    if (!f.autos || typeof f.autos !== 'object') f.autos = {};
    o[name] = f;
    return f;
  }
  function autoEintrag(f, autoId) {
    const a = f.autos[autoId] && typeof f.autos[autoId] === 'object' ? f.autos[autoId] : {};
    a.farbe = Number.isFinite(a.farbe) ? a.farbe : null;
    a.farben = Array.isArray(a.farben) ? a.farben.filter(Number.isFinite) : [];
    ALTE_ARTEN.forEach((k) => { delete a[k]; });      // R1: alte Upgrade-Felder (nach der Erstattung) nie mehr beachten
    a.rest = 100;   // v32 (N4): jedes Rennen startet mit 100 % – alter gespeicherter Schaden-Rest wird beim Laden verworfen
    f.autos[autoId] = a;
    return a;
  }
  /** Ändern mit Speichern: fn(fahrer, auto) → Rückgabe. */
  function aendern(name, autoId, fn) {
    const o = laden(), f = fahrerEintrag(o, name), a = autoId ? autoEintrag(f, autoId) : null;
    const erg = fn(f, a);
    speichern(o);
    return erg;
  }

  const Garage = {
    laden, speichern,
    /** Nur für Tests: Arbeitsspeicher-Stand leeren (ohne localStorage). */
    _ramLeeren() { _ram = {}; },

    /** Münz-Kontostand eines Fahrers. */
    konto(name) { const o = laden(); return o[name] ? ganz(o[name].muenzen, 0, 1e9, 0) : 0; },
    /** Münzen gutschreiben (n ≥ 0); gibt den neuen Kontostand zurück. */
    gutschreiben(name, n) {
      if (!name) return 0;
      return aendern(name, null, (f) => { f.muenzen += Math.max(0, Math.floor(n) || 0); return f.muenzen; });
    },
    /** 14.10. (v22) Münzen abbuchen (z. B. Polizei freikaufen). → { ok, konto } (ok false = zu wenig, nichts abgebucht). */
    abbuchen(name, n) {
      if (!name) return { ok: false, konto: 0 };
      const k = Math.max(0, Math.floor(n) || 0);
      return aendern(name, null, (f) => { if (f.muenzen < k) return { ok: false, konto: f.muenzen }; f.muenzen -= k; return { ok: true, konto: f.muenzen }; });
    },
    /** Garage-Daten eines Autos (Kopie, mit Standardwerten). */
    autoDaten(name, autoId) {
      const o = laden(), f = fahrerEintrag(o, name), a = autoEintrag(f, autoId);
      return JSON.parse(JSON.stringify(a));
    },
    /** Autos, die in die Garage dürfen (wählbare = ohne Polizei). */
    autos() { return R.carCatalog.waehlbare(); },
    /** Die 4 Lackfarben eines Autos. */
    farbenFuer(autoId) { const F = G().farben || {}; return (F[autoId] || F._standard || [0xe3202b, 0x1f7bff, 0xffc400, 0x14a64a]).slice(0, 4); },
    farbName(hex) { const n = (G().farbNamen || {})[(hex >>> 0).toString(16).padStart(6, '0')]; return n || 'Sonderlack'; },
    /** Aktiver Lack (hex) oder null = Original. */
    lackFarbe(name, autoId) { return Garage.autoDaten(name, autoId).farbe; },

    /**
     * Lackfarbe wählen/kaufen. hex = null → Original (immer gratis). Schon gekaufte Farben sind gratis.
     * @returns {{ok:boolean, grund?:'geld'|'farbe', kosten:number, konto:number}}
     */
    farbeKaufen(name, autoId, hex) {
      return aendern(name, autoId, (f, a) => {
        if (hex === null || hex === undefined) { a.farbe = null; return { ok: true, kosten: 0, konto: f.muenzen }; }
        if (!Garage.farbenFuer(autoId).includes(hex)) return { ok: false, grund: 'farbe', kosten: 0, konto: f.muenzen };
        if (a.farben.includes(hex)) { a.farbe = hex; return { ok: true, kosten: 0, konto: f.muenzen }; }
        const preis = wert(G().farbPreis, 20);
        if (f.muenzen < preis) return { ok: false, grund: 'geld', kosten: preis, konto: f.muenzen };
        f.muenzen -= preis; a.farben.push(hex); a.farbe = hex;
        return { ok: true, kosten: preis, konto: f.muenzen };
      });
    },
    /** Alles, was main.js beim Anlegen eines Spielerautos braucht: { farbe, vMax, grip, bremsen } – Faktoren immer 1 (R1: keine Upgrades mehr; Tuning läuft über R.SpassTuning). */
    fahrzeugWerte(name, autoId) {
      return { vMax: 1, grip: 1, bremsen: 1, farbe: Garage.lackFarbe(name, autoId) };
    },
    /**
     * R1: Einmaliger Hinweis nach der Erstattung. Liefert { summe, fahrer: [{ name, summe }] } und löscht den Merker,
     * oder null, wenn nichts (mehr) zu melden ist.
     */
    hinweisHolen() {
      const o = laden(), liste = [];
      let summe = 0, geaendert = false;
      for (const name of Object.keys(o)) {
        const f = o[name];
        if (!f || typeof f !== 'object') continue;
        const n = ganz(f.erstattung, 0, 1e9, 0);
        if (n > 0) { liste.push({ name, summe: n }); summe += n; }
        if ('erstattung' in f) { delete f.erstattung; geaendert = true; }
      }
      if (geaendert) speichern(o);
      return summe > 0 ? { summe, fahrer: liste } : null;
    },
    /** R1: Hinweis „Deine alten Upgrades wurden in X Goldstücke getauscht“ einmalig als freundliches Fenster zeigen. */
    hinweisZeigen() {
      if (typeof document === 'undefined' || document.getElementById('garage-hinweis')) return false;
      const h = Garage.hinweisHolen();
      if (!h) return false;
      const w = document.createElement('div');
      w.id = 'garage-hinweis';
      w.setAttribute('style', 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.72);font-family:inherit');
      const einzeln = h.fahrer.length > 1 ? `<div style="margin-top:.5em;font-size:.8em;opacity:.85">${h.fahrer.map((x) => `${R.fahrerEmoji ? R.fahrerEmoji(x.name) : ''} ${x.name}: 🪙 ${x.summe}`).join(' · ')}</div>` : '';
      w.innerHTML = `<div style="max-width:30em;margin:1em;padding:1.2em 1.4em;border-radius:1.2em;background:#24305c;color:#fff;border:.15em solid #ffc928;text-align:center;font-size:1.15em;box-shadow:0 .5em 2em rgba(0,0,0,.5)">` +
        `<div style="font-size:2.2em">🪙🎁</div><div style="font-weight:bold;margin:.3em 0">Deine alten Upgrades wurden in ${h.summe} Goldstücke getauscht!</div>` +
        `<div style="font-size:.9em">Jetzt gibt es das Tuning in der Garage – damit kannst du dein Fahrzeug noch viel besser aufmotzen. 🔧</div>${einzeln}` +
        `<div id="garage-hinweis-ok" style="display:inline-block;margin-top:.9em;padding:.4em 1.6em;border-radius:1em;background:#3ddc5a;color:#06210f;font-weight:bold;cursor:pointer">Super! 👍</div></div>`;
      const zu = () => { window.removeEventListener('keydown', taste, true); if (w.parentNode) w.parentNode.removeChild(w); };
      const taste = (e) => { e.stopImmediatePropagation(); e.preventDefault(); if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape' || e.code === 'NumpadEnter') zu(); };
      w.addEventListener('click', zu);
      window.addEventListener('keydown', taste, true);
      document.body.appendChild(w);
      return true;
    },
    /**
     * Reparatur: setzt den Schaden-Rest auf 100 %. Nur sinnvoll mit Schaden an und Rest < 100.
     * @returns {{ok:boolean, grund?:'nichtNoetig'|'geld', kosten:number, konto:number}}
     */
    reparieren(name, autoId, schadenAn) {
      // v32 (N4): jedes Rennen startet mit 100 % – es gibt nichts zu reparieren (keine Kosten)
      return { ok: false, grund: 'nichtNoetig', kosten: 0, konto: Garage.konto(name) };
    },
    /** Schaden-Prozent am Rennende merken (nur mit Schaden an aufrufen). */
    restSetzen(name, autoId, prozent) {
      if (!name || !autoId) return;
      aendern(name, autoId, (f, a) => { a.rest = 100; });   // v32 (N4): kein Schaden-Rest mehr (Schnittstelle bleibt)
    },
    /** Startprozent fürs nächste Rennen (mit Schaden an): gespeicherter Rest, mindestens restMin (30). */
    startProzent(name, autoId) {
      return 100;   // v32 (N4): jedes Rennen startet mit 100 %
    },
    /** Preisgeld für Platz (1-basiert). */
    preisgeld(platz) {
      const p = G().preisgeld || [30, 20, 15];
      return platz >= 1 && platz <= p.length ? p[platz - 1] : wert(G().preisgeldSonst, 5);
    },
  };

  // ============================================================
  // Bildschirm
  // ============================================================
  const DREH = { Comma: -1, Period: 1, KeyQ: -1, KeyE: 1 };
  class Bildschirm {
    /**
     * @param {object} spiel  R.spiel (einstellungen, einstellungenSpeichern)
     * @param {HTMLElement} ui
     * @param {function} beiZu Rückruf beim Schließen (Menü wieder zeigen)
     */
    constructor(spiel, ui, beiZu) {
      this.spiel = spiel;
      this.beiZu = beiZu;
      this.wurzel = document.createElement('div');
      this.wurzel.className = 'overlay menue garage';
      this.wurzel.id = 'garage';
      this.wurzel.style.display = 'none';
      ui.appendChild(this.wurzel);
      this.sichtbar = false;
      this.phase = 'fahrer';        // 'fahrer' | 'auto' | 'werkstatt'
      this.fahrer = null; this.autoId = null;
      this.zeile = 0;               // Werkstatt (R1): 0 Lack, 1 Tuning öffnen (nur wenn R.SpassTuning da ist)
      this.farbIndex = 0;           // Lack-Zeile: 0 = Original, 1..4
      this.vorschau = undefined;    // Lack-Vorschau (hex | null) oder undefined = aktiver Lack
      this.nachricht = ''; this.nachrichtArt = '';
      this.wurzel.addEventListener('click', (e) => {
        const t = e.target.closest('[data-g]');
        if (t) this.aktion(t.dataset.g);
      });
      this.wurzel.addEventListener('mouseover', (e) => {
        const t = e.target.closest('[data-vorschau]');
        if (t && this.phase === 'werkstatt') { const v = t.dataset.vorschau; this.vorschauSetzen(v === 'original' ? null : +v); }
      });
      this.wurzel.addEventListener('mouseout', (e) => {
        const t = e.target.closest('[data-vorschau]');
        if (t && this.phase === 'werkstatt' && !(e.relatedTarget && t.contains(e.relatedTarget))) this.vorschauSetzen(undefined);
      });
    }

    get e() { return this.spiel.einstellungen; }

    oeffnen() {
      this.sichtbar = true;
      this.phase = 'fahrer';
      this.fahrer = this.e.fahrer[0];
      this.autoId = this.e.autoIds[0];
      this.nachricht = '';
      this.wurzel.style.display = '';
      this.zeichnen();
      try { Garage.hinweisZeigen(); } catch (e) { /* egal */ }      // R1: einmaliger Hinweis zur Erstattung
    }
    /** R1: anwählbare Zeilen der Werkstatt (Lack, dazu Tuning öffnen, wenn es Tuning gibt). */
    zeilenZahl() { return R.SpassTuning ? 2 : 1; }
    schliessen() {
      this.sichtbar = false;
      this.wurzel.style.display = 'none';
      this.wurzel.innerHTML = '';          // keine versteckten Karten/Bühnen im DOM lassen (Menü-Zählungen, Canvas)
      if (R.AutoVorschau) R.AutoVorschau.stoppen();
      if (this.beiZu) this.beiZu();
    }
    zurueck() {
      this.nachricht = ''; this.vorschau = undefined;
      if (this.phase === 'werkstatt') this.phase = 'auto';
      else if (this.phase === 'auto') this.phase = 'fahrer';
      else return this.schliessen();
      this.zeichnen();
    }
    weiter() {
      this.nachricht = '';
      if (this.phase === 'fahrer') { this.phase = 'auto'; this.zeichnen(); return; }
      if (this.phase === 'auto') { this.phase = 'werkstatt'; this.zeile = 0; this.farbIndex = this.aktiverFarbIndex(); this.zeichnen(); return; }
      this.zeileAusfuehren();
    }

    aktiverFarbIndex() {
      const f = Garage.lackFarbe(this.fahrer, this.autoId);
      return f === null ? 0 : Garage.farbenFuer(this.autoId).indexOf(f) + 1;
    }
    autoDaten() { return R.carCatalog.finde(this.autoId) || Garage.autos()[0]; }

    melden(text, art) { this.nachricht = text; this.nachrichtArt = art || ''; }
    ton(art) {
      const A = R.Audio;
      if (!A) return;
      if (art === 'kauf' && A._bereit && A._bereit() && A._ton) { A._ton(660, 660, 0.08, 'square', 0.15, 0); A._ton(990, 990, 0.08, 'square', 0.15, 0.08); A._ton(1320, 1320, 0.2, 'square', 0.15, 0.16); }
      else if (A.menueKlick) A.menueKlick();
    }

    /** Lack-Vorschau setzen (undefined = aktiver Lack) und Bühne neu binden. */
    vorschauSetzen(v) {
      if (this.vorschau === v) return;
      this.vorschau = v;
      this.buehneBinden();
    }

    farbeWaehlen(i) {
      const farben = Garage.farbenFuer(this.autoId), hex = i === 0 ? null : farben[i - 1];
      this.farbIndex = i;
      const r = Garage.farbeKaufen(this.fahrer, this.autoId, hex);
      if (r.ok) {
        this.melden(r.kosten ? `Neue Farbe gekauft: ${Garage.farbName(hex)}! 🎨` : (hex === null ? 'Originallack 👍' : `Farbe ${Garage.farbName(hex)} 👍`), 'gut');
        this.ton(r.kosten ? 'kauf' : 'klick');
        this.vorschau = undefined;
      } else {
        this.melden(`Zu wenig Münzen – du brauchst 🪙 ${r.kosten}. Fahr ein Rennen und sammle!`, 'schlecht');
        this.vorschau = hex;          // Vorschau bleibt sichtbar
        this.ton('klick');
      }
    }
    reparatur() {
      const r = Garage.reparieren(this.fahrer, this.autoId, this.e.schaden === true);
      if (r.ok) { this.melden('Repariert! Das Auto startet wieder mit 100 % 🔧', 'gut'); this.ton('kauf'); }
      else if (r.grund === 'nichtNoetig') { this.melden(this.e.schaden ? 'Nicht nötig – das Auto ist heil 💚' : 'Nicht nötig – Schaden ist ausgeschaltet 💚', ''); this.ton('klick'); }
      else { this.melden(`Zu wenig Münzen – Reparatur kostet 🪙 ${r.kosten}.`, 'schlecht'); this.ton('klick'); }
    }
    zeileAusfuehren() {
      const z = this.zeile;
      if (z === 0) this.farbeWaehlen(this.farbIndex);
      else if (z === 1 && R.SpassTuning) { this.aktion('tuning:oeffnen'); return; }      // R1: Tuning (spassTuningUI) – zeichnet selbst
      this.zeichnen();
    }

    // ---------- Eingabe ----------
    taste(code) {
      const T = R.config.tasten, P1 = T.spieler[0], P2 = T.spieler[1];
      if (code === T.pause) { this.zurueck(); return true; }
      if (T.bestaetigen.includes(code)) { this.weiter(); return true; }
      if (DREH[code] !== undefined && this.phase !== 'fahrer' && R.AutoVorschau) { R.AutoVorschau.drehen(0, DREH[code]); return true; }
      let dx = 0, dy = 0;
      if (code === P1.links || code === P2.links) dx = -1;
      else if (code === P1.rechts || code === P2.rechts) dx = 1;
      else if (code === P1.gas || code === P2.gas) dy = -1;
      else if (code === P1.bremse || code === P2.bremse) dy = 1;
      else return false;
      this.nachricht = '';
      if (this.phase === 'fahrer') {
        const l = R.config.fahrer, n = l.length, sp = 6;
        let i = Math.max(0, l.findIndex((f) => f.name === this.fahrer));
        i = (i + (dx || dy * sp) + n * 4) % n;
        this.fahrer = l[i].name;
      } else if (this.phase === 'auto') {
        const l = Garage.autos(), n = l.length;
        let i = Math.max(0, l.findIndex((a) => a.id === this.autoId));
        i = (i + (dx || dy * 3) + n * 4) % n;
        this.autoId = l[i].id;
      } else {
        if (dy) {
          const zz = this.zeilenZahl();
          this.zeile = (this.zeile + dy + zz * 4) % zz;
          this.vorschau = undefined;
          if (this.zeile === 0) { this.farbIndex = this.aktiverFarbIndex(); }
        } else if (this.zeile === 0) {
          this.farbIndex = (this.farbIndex + dx + 5) % 5;
          const hex = this.farbIndex === 0 ? null : Garage.farbenFuer(this.autoId)[this.farbIndex - 1];
          this.vorschau = hex;     // Pfeile zeigen die Farbe zur Probe, Enter kauft
        } else if (this.zeile === 1 && dx > 0) { this.zeileAusfuehren(); return true; }      // R1: → öffnet das Tuning
      }
      this.zeichnen();
      return true;
    }

    aktion(a) {
      const [art, p1] = a.split(':');
      if (art === 'zurueck') return this.zurueck();
      if (art === 'schliessen') return this.schliessen();
      if (art === 'weiter') return this.weiter();
      this.nachricht = '';
      if (art === 'fahrer') { this.fahrer = p1; this.phase = 'auto'; }
      else if (art === 'auto') { this.autoId = p1; this.phase = 'werkstatt'; this.zeile = 0; this.farbIndex = this.aktiverFarbIndex(); this.vorschau = undefined; }
      else if (art === 'farbe') { this.zeile = 0; this.farbeWaehlen(+p1); }
      else if (art === 'phase') { this.phase = p1; }
      if (art === 'fahrer' || art === 'auto' || art === 'phase') this.ton('klick');
      this.zeichnen();
    }

    // ---------- Darstellung ----------
    zeichnen() {
      if (!this.sichtbar) return;
      const konto = Garage.konto(this.fahrer);
      const kopfSchritte = [['fahrer', '1 Fahrer'], ['auto', '2 Auto'], ['werkstatt', '3 Werkstatt']].map(([p, n], i, l) => {
        const idx = l.findIndex((x) => x[0] === this.phase);
        return `<div class="m-schritt${p === this.phase ? ' aktiv' : ''}${i < idx ? ' fertig' : ''}"${i < idx ? ` data-g="phase:${p}"` : ''}>${n}</div>`;
      }).join('<span class="m-pfeil">›</span>');
      let titel = '', inhalt = '', hinweis = '';
      if (this.phase === 'fahrer') {
        titel = '🔧 Garage – wer bist du?'; inhalt = this.htmlFahrer();
        hinweis = '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück zum Menü';
      } else if (this.phase === 'auto') {
        titel = `🔧 Welches Auto soll in die Werkstatt?`; inhalt = this.htmlAuto();
        hinweis = '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> auswählen · <kbd>,</kbd><kbd>.</kbd> drehen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück';
      } else {
        titel = ''; inhalt = this.htmlWerkstatt();
        hinweis = '<kbd>↑</kbd><kbd>↓</kbd> Zeile · <kbd>←</kbd><kbd>→</kbd> Farbe ansehen · <kbd>Enter</kbd> kaufen/öffnen · <kbd>,</kbd><kbd>.</kbd> drehen · <kbd>Esc</kbd> zurück';
      }
      const kontoHtml = `<div class="g-konto" title="Münzen von ${this.fahrer}">${R.fahrerEmoji(this.fahrer)} ${this.fahrer} <b>🪙 ${konto}</b></div>`;
      this.wurzel.innerHTML =
        `<div class="m-kopf"><div class="m-logo"><div class="m-titel">🔧 Garage</div><div class="m-untertitel">Tuning mit Münzen</div></div>` +
        `<div class="m-schritte">${kopfSchritte}</div>${kontoHtml}</div>` +
        `<div class="m-inhalt">${titel ? `<h1>${titel}</h1>` : ''}${inhalt}</div>` +
        `<div class="m-fuss"><div class="m-nav"><div class="knopf klein" data-g="zurueck">◀ Zurück</div>` +
        (this.phase !== 'werkstatt' ? '<div class="knopf klein gruen" data-g="weiter">Weiter ▶</div>' : '<div class="knopf klein blau" data-g="schliessen">🏠 Menü</div>') +
        `</div><div class="m-hinweis">${hinweis}</div></div>`;
      if (this.phase !== 'fahrer') this.buehneBinden();
      else if (R.AutoVorschau) R.AutoVorschau.stoppen();
    }

    buehneBinden() {
      const AV = R.AutoVorschau, c = this.wurzel.querySelector('canvas.buehne');
      if (!AV || !c) return;
      const farbe = this.vorschau !== undefined ? this.vorschau : Garage.lackFarbe(this.fahrer, this.autoId);
      AV.behalten(1);
      AV.binden(0, c, this.autoDaten(), 480, 300, farbe);
    }

    htmlFahrer() {
      const karten = R.config.fahrer.map((f) => {
        const n = Garage.konto(f.name);
        return `<div class="karte fahrer${f.name === this.fahrer ? ' gewaehlt' : ''}" data-g="fahrer:${f.name}">` +
          `<div class="avatar">${f.emoji}</div><div class="karten-name">${f.name}</div><div class="karten-muenzen">🪙 ${n}</div></div>`;
      }).join('');
      return `<div class="m-autos m-fahrer"><div class="m-spieler p1"><div class="raster">${karten}</div></div></div>`;
    }

    htmlAuto() {
      const AV = R.AutoVorschau, dreid = !!(AV && AV.verfuegbar);
      const karten = Garage.autos().map((a) => {
        const lack = Garage.lackFarbe(this.fahrer, a.id);
        const url = dreid ? AV.kachel(a, lack) : null;
        const bild = url ? `<img src="${url}" alt="${a.name}" draggable="false">` : `<div class="g-farbklecks" style="background:${HEX(lack === null ? a.farbe : lack)}"></div>`;
        let sterne = 0;      // R1: Anzahl Tuning-Stufen (falls Tuning da)
        try { if (R.SpassTuning) { const t = R.SpassTuning.stufen(this.fahrer, a.id); sterne = R.SpassTuning.ARTEN.reduce((n, k) => n + (t[k] || 0), 0); } } catch (e) { sterne = 0; }
        return `<div class="karte auto${a.id === this.autoId ? ' gewaehlt' : ''}" data-g="auto:${a.id}">` +
          `<div class="auto-bild">${bild}</div><div class="karten-name">${a.name}</div>` +
          `<div class="g-mini">${sterne ? '🔧 ' + sterne : '&nbsp;'}${lack !== null ? ' 🎨' : ''}</div></div>`;
      }).join('');
      const buehne = dreid ? `<div class="buehne-rahmen"><canvas class="buehne" data-sp="0" width="480" height="300" title="Ziehen zum Drehen"></canvas></div>` : '';
      return `<div class="g-auto">${buehne}<div class="raster g-raster">${karten}</div></div>`;
    }

    htmlWerkstatt() {
      const a = this.autoDaten(), d = Garage.autoDaten(this.fahrer, a.id), konto = Garage.konto(this.fahrer);
      const farben = Garage.farbenFuer(a.id), preis = wert(G().farbPreis, 20);
      const fk = (z) => (this.zeile === z ? ' fokus' : '');
      const zeigeFarbe = this.vorschau !== undefined ? this.vorschau : d.farbe;
      // Lack
      const kreis = (i, hex) => {
        const aktiv = (hex === null ? d.farbe === null : d.farbe === hex), hat = hex === null || d.farben.includes(hex);
        const sicht = this.zeile === 0 && this.farbIndex === i;
        const farbe = HEX(hex === null ? a.farbe : hex);
        const unter = aktiv ? '✓' : hat ? 'gratis' : `🪙 ${preis}`;
        return `<div class="g-farbe${aktiv ? ' aktiv' : ''}${sicht ? ' sicht' : ''}${!hat && konto < preis ? ' teuer' : ''}" data-g="farbe:${i}" data-vorschau="${hex === null ? 'original' : hex}" ` +
          `title="${hex === null ? 'Original' : Garage.farbName(hex)}"><i style="background:${farbe}"></i><span>${hex === null ? 'Original' : Garage.farbName(hex)}</span><small>${unter}</small></div>`;
      };
      const lack = `<div class="g-zeile${fk(0)}"><div class="g-label">🎨 Lack</div><div class="g-farben">${kreis(0, null)}${farben.map((h, i) => kreis(i + 1, h)).join('')}</div></div>`;
      // Reparatur
      // v32 (N4): jedes Rennen startet mit 100 % – nichts zu reparieren, keine Kosten
      const rep = `<div class="g-zeile"><div class="g-label">🔧 Reparatur</div>` +
        `<div class="g-wert"><span class="g-text">Alles heil ✓</span></div></div>`;
      const msg = this.nachricht ? `<div class="g-nachricht ${this.nachrichtArt}">${this.nachricht}</div>` : '<div class="g-nachricht leer">&nbsp;</div>';
      return `<div class="g-werkstatt"><div class="g-links"><div class="buehne-rahmen"><canvas class="buehne" data-sp="0" width="480" height="300" title="Ziehen zum Drehen"></canvas></div>` +
        `<div class="g-autoname">${a.name}${zeigeFarbe !== null && zeigeFarbe !== undefined ? ' · ' + Garage.farbName(zeigeFarbe) : ''}</div>` +
        `</div><div class="g-rechts">${lack}${rep}${msg}</div></div>`;
    }
  }

  Garage.Bildschirm = Bildschirm;
  R.Garage = Garage;
})();
