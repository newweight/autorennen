// ============================================================
// Spaß-Paket S4 – gemeinsamer Kern der neuen Modi (Autorennen UND Motorrad; läuft ganz am Ende, alles Umhüllungen zur Laufzeit):
//   ⭐ Kurz-Level (spassKurz.js) · 🗺️ Freie Fahrt (spassFrei.js) · 🏁 K.-o.-Rallye (spassKO.js + Anzeige hier) · 📸 Fotomodus (spassFoto.js)
//   Spiel._s4Modus            { art: 'kurz' | 'frei' | 'ko', level? } – gesetzt vom Menü (Start / Level-Übersicht), bleibt bis zum Hauptmenü (damit „Nochmal“ den Modus behält)
//   Spiel.rennenStarten       umhüllt: baut mit dem Modus die Einstellungen (Gegner, Runden, Strecke …, nur vorübergehend, nicht gespeichert) und startet danach den Modus
//   Spiel.physikSchritt       umhüllt: Modus-Logik je Schritt (nur im laufenden Rennen, nicht in der Pause)
//   Spiel.zeichnen            umhüllt: Modus-Bild (Münzen drehen, Anzeige); Spiel.zumMenue / szeneAbbauen: aufräumen, Einstellungen von vorher zurück
//   Spiel._flugEreignis / spassEreignis  umhüllt: Landung, Kanone → Modus (Sprünge/Kanone zählen)
//   R.SpassModi.registriere(name, { einstellungen(spiel, m), start(spiel, m), schritt(spiel, dt), bild(spiel, dt), flug(spiel, i, e), ereignis(spiel, i, name), aufraeumen(spiel) })
//   R.SpassModi.hud(html) / hudWeg()   Zeile oben in der Mitte · .karte({ html, tasten, klick }) Fenster mit Tastatur (Esc/Enter …) · .Muenzen  eigene Goldstücke · .speicher
// Alle Modi AUS (Standard): kein Codepfad – Rennen, Einstellungen und Physik bitgleich wie vorher.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Spass) return;
  const P = R.Spiel.prototype;
  const spielName = () => (window.MOTORRAD === true ? 'motorrad' : 'auto');
  const handler = {};

  // ---------- Speicher (localStorage, sonst Arbeitsspeicher) ----------
  const ram = {};
  const speicher = {
    lade(key, std) {
      try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) { const s = ls.getItem(key); if (s) return JSON.parse(s); } } catch (e) { /* egal */ }
      return ram[key] !== undefined ? JSON.parse(JSON.stringify(ram[key])) : std;
    },
    sichern(key, wert) {
      ram[key] = JSON.parse(JSON.stringify(wert));
      try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) ls.setItem(key, JSON.stringify(wert)); } catch (e) { /* egal */ }
    },
  };

  // ---------- Oberfläche: Stil, Anzeige, Fenster ----------
  function stil() {
    if (typeof document === 'undefined' || document.getElementById('s4-stil')) return;
    const s = document.createElement('style'); s.id = 's4-stil';
    s.textContent =
      '#s4-hud{position:fixed;left:50%;top:1.2vh;transform:translateX(-50%);z-index:120;pointer-events:none;text-align:center;font:900 clamp(15px,2.5vh,26px)/1.2 Arial,sans-serif;color:#fff;' +
      'background:rgba(14,24,58,.72);border:.12em solid rgba(255,255,255,.5);border-radius:1em;padding:.2em .8em;text-shadow:0 .08em .15em rgba(0,0,0,.6);max-width:92vw;white-space:nowrap;display:none}' +
      '#s4-hud small{display:block;font-size:.72em;font-weight:800;opacity:.92}#s4-hud b{color:#ffd23a}#s4-hud .gut{color:#7dff9a}#s4-hud .rot{color:#ff9a8a}' +
      '.s4-fenster{position:fixed;inset:0;z-index:260;display:flex;align-items:center;justify-content:center;background:rgba(10,20,50,.74);color:#fff;font:800 clamp(15px,2.4vh,26px)/1.25 Arial,sans-serif;padding:2vh 3vw;box-sizing:border-box}' +
      '.s4-karte{background:linear-gradient(#27346e,#18214a);border:.15em solid #fff;border-radius:1.2em;padding:.9em 1.4em;text-align:center;max-width:min(94vw,44em);max-height:94vh;overflow:auto;box-shadow:0 .4em 1.4em rgba(0,0,0,.55)}' +
      '.s4-karte h1{margin:.05em 0 .25em;font-size:1.7em;color:#ffd23a;text-shadow:0 .08em .2em rgba(0,0,0,.6)}.s4-karte .gross{font-size:2.4em;line-height:1.15;margin:.1em 0}' +
      '.s4-knoepfe{display:flex;flex-wrap:wrap;gap:.5em;justify-content:center;margin-top:.7em}' +
      '.s4-knopf{padding:.35em 1.1em;border-radius:1.2em;background:#ff8a1f;color:#fff;font-weight:900;cursor:pointer;border:.12em solid #fff;user-select:none}.s4-knopf.gruen{background:#2fae4e}.s4-knopf.blau{background:#2f8bff}.s4-knopf:hover{filter:brightness(1.12)}' +
      '.s4-knopf kbd{font-size:.7em;margin-left:.4em;padding:.05em .4em;border-radius:.4em;background:rgba(0,0,0,.28)}' +
      '.s4-sterne{font-size:2.6em;letter-spacing:.08em;line-height:1.1}.s4-sterne .aus{filter:grayscale(1);opacity:.35}' +
      '@keyframes s4-pop{0%{transform:scale(.2);opacity:0}70%{transform:scale(1.25);opacity:1}100%{transform:scale(1)}}.s4-sterne span.pop{display:inline-block;animation:s4-pop .5s both}';
    document.head.appendChild(s);
  }
  let hudEl = null, hudText = '';
  function hud(html) {
    if (typeof document === 'undefined') return;
    stil();
    if (!hudEl) { hudEl = document.createElement('div'); hudEl.id = 's4-hud'; document.body.appendChild(hudEl); }
    if (html === hudText && hudEl.style.display === 'block') return;
    hudText = html; hudEl.innerHTML = html; hudEl.style.display = html ? 'block' : 'none';
  }
  function hudWeg() { hudText = ''; if (hudEl) hudEl.style.display = 'none'; }

  let offen = null;
  /** Fenster in der Mitte. opt: { html, tasten: { Code: fn }, klick: fn(aktion), alleTastenSperren (Standard true) }. */
  function karte(opt) {
    if (typeof document === 'undefined') return null;
    stil(); karteZu();
    const w = document.createElement('div'); w.className = 's4-fenster';
    w.innerHTML = '<div class="s4-karte">' + opt.html + '</div>';
    w.addEventListener('click', (e) => { const t = e.target.closest('[data-s4]'); if (t && opt.klick) opt.klick(t.dataset.s4, t); });
    document.body.appendChild(w);
    offen = { w, tasten: opt.tasten || {}, sperren: opt.alleTastenSperren !== false };
    return w;
  }
  function karteZu() { if (offen) { offen.w.remove(); offen = null; } }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', (e) => {
      if (!offen) return;
      const f = offen.tasten[e.code];
      if (f || offen.sperren) { e.preventDefault(); e.stopImmediatePropagation(); if (f && !e.repeat) f(e); }
    }, true);
  }

  // ---------- eigene Goldstücke (Kurz-Level, Freie Fahrt): Reihen, die der Modus selbst legt ----------
  /** punkte: [{ x, y, z }] (y = Höhe der Fahrbahn). Ein Draw-Call (InstancedMesh). schritt() liefert die neu eingesammelten. */
  class Muenzen {
    constructor(spiel, punkte, opt) {
      this.spiel = spiel; this.punkte = punkte.map((p) => ({ x: p.x, y: p.y, z: p.z, weg: false, t: 0 }));
      this.radius = (opt && opt.radius) || 2.6; this.gesammelt = 0;
      const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 20); geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffc420, emissive: 0x7a4a00, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
      this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.punkte.length));
      this.mesh.frustumCulled = false; this.mesh.name = 'S4Muenzen';
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
      this._e = new THREE.Euler();
      spiel.szene.add(this.mesh);
      this.animieren(0);
    }
    animieren(zeit) {
      const n = this.punkte.length;
      for (let i = 0; i < n; i++) {
        const c = this.punkte[i];
        if (c.weg) { this._s.set(0, 0, 0); c.t = 0; }
        else this._s.set(1, 1, 1);
        this._e.set(0, zeit * 2.4 + i * 0.6, 0); this._q.setFromEuler(this._e);
        this._p.set(c.x, c.y + 1.1 + Math.sin(zeit * 3 + i) * 0.12, c.z);
        this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    /** Fahrzeug bei (x, y, z): Einsammeln. Rückgabe: Anzahl neu. In der Luft (Höhe > 3 m über der Münze) zählt nichts. */
    schritt(x, y, z) {
      let neu = 0;
      for (let i = 0; i < this.punkte.length; i++) {
        const c = this.punkte[i];
        if (c.weg) continue;
        const dx = c.x - x, dz = c.z - z;
        if (dx * dx + dz * dz < this.radius * this.radius && Math.abs(c.y - y) < 3.2) { c.weg = true; neu++; this.gesammelt++; }
      }
      return neu;
    }
    uebrig() { return this.punkte.length - this.gesammelt; }
    entfernen() {
      if (this.mesh) { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    }
  }

  // ---------- Verdrahtung ----------
  const dispatch = (spiel, was, ...a) => {
    const m = spiel && spiel.s4;
    const h = m && handler[m.art];
    if (h && typeof h[was] === 'function') { try { return h[was](spiel, ...a); } catch (e) { console.error('Spaß S4 (' + m.art + '/' + was + '):', e); } }
    return undefined;
  };
  function aufraeumen(spiel) {
    if (!spiel) return;
    if (spiel.s4) dispatch(spiel, 'aufraeumen');
    spiel.s4 = null;
    hudWeg(); karteZu();
  }

  const szeneAbbauen = P.szeneAbbauen;
  P.szeneAbbauen = function () { try { aufraeumen(this); } catch (e) { /* egal */ } return szeneAbbauen.apply(this, arguments); };

  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function (einst, opt) {
    const m = this._s4Modus && handler[this._s4Modus.art] ? this._s4Modus : null;
    if (m) {
      if (!this._s4Basis) this._s4Basis = JSON.parse(JSON.stringify(this.einstellungen));      // Einstellungen von vorher (Hauptmenü zeigt sie wieder)
      const ein = handler[m.art].einstellungen ? handler[m.art].einstellungen(this, m) : {};
      einst = Object.assign({}, einst || {}, ein);
      opt = Object.assign({}, opt || {}, { temporaer: true });
    }
    const r = rennenStarten.call(this, einst, opt);
    try {
      if (m && this.rennen && this.strecke) {
        this.s4 = { art: m.art, m };
        dispatch(this, 'start', m);
      }
    } catch (e) { console.error('Spaß S4 (Start):', e); }
    return r;
  };

  const pokalStarten = P.pokalStarten;
  if (pokalStarten) P.pokalStarten = function () { this._s4Modus = null; return pokalStarten.apply(this, arguments); };

  const zumMenue = P.zumMenue;
  P.zumMenue = function () {
    try {
      aufraeumen(this);
      if (this._s4Basis) { const modus = this._s4Modus; this.einstellungen = this._s4Basis; this._s4Basis = null; this.einstellungen.spassModus = modus ? modus.art : ''; }
    } catch (e) { console.error('Spaß S4 (Menü):', e); }
    return zumMenue.apply(this, arguments);
  };

  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    if (this.s4 && this.zustand === 'rennen' && !this.pausiert && dt > 0) dispatch(this, 'schritt', dt);
    return r;
  };

  const flugEreignis = P._flugEreignis;
  if (flugEreignis) P._flugEreignis = function (i, e) { const r = flugEreignis.apply(this, arguments); if (this.s4) dispatch(this, 'flug', i, e); return r; };
  const spassEreignis = P.spassEreignis;
  if (spassEreignis) P.spassEreignis = function (i, name) { const r = spassEreignis.apply(this, arguments); if (this.s4) dispatch(this, 'ereignis', i, name); return r; };

  let letzt = 0;
  const zeichnen = P.zeichnen;
  P.zeichnen = function () {
    const jetzt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.min(0.1, Math.max(0, (jetzt - letzt) / 1000)); letzt = jetzt;
    if (this.s4) dispatch(this, 'bild', dt);
    return zeichnen.apply(this, arguments);
  };

  // ---------- K.-o.-Rallye: Anzeige und Verdrahtung (Rechenteil in spassKO.js) ----------
  handler.ko = {
    einstellungen(spiel) {
      const e = (spiel._s4Basis || spiel.einstellungen) || {}, KO = R.SpassKO;
      const gegner = Math.min(R.config.rennen.gegnerMax, Math.max(R.config.spass.ko.minGegner, +e.gegner || 0));
      const n = (e.modus === 'zwei' ? 2 : 1) + gegner;
      return { gegner, runden: Math.min(R.config.rennen.rundenMax, KO.runden(n)), polizei: false, tiere: false, krankenwagen: false, abschleppwagen: false, geisterfahrer: false, geist: false, spielart: 'rennen' };
    },
    start(spiel) {
      const r = spiel.rennen;
      r.elimination = { zuschauerSekunden: R.config.spass.ko.zuschauerSekunden, ko: true };
      r._koWert = R.SpassKO.wertungen(spiel.strecke);
      r.bei('raus', (t) => {
        spiel._ausgeschieden(t);
        if (t.istSpieler) spiel.spassSticker && spiel.spassSticker('koRaus');
      });
      r.bei('ziel', (t) => { if (t.istSpieler && t.zielPlatz === 1) spiel.spassSticker && spiel.spassSticker('ko', { platz: 1 }); });
      r.bei('wertung', (t) => { if (t.istSpieler) spiel._meldung(t.nr, '✔ Wertung ' + t.koWertung, 700); });
      spiel.s4.ko = { sticker: false };
    },
    schritt(spiel) {
      const r = spiel.rennen, s = R.SpassKO.status(r), z = spiel.s4.ko;
      if (!z.finale && s.finale) {
        z.finale = true;
        const mensch = r.teilnehmer.filter((t) => t.istSpieler && !t.ausgeschieden);
        mensch.forEach((t) => spiel._meldung(t.nr, '🏁 Finale! Nur noch zwei!', 2600));
        if (mensch.length && spiel.spassSticker) spiel.spassSticker('koFinale');
      }
    },
    bild(spiel) {
      const r = spiel.rennen;
      if (!r || spiel.zustand !== 'rennen') { hudWeg(); return; }
      const s = R.SpassKO.status(r), w = r.teilnehmer.find((t) => t.istSpieler) || r.teilnehmer[0];
      const ich = r.teilnehmer.filter((t) => t.istSpieler);
      const draussen = ich.length && ich.every((t) => t.ausgeschieden);
      const k = s.finale ? '🏁 FINALE – nur noch zwei!' : `Nächste Wertung: Platz ${s.aktive} fliegt raus`;
      hud(`🏁 <b>K.-o.-Rallye</b> · noch <b>${s.aktive}</b> im Rennen<small>${draussen ? '🚪 Du bist raus – schau zu!' : k + ' · Wertung ' + Math.min(s.naechste, s.gesamt) + '/' + s.gesamt}</small>`);
      void w;
    },
    aufraeumen() { /* Anzeige verschwindet mit hudWeg() */ },
  };

  // Ergebnistafel der K.-o.-Rallye: Überschrift und Text passend
  if (R.ErgebnisAnzeige) {
    const zeigen = R.ErgebnisAnzeige.prototype.zeigen;
    R.ErgebnisAnzeige.prototype.zeigen = function (erg) {
      const r = zeigen.apply(this, arguments);
      try {
        const sp = this.spiel;
        if (sp && sp._s4Modus && sp._s4Modus.art === 'ko' && sp.rennen && sp.rennen.elimination && sp.rennen.elimination.ko) {
          const h = this.wurzel.querySelector('h1'); if (h) h.textContent = '🏁 K.-o.-Rallye';
          this.wurzel.querySelectorAll('.raus').forEach((x) => { x.textContent = x.textContent.replace('raus in Runde', 'raus bei Wertung'); });
        }
      } catch (e) { console.error('Spaß S4 (Ergebnis):', e); }
      return r;
    };
  }

  R.SpassModi = { registriere: (name, h) => { handler[name] = Object.assign(handler[name] || {}, h); }, handler, hud, hudWeg, karte, karteZu, stil, Muenzen, speicher, spielName, aufraeumen,
    offen: () => !!offen };
})();
