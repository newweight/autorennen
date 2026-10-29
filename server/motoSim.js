// ============================================================
// M4 Motorrad online: Motorrad-Zusatz der Server-Simulation (Node, CommonJS). Wird NUR für Motorrad-Räume benutzt (server/simulation.js: opt.moto).
//
// Der Server rechnet die Motorräder mit denselben Modulen wie Motorrad.html (zweiter vm-Kontext, siehe simulation.js `ladenMoto`):
//   Motorrad-Katalog (Crossmaschinen + M3-Typen), angepasste Strecken, Schräglage/Sturz (Spiel.physikSchritt-Umhüllungen aus src/moto/*),
//   Stunts (stuntStart.js: Flug, Tricks, Ring, Bus-Reihe, Wheelie/Stoppie, Combo), Unfälle (unfallStart.js: Folge nach Sturz, Szene vor Ort, Stationen).
// Dieses Modul hängt nur das an, was im Browser Menü/Bild/Grafik erledigen:
//   - Zustand je Fahrzeug anlegen (f.motoZ, spiel.stunt, spiel.unfall, Werkstatt/Krankenstation als Fläche für die Fahrphysik),
//   - nach jedem Schritt den Purzelbaum weiterzählen (im Browser je BILD in schraeglage.js) und das Quad entschärfen (motoM3Start.js),
//   - Trick-Taste je Teilnehmer (online = Eingabe-Bit k) statt Tastatur,
//   - Zustand/Ereignisse fürs Protokoll (server/PROTOKOLL.md, Abschnitt „M4 Motorrad“).
// Zufall: keine Math.random – Folge nach Sturz und KI-Tricks sind deterministisch (Saat aus Strecke + Fahrer-Nr.), Client und Server rechnen gleich.
// ============================================================
'use strict';

const MAX_TEILNEHMER = 12;           // Protokoll: Menschen + Computer (Netz.MAX_AUTOS)

/**
 * Motorrad-Zusatz an eine gebaute Simulation hängen.
 * @param {object} simulation  die Simulation (server/simulation.js; Teilnehmer, Strecke, sim.fahrzeuge sind schon da)
 * @param {object} R           Rennspiel-Namensraum des Motorrad-Kontexts
 * @param {object} e           geprüfte Raum-Einstellungen (unfall, stuntrennen)
 */
function einbauen(simulation, R, e) {
  const sim = simulation.sim, M = R.Moto, SL = M.schraeglage, St = M.stunts, U = M.unfall, TY = M.typen, N = R.Netz, rd = N.rund;
  const nT = simulation.nT;
  const trick = [];                  // Trick-Taste je Spieler-Nr gehalten?
  // S8: Kistenstapel auf normalen Strecken (src/moto/motoS8Welt.js) – Treffer als Ereignis `kiste` (nur Anzeige; die Wirkung rechnen Server und Vorhersage gleich)
  sim.s8Ereignis = (i, k) => { if (i < nT) simulation.ereignisse.push({ an: null, art: 'kiste', nr: i, k }); };

  // ---- Trick-Taste statt Tastatur: stuntStart.js liest cfg.taste[spielerNr] über input.istGedrueckt; online hat jeder Teilnehmer seinen eigenen Code ----
  R.config.motoStunts.taste = Array.from({ length: MAX_TEILNEHMER }, (_, i) => 'Trick' + i);
  sim.input.istGedrueckt = (code) => { const m = /^Trick(\d+)$/.exec(String(code)); return !!(m && trick[+m[1]]); };
  sim.input.wurdeGedrueckt = () => false;

  // ---- Zustände je Fahrzeug (Schräglage/Sturz, Stunts, Unfälle) ----
  sim.fahrzeuge.forEach((f) => { f.motoZ = SL.zustand(); f.motoKopflos = true; });       // motoKopflos: Sturz auch ohne Mesh (schraeglage.js stoesseAuswerten)
  sim.stunt = M.stuntStart.stuntNeu(sim, e.stuntrennen === true);
  M.unfallStart.unfallNeu(sim, { unfall: e.unfall });

  // ---- Werkstatt + Krankenstation: Fläche für die Fahrphysik (main.js fragt werkstatt.untergrund je Schritt) – ohne Gebäude (der Browser baut die Optik) ----
  let stationen = null;
  try {
    const b = U.stationenBilden(sim.strecke);
    if (b && b.werkstatt && b.kranken) {
      const teile = [b.werkstatt, b.kranken];
      const stub = {
        vorhanden: true, strecke: sim.strecke, teile,
        get platz() { return teile[0].platz; },
        get plaetze() { return teile.map((t) => t.platz); },
        bei() { /* die Pflege macht unfallStart.js */ },
        belag(s, q, x, z) { for (const t of teile) { const r = t.belag(s, q, x, z); if (r !== null) return r; } return null; },
        untergrund(v, n) { for (const t of teile) { const u = t.untergrund(v, n); if (u) return u; } return null; },
        bauen() { return null; }, freiraeumen() { return 0; }, schritt() { }, zustand() { return { status: 'aus', vorhanden: true, heilt: false }; },
        kiSteuerung() { return null; }, animieren() { }, zerstoeren() { },
      };
      stationen = { werkstatt: b.werkstatt, kranken: b.kranken, stub };
      sim.motoStationen = stationen;
      sim.werkstatt = stub;
    }
  } catch (err) { console.error('Motorrad-Stationen (Server):', err && err.stack); }

  // ---- Ereignis-Zähler (nur Unterschiede melden) ----
  const prevPurzel = sim.fahrzeuge.map(() => 0);
  const prevStat = sim.fahrzeuge.map(() => ({ schreck: 0, schaden: 0, leicht: 0, schwer: 0 }));

  const moto = {
    trick, stationen,

    /** Nach jedem Physikschritt (nach den Umhüllungen von Sturz/Stunt/Unfall): Purzelbaum weiterzählen, Quad entschärfen, Ereignisse sammeln. */
    nachSchritt(dt) {
      for (let i = 0; i < sim.fahrzeuge.length; i++) {
        const f = sim.fahrzeuge[i], mz = f && f.motoZ;
        if (!mz) continue;
        if (f.auto && f.auto.kippt === false && TY && TY.quadEntschaerfen) TY.quadEntschaerfen(mz, null, SL.PURZEL);     // Quad kippt nie (wie motoM3Start.js)
        SL.purzelSchritt(mz, dt);                                                                                          // im Browser je Bild (schraeglage.js bildFuerSpiel)
        // Quad: der Sturz darf gar nicht erst gezählt werden (sonst käme ein Unfall-Ereignis); eine Abklingzeit > 0 sperrt purzelStart im nächsten Schritt
        if (f.auto && f.auto.kippt === false) mz.purzel.abkling = Math.max(mz.purzel.abkling, 2);
      }
      const ev = simulation.ereignisse;
      const st = sim.stunt, un = sim.unfall;
      if (st && st.alle.length) {
        for (const x of st.alle) {
          if (x.fahrzeug >= nT) continue;
          ev.push({ an: null, art: 'stunt', nr: x.fahrzeug, st: x.art, name: x.name, p: x.punkte, m: x.mult, g: x.gesamt, x: x.meter !== undefined ? x.meter : x.n });
        }
        st.alle.length = 0;
      }
      for (let i = 0; i < nT; i++) {
        const mz = sim.fahrzeuge[i].motoZ;
        if (mz && mz.purzel.anzahl > prevPurzel[i]) { prevPurzel[i] = mz.purzel.anzahl; ev.push({ an: null, art: 'sturz', nr: i, n: mz.purzel.anzahl }); }
        const u = un && un.fz[i];
        if (!u) continue;
        const s0 = prevStat[i], s = u.stat;
        const folge = s.schreck > s0.schreck ? 'schreck' : s.schaden > s0.schaden ? 'schaden' : s.leicht > s0.leicht ? 'leicht' : s.schwer > s0.schwer ? 'schwer' : null;
        if (folge) {
          s0.schreck = s.schreck; s0.schaden = s.schaden; s0.leicht = s.leicht; s0.schwer = s.schwer;
          ev.push({ an: null, art: 'unfall', nr: i, folge, szene: u.szene ? u.szene.art : null, z: rd(u.zustand, 1), gs: rd(u.gesundheit, 1) });
        }
      }
    },

    /**
     * zustand.mo: je Teilnehmer i (gleiche Reihenfolge wie `a`):
     *   [0 purzelAnzahl, 1 stuntPunkte, 2 comboMult, 3 comboRestSek, 4 motorrad%, 5 fahrer%, 6 flags, 7 gier, 8 salto, 9 hoehe, 10 nick, 11 meter, 12 szene|0]
     *   flags: 1 Purzelbaum läuft · 2 an einer Station (Halt) · 4 Station: steht · 8 Szene vor Ort · 16 Wheelie · 32 Stoppie · 64 Trick läuft · 128 in der Luft · 256 Halt an der Krankenstation
     *   szene: [art 0 Abschleppwagen/1 Krankenwagen, phase 0 wartet/1 läuft, t, sB, qB, qH, dir, pflege, frei 0/1, tFrei]
     */
    zustand() {
      const st = sim.stunt, un = sim.unfall;
      const liste = [];
      for (let i = 0; i < nT; i++) {
        const f = sim.fahrzeuge[i], mz = f.motoZ, z = st && st.fz[i], u = un && un.fz[i];
        const c = z ? St.comboRest(z.combo, z.jetzt) : { mult: 0, rest: 0 };
        let fl = 0;
        if (mz && mz.purzel.aktiv) fl |= 1;
        if (u && u.halt) { fl |= 2; if (u.halt.steht) fl |= 4; if (u.halt.art === 'kranken') fl |= 256; }
        if (u && u.szene) fl |= 8;
        if (z) { if (z.wheelie.aktiv) fl |= 16; if (z.stoppie.aktiv) fl |= 32; if (z.trick || z.neuPose) fl |= 64; if (z.luft) fl |= 128; }
        const p = z ? z.pose : null;
        const meter = z ? (z.wheelie.aktiv ? z.wheelie.meter : z.stoppie.aktiv ? z.stoppie.meter : 0) : 0;
        let sz = 0;
        if (u && u.szene) {
          const s = u.szene;
          sz = [s.art === 'abschlepp' ? 0 : 1, s.phase === 'lauf' ? 1 : 0, rd(s.t || 0, 2), rd(s.sB || 0, 2), rd(s.qB || 0, 2), rd(s.qH || 0, 2), s.dir || 0, rd(s.pflege || 0, 2), s.frei ? 1 : 0, rd(s.tFrei || 0, 2)];
        }
        liste.push([mz ? mz.purzel.anzahl : 0, z ? z.punkte : 0, c.mult, rd(c.rest, 1), u ? rd(u.zustand, 1) : 100, u ? rd(u.gesundheit, 1) : 100, fl,
          p ? rd(p.gier, 3) : 0, p ? rd(p.salto, 3) : 0, p ? rd(p.hoehe, 3) : 0, p ? rd(p.nick, 3) : 0, rd(meter, 0), sz,
          z && z.neuPose ? z.neuPose.code : 0, z && z.neuPose ? rd(z.neuPose.p, 3) : 0]);        // S3: [13] neuer Trick (1 Superman · 2 Handstand · 3 Backflip), [14] Fortschritt
      }
      return liste;
    },

    /** ich.mu: [Motorrad %, Fahrer %, Haltebremse 0/1] von Teilnehmer i, ungerundet (null im Modus „Unfälle aus“). */
    ich(i) {
      const un = sim.unfall, u = un && un.fz[i];
      if (!u || un.modus === 'aus') return null;
      return [u.zustand, u.gesundheit, u.halteBremse ? 1 : 0];
    },

    /** Stuntpunkte von Teilnehmer nr (für die Ergebnistafel). */
    punkte(nr) { const z = sim.stunt && sim.stunt.fz[nr]; return z ? z.punkte : 0; },

    /** Bogenlänge der beiden Stationen (Gegenprobe: der Browser baut sie selbst und muss auf dieselben Plätze kommen). */
    stationenInfo() { return stationen ? { w: rd(stationen.werkstatt.platz.s, 2), k: rd(stationen.kranken.platz.s, 2) } : null; },
  };
  return moto;
}

module.exports = { einbauen, MAX_TEILNEHMER };
