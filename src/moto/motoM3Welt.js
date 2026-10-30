// ============================================================
// Motorrad M3 – Stunt-Park + neue Bodenelemente (Steilwand, Schlamm, Wasser, Kistenstapel).
//
// Stunt-Park: eigene Strecke 'stuntpark' (Stadion-Form: zwei 360-m-Geraden, zwei Halbkreise R 100 m, 40 m breit, flach) mit einer offenen Wiese
//   drumherum. Läuft als normales „Rennen“ ohne Gegner und mit praktisch unendlich vielen Runden (motoM3Start.js): kein Rennen-Ende, keine KI.
//   Die Strecke wird NICHT dauerhaft in R.trackCatalog eingetragen (sie soll nicht in der Streckenwahl stehen), sondern nur für die Dauer von
//   rennenStarten (motoM3Start.js). Schanzen/Feuerring/Bus-Reihe/Wheelie-Zonen laufen über die vorhandenen Mechaniken (track/schanze.js, stuntWelt.js):
//   schanzen: [{ s, winkel, laenge, moto: { ring | reihe } }], motoZonen: [{ s0, s1, art }].
//
// Neue Elemente (Daten in der Strecke: daten.motoFelder / daten.motoKisten; alles ohne Zufall, deterministisch):
//   Steilwand   = Schanze mit 28° / 6 m (vorhandene Rampen-Physik: hochfahren, abheben, in der Luft Trick-Taste = Drehung/Salto) plus Seitenwände + Bogen.
//   Schlamm     Feld { art, s, laenge, q0, q1 }: bremst (Tempo × e^(−1,15·dt)), braune Spritzer.
//   Wasser      Feld wie Schlamm: bremst leicht (e^(−0,4·dt)), Spritzwasser.
//   Kisten      Stapel { s, q } (3-2-1 = 6 Kisten): beim Durchfahren (Tempo ≥ 3 m/s, ≤ 1,6 m) fliegen sie weg, +150 Stuntpunkte; nach 8 s wieder da.
// Wirkung auf das Tempo nur über moto-eigene Haken (physikSchritt-Umhüllung in motoM3Start.js), die Autorennen-Physik bleibt unverändert.
// Reine Funktionen (Node-Test): parkPunkte, parkEintrag, felder, feldBei, feldFaktor, kistenListe, kistenNeu, kistenTreffer, kistenSchritt.
// Grafik (braucht THREE): bauen(strecke) → Gruppe 'MotoPark' (Schlamm + Wasser + Steilwand-Seiten je 1 Mesh, Kisten 1 InstancedMesh, Schild je 1 Mesh).
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};
  R.config = R.config || {};

  R.config.motoM3 = {
    park: { id: 'stuntpark', breite: 40, gerade: 360, radius: 100, runden: 999 },
    feld: { schlamm: { bremse: 1.15, spritz: 26 }, wasser: { bremse: 0.4, spritz: 80 } },        // FIX3: Wasser spritzt kräftig (80 statt 30 Tropfen je s); bremse = Tempoverlust je Sekunde (Exponent), spritz = Tropfen je Sekunde
    kisten: { radius: 1.6, minTempo: 3, punkte: 150, erneuerung: 8, flugzeit: 1.8, proStapel: 6, seite: 0.7 },
    steilwand: { winkel: 28, laenge: 6 },
  };
  const C = () => R.config.motoM3;

  // ---------- Stunt-Park: Strecke ----------
  /** Mittellinie (Stadion): Start (0,0) → −z über die Gerade, rechter Halbkreis, zurück über die zweite Gerade, zweiter Halbkreis. */
  function parkPunkte() {
    const c = C().park, Ls = c.gerade, Rr = c.radius, p = [];
    for (let z = 0; z > -Ls; z -= 40) p.push([0, 0, Math.round(z * 10) / 10]);
    for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 12) * Math.PI; p.push([Math.round((Rr + Rr * Math.cos(a)) * 10) / 10, 0, Math.round((-Ls + Rr * Math.sin(a)) * 10) / 10]); }
    for (let z = -Ls; z < 0; z += 40) p.push([2 * Rr, 0, Math.round(z * 10) / 10]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI; p.push([Math.round((Rr + Rr * Math.cos(a)) * 10) / 10, 0, Math.round((Rr * Math.sin(a)) * 10) / 10]); }
    return p;
  }

  const AUS = { hindernisse: false, wracks: false, strohballen: false, spuren: false, schanzen: false, baelle: false, wasserstrahlen: false, boost: false, schild: false, loopings: false, kleber: false, dinos: false };

  /** Katalogeintrag 'stuntpark' (frisch erzeugt). s in m ab Start: Gerade 1 0–360, Bogen 360–674, Gerade 2 674–1034, Bogen 1034–1348. */
  function parkEintrag() {
    const c = C().park, sw = C().steilwand;
    return {
      id: c.id, name: 'Stunt-Park', emoji: '🎪', thema: 'wiese',
      beschreibung: 'Offene Spielwiese ohne Gegner: Schanzen, Feuerring, Steilwand, Schlamm, Wasser und Kisten.',
      schwierigkeit: 'leicht', breite: c.breite, randBreite: 1.5, zaunAbstand: 32, checkpointAbstand: 120, zielRundenzeit: 150,
      abseitsUntergrund: 'gras', weltStandard: 'klassisch', welten: { klassisch: Object.assign({}, AUS, { schanzen: true }) },
      huegel: [],
      schanzen: [
        { s: 150, winkel: 8, laenge: 10 },
        { s: 240, winkel: 12, laenge: 10, moto: { ring: true } },
        { s: 760, winkel: sw.winkel, laenge: sw.laenge, moto: { steilwand: true } },
        { s: 880, winkel: 12, laenge: 16, moto: { reihe: { art: 'bus', n: 3 } } },
      ],
      motoZonen: [{ s0: 690, s1: 735, art: 'wheelie' }, { s0: 965, s1: 1015, art: 'stoppie' }],
      motoFelder: [
        { art: 'schlamm', s: 470, laenge: 32, q0: -15, q1: 15 },
        { art: 'wasser', s: 1118, laenge: 36, q0: -15, q1: 15 },
      ],
      motoKisten: [{ s: 70, q: -11 }, { s: 70, q: 0 }, { s: 70, q: 11 }, { s: 585, q: -10 }, { s: 585, q: 10 }, { s: 1250, q: -9 }, { s: 1250, q: 9 }, { s: 1250, q: 0 }],
      punkte: parkPunkte(),
    };
  }

  // ---------- Felder (Schlamm/Wasser) ----------
  /** Felder einer Strecke [{ art, s0, laenge, q0, q1 }] (aus strecke.daten.motoFelder, s auf die Streckenlänge gewickelt). */
  function felder(strecke) {
    const d = (strecke && strecke.daten && strecke.daten.motoFelder) || [], sp = strecke && strecke.spline;
    return d.map((f) => ({ art: f.art, s0: sp ? sp.wrapS(f.s) : f.s, laenge: f.laenge, q0: f.q0, q1: f.q1 }));
  }
  /** Liegt Bogenlänge s / Seitenabstand q in einem Feld? Rückgabe das Feld oder null. sp = Spline (differenzS). */
  function feldBei(liste, sp, s, q) {
    for (let i = 0; i < liste.length; i++) {
      const f = liste[i], a = sp.differenzS(s, f.s0);
      if (a >= 0 && a <= f.laenge && q >= f.q0 && q <= f.q1) return f;
    }
    return null;
  }
  /** Tempo-Faktor eines Physikschritts im Feld (Schlamm bremst stark, Wasser leicht). */
  function feldFaktor(art, dt) {
    const k = C().feld[art];
    return k && dt > 0 ? Math.exp(-k.bremse * dt) : 1;
  }

  // ---------- Kistenstapel ----------
  // Stapel 3-2-1 aus 0,7-m-Kisten, in Streckenrichtung ausgerichtet (lokal: x quer, y hoch).
  const KISTE = 0.7;
  const KISTEN_LOKAL = [[-0.75, 0.35], [0, 0.35], [0.75, 0.35], [-0.375, 1.05], [0.375, 1.05], [0, 1.75]];
  /** Welt-Lage der Stapel [{ nr, x, z, tx, tz, nx, nz, s, q }] aus strecke.daten.motoKisten. */
  function kistenListe(strecke) {
    const d = (strecke && strecke.daten && strecke.daten.motoKisten) || [], sp = strecke && strecke.spline;
    return d.map((k, nr) => { const p = sp.punktBei(k.s); return { nr, s: k.s, q: k.q, x: p.x + p.nx * k.q, z: p.z + p.nz * k.q, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz }; });
  }
  /** Zustand aller Stapel: je Stapel { aktiv (steht), t (seit dem Treffer), kisten: [{ x, y, z, vx, vy, vz, rot, drehung }] }. */
  function kistenNeu(stapel) {
    return stapel.map((st) => ({ nr: st.nr, steht: true, t: 0, kisten: KISTEN_LOKAL.map(() => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, drehung: 0 })) }));
  }
  /** Weltposition der Kiste k im Stapel (steht). */
  function kistePos(st, k) {
    const l = KISTEN_LOKAL[k];
    return { x: st.x + st.nx * l[0], y: l[1], z: st.z + st.nz * l[0] };
  }
  /**
   * Trifft das Fahrzeug (x, z, Tempo) einen stehenden Stapel? Gibt den Stapel-Index oder −1. Nur bei Tempo ≥ minTempo (Stehen/Schleichen zerlegt nichts).
   */
  function kistenTreffer(stapel, zust, x, z, tempo) {
    const c = C().kisten;
    if (!(tempo >= c.minTempo)) return -1;
    for (let i = 0; i < stapel.length; i++) {
      if (!zust[i].steht) continue;
      const dx = x - stapel[i].x, dz = z - stapel[i].z;
      if (dx * dx + dz * dz <= c.radius * c.radius) return i;
    }
    return -1;
  }
  /** Stapel i fliegt weg: Kisten bekommen Geschwindigkeiten in Fahrtrichtung (richtung = Einheitsvektor) plus feste, ungleiche Seiten-/Hochanteile. */
  function kistenWegschleudern(stapel, zust, i, richtung, tempo) {
    const st = stapel[i], z = zust[i];
    z.steht = false; z.t = 0;
    z.kisten.forEach((k, n) => {
      const p = kistePos(st, n), seite = ((n * 37) % 11 - 5) / 5, hoch = 3 + (n % 3) * 1.4 + (n >= 3 ? 1.2 : 0);
      k.x = p.x; k.y = p.y; k.z = p.z;
      const v = Math.min(tempo, 30) * (0.45 + 0.08 * (n % 4));
      k.vx = richtung.x * v + st.nx * seite * 3.2; k.vz = richtung.z * v + st.nz * seite * 3.2; k.vy = hoch;
      k.rot = 0; k.drehung = (n % 2 ? 1 : -1) * (4 + n);
    });
  }
  /** Flug (Schwerkraft, kein Abprall) und Erneuerung. Gibt true zurück, wenn ein Stapel gerade wieder aufgebaut wurde. */
  function kistenSchritt(zust, dt) {
    const c = C().kisten; let neu = false;
    zust.forEach((z) => {
      if (z.steht) return;
      z.t += dt;
      z.kisten.forEach((k) => {
        k.vy -= 9.81 * dt; k.x += k.vx * dt; k.y = Math.max(KISTE / 2, k.y + k.vy * dt); k.z += k.vz * dt; k.rot += k.drehung * dt;
        if (k.y <= KISTE / 2 + 1e-6) { k.vx *= 0.9; k.vz *= 0.9; k.drehung *= 0.9; }
      });
      if (z.t >= c.erneuerung) { z.steht = true; z.t = 0; neu = true; }
    });
    return neu;
  }

  // ============================================================
  // Grafik (nur mit THREE)
  // ============================================================
  const ANIM = { t: 0 };
  // FIX3: Wasser-Optik (Konfig): große glitzernde Fläche mit Wellen, Gischt-Rand, Hinweisschild davor
  R.config.motoM3.wasserBild = {
    hoehe: 0.09,               // m über der Fahrbahn
    deckkraft: 0.93, kachel: 6, fliess: 0.16,        // Deckkraft, Kachelgröße der Textur (m), Wellen-Geschwindigkeit
    gischtBreite: 0.7,         // m Schaumrand an beiden Seiten
    glitzerDichte: 0.12, glitzerGroesse: 0.85,       // Glitzer-Sterne je m², Größe (m)
    schild: true, schildAbstand: 28, schildB: 6.5, schildH: 1.7, schildHoehe: 3.3,   // Schild „WASSER“/„SCHLAMM“ 28 m vor dem Feld, beidseitig
  };
  /** Seamless-Textur: Wasserfläche (Verlauf, Wellenlinien, Glitzer) bzw. weißer Schaum (schaum = true). Nur im Browser. */
  function wasserTextur(schaum) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    if (schaum) {
      g.clearRect(0, 0, 256, 256);
      const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0.15)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(190,225,255,0.35)'; g.beginPath(); g.arc((i * 97) % 256, (i * 61) % 256, 5 + (i % 4) * 3, 0, 6.2832); g.fill(); }
    } else {
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#1f8fe8'); gr.addColorStop(0.5, '#3fb4ff'); gr.addColorStop(1, '#1f8fe8');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.lineCap = 'round';
      for (let r = 0; r < 8; r++) {        // Wellenlinien (Periode teilt 256 → nahtlos)
        const y0 = r * 32 + 8, ph = r * 1.7, hell = r % 2 ? 'rgba(255,255,255,0.75)' : 'rgba(210,240,255,0.55)';
        g.strokeStyle = hell; g.lineWidth = r % 2 ? 5 : 3; g.beginPath();
        for (let x = 0; x <= 256; x += 4) { const y = y0 + 5 * Math.sin(x / 256 * 6.2832 * 2 + ph); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {       // helle Glanzpunkte
        const x = (i * 151) % 256, y = (i * 83 + 17) % 256, rr = 3 + (i % 3) * 2; g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x, y, rr, 0, 6.2832); g.fill();
      }
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  /** Vierzackiger Glitzerstern (für die Punkte). */
  function sternTextur() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const rd = g.createRadialGradient(32, 32, 0, 32, 32, 14); rd.addColorStop(0, 'rgba(255,255,255,1)'); rd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rd; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 2); g.lineTo(36, 28); g.lineTo(62, 32); g.lineTo(36, 36); g.lineTo(32, 62); g.lineTo(28, 36); g.lineTo(2, 32); g.lineTo(28, 28); g.closePath(); g.fill();
    return new THREE.CanvasTexture(cv);
  }
  /** Hinweisschild: „WASSER“ (blau, Tropfen) bzw. „SCHLAMM“ (braun). */
  function schildTextur(art) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 136; const g = cv.getContext('2d');
    const wasser = art === 'wasser';
    g.fillStyle = wasser ? '#0c6fd6' : '#7a4a22'; g.fillRect(0, 0, 512, 136); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 120);
    if (wasser) {     // Tropfen (wie 💧, gezeichnet – braucht keine Emoji-Schrift)
      const tropf = (cx, cy, k) => { g.fillStyle = '#bfe8ff'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - 34 * k); g.bezierCurveTo(cx + 8 * k, cy - 14 * k, cx + 26 * k, cy + 2 * k, cx + 26 * k, cy + 16 * k);
        g.bezierCurveTo(cx + 26 * k, cy + 34 * k, cx - 26 * k, cy + 34 * k, cx - 26 * k, cy + 16 * k); g.bezierCurveTo(cx - 26 * k, cy + 2 * k, cx - 8 * k, cy - 14 * k, cx, cy - 34 * k); g.closePath(); g.fill(); g.stroke(); };
      tropf(62, 68, 1.1); tropf(450, 68, 1.1);
    }
    g.fillStyle = '#fff'; g.font = 'bold 76px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(wasser ? 'WASSER' : 'SCHLAMM', 256, 72);
    const t = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function bauen(strecke) {
    if (typeof THREE === 'undefined') return null;
    const gruppe = new THREE.Group(); gruppe.name = 'MotoPark'; gruppe.userData.anim = [];
    const sp = strecke.spline, quad = new THREE.PlaneGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1);
    const E = new THREE.Euler(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Mx = new THREE.Matrix4(), col = new THREE.Color();
    const sammler = () => {
      const pos = [], nor = [], farb = [];
      return {
        add(geo, m4, hex) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m4); const p = g.attributes.position.array, n = g.attributes.normal.array; col.set(hex);
          for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } for (let i = 0; i < p.length / 3; i++) farb.push(col.r, col.g, col.b); g.dispose(); },
        geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(farb, 3)); return g; },
        leer() { return pos.length === 0; },
      };
    };
    const mat = (px, py, pz, ry, sx, sy, sz, rx) => { E.set(rx || 0, ry || 0, 0, 'YXZ'); Q.setFromEuler(E); P.set(px, py, pz); S.set(sx, sy, sz); return new THREE.Matrix4().compose(P, Q, S); };
    const kopf = (tx, tz) => Math.atan2(tx, tz);

    // Felder: Streifen aus kleinen Vierecken entlang der Strecke (folgt der Kurve)
    const fl = felder(strecke), schl = sammler();
    const wGeo = { pos: [], uv: [] }, gGeo = { pos: [], uv: [] }, glitzer = [], feldSchilder = [];   // FIX3: Wasser = eigene Fläche mit Wellen-Textur + Gischt-Rand + Glitzer + Hinweisschild
    const WC = C().wasserBild;
    const quad4 = (G, a0, a1, b0, b1, y, u0, u1, v0, v1) => {      // Viereck zwischen Querschnitt a (q a0..a1) und b (q b0..b1); Punkte p1/p2 = Querschnitte
      G.pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
      G.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    fl.forEach((f) => {
      const n = Math.max(1, Math.ceil(f.laenge / 3)), h = f.laenge / n;
      if (f.art === 'wasser') {
        const rand = WC.gischtBreite, punkt = (s, q) => { const p = sp.punktBei(s), x = p.x + p.nx * q, z = p.z + p.nz * q; return { x, y: strecke.hoeheAn(x, z) + WC.hoehe, z }; };
        for (let i = 0; i < n; i++) {
          const sa = f.s0 + i * h, sb = sa + h * 1.02, va = (i * h) / WC.kachel, vb = ((i + 1) * h) / WC.kachel, ua = 0, ub = (f.q1 - f.q0) / WC.kachel;
          quad4(wGeo, punkt(sa, f.q0), punkt(sa, f.q1), punkt(sb, f.q0), punkt(sb, f.q1), 0, ua, ub, va, vb);
          const y2 = (P) => { P.y += 0.012; return P; };      // Gischt knapp über dem Wasser
          quad4(gGeo, y2(punkt(sa, f.q0)), y2(punkt(sa, f.q0 + rand)), y2(punkt(sb, f.q0)), y2(punkt(sb, f.q0 + rand)), 0, 0, 1, va, vb);
          quad4(gGeo, y2(punkt(sa, f.q1 - rand)), y2(punkt(sa, f.q1)), y2(punkt(sb, f.q1 - rand)), y2(punkt(sb, f.q1)), 0, 0, 1, va, vb);
        }
        // Glitzer-Sterne: feste Plätze (kein Zufall im Spiel: einfache Zahlenfolge), blinken in zwei Gruppen
        const anz = Math.round(f.laenge * (f.q1 - f.q0) * WC.glitzerDichte);
        for (let k = 0; k < anz; k++) {
          const u1 = ((k * 0.6180339887) % 1), u2 = ((k * 0.7548776662 + 0.31) % 1), p = sp.punktBei(f.s0 + u1 * f.laenge), q = f.q0 + 0.4 + u2 * (f.q1 - f.q0 - 0.8), x = p.x + p.nx * q, z = p.z + p.nz * q;
          glitzer.push({ x, y: strecke.hoeheAn(x, z) + WC.hoehe + 0.18, z, g: k % 2 });
        }
      } else {
        const ziel = schl;
        for (let i = 0; i < n; i++) {
          const p = sp.punktBei(f.s0 + (i + 0.5) * h), qm = (f.q0 + f.q1) / 2, br = f.q1 - f.q0, y = strecke.hoeheAn(p.x + p.nx * qm, p.z + p.nz * qm) + 0.07;
          const grund = i % 2 ? 0x6b4423 : 0x7a5230;
          ziel.add(quad, mat(p.x + p.nx * qm, y, p.z + p.nz * qm, kopf(p.tx, p.tz), br, h * 1.02, 1, -Math.PI / 2), grund);
          if (i % 3 === 1) ziel.add(quad, mat(p.x + p.nx * (qm + 3), y + 0.004, p.z + p.nz * (qm + 3), kopf(p.tx, p.tz) + 0.4, 4.5, 2.2, 1, -Math.PI / 2), 0x5a381c);    // dunkle Pfützen
        }
      }
      // Hinweisschild davor (beidseitig der Fahrbahn), FIX3
      if (WC.schild) { const ps = sp.punktBei(f.s0 - WC.schildAbstand); feldSchilder.push({ art: f.art, x: ps.x, z: ps.z, nx: ps.nx, nz: ps.nz, tx: ps.tx, tz: ps.tz, g: strecke.hoeheAn(ps.x, ps.z) }); }
    });
    const flaechenMat = (opa) => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: opa < 1, opacity: opa, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: opa >= 1 });
    if (!schl.leer()) { const m = new THREE.Mesh(schl.geo(), flaechenMat(1)); m.name = 'Schlamm'; gruppe.add(m); }
    if (wGeo.pos.length && typeof document !== 'undefined') {
      const geoNeu = (G) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2)); return g; };
      const tex = wasserTextur(), gt = wasserTextur(true);
      const wm = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: WC.deckkraft, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
      const m = new THREE.Mesh(geoNeu(wGeo), wm); m.name = 'Wasser'; m.renderOrder = 2; gruppe.add(m);
      const gm = new THREE.MeshBasicMaterial({ map: gt, side: THREE.DoubleSide, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
      const gmesh = new THREE.Mesh(geoNeu(gGeo), gm); gmesh.name = 'Gischt'; gmesh.renderOrder = 3; gruppe.add(gmesh);
      gruppe.userData.anim.push((t) => { tex.offset.y = -t * WC.fliess; tex.offset.x = 0.06 * Math.sin(t * 0.9); gt.offset.y = -t * WC.fliess * 1.6; wm.opacity = WC.deckkraft - 0.05 + 0.05 * Math.sin(t * 2.2); });
      if (glitzer.length) {
        const sterne = [0, 1].map((g) => {
          const pos = []; glitzer.forEach((e) => { if (e.g === g) pos.push(e.x, e.y, e.z); });
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          const pm = new THREE.PointsMaterial({ size: WC.glitzerGroesse, map: sternTextur(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 1 });
          const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; pts.name = 'Glitzer'; pts.renderOrder = 4; gruppe.add(pts); return pm;
        });
        gruppe.userData.anim.push((t) => { sterne[0].opacity = 0.15 + 0.85 * Math.max(0, Math.sin(t * 4.1)); sterne[1].opacity = 0.15 + 0.85 * Math.max(0, Math.sin(t * 4.1 + 3.14)); });
      }
    }
    if (feldSchilder.length && typeof document !== 'undefined') {
      const tafeln = {}, geoS = new THREE.PlaneGeometry(WC.schildB, WC.schildH), pfostenMat = new THREE.MeshLambertMaterial({ color: 0x55565e }), halb = (strecke.breite || 12) / 2;
      feldSchilder.forEach((sc) => {
        const tm = tafeln[sc.art] || (tafeln[sc.art] = new THREE.MeshBasicMaterial({ map: schildTextur(sc.art), side: THREE.DoubleSide }));
        [-1, 1].forEach((sg) => {
          const q = sg * (halb + 1.6), x = sc.x + sc.nx * q, z = sc.z + sc.nz * q, ry = kopf(sc.tx, sc.tz) + Math.PI, y0 = strecke.hoeheAn(x, z);
          const m = new THREE.Mesh(geoS, tm); m.position.set(x, y0 + WC.schildHoehe, z); m.rotation.y = ry; gruppe.add(m);
          [-1, 1].forEach((pk) => { const po = new THREE.Mesh(box, pfostenMat); po.scale.set(0.2, WC.schildHoehe, 0.2); po.position.set(x + sc.nx * pk * WC.schildB * 0.4, y0 + WC.schildHoehe / 2, z + sc.nz * pk * WC.schildB * 0.4); po.rotation.y = ry; gruppe.add(po); });
        });
      });
      gruppe.userData.schilder = feldSchilder.length;
    }

    // Steilwand: Seitenwände (Dreiecksprismen an den Fahrbahnrändern) + Bogen mit Schild
    const sw = sammler(), schilder = [];
    (strecke.schanzen || []).forEach((e, i) => {
      if (!e.moto || !e.moto.steilwand) return;
      const L = R.Schanzen ? R.Schanzen.liste(strecke)[i] : null; if (!L) return;
      const p0 = sp.punktBei(L.s), halb = strecke.breite / 2;
      [-1, 1].forEach((sg) => {
        const q = sg * (halb + 0.3), n = 6;
        for (let k = 0; k < n; k++) {         // Treppenwand: Stufen folgen dem Anstieg (Höhe 0 → Rampenhöhe)
          const a = (k + 0.5) / n * L.laenge, h = (k + 1) / n * L.hoehe, pk = sp.punktBei(L.s + a);
          sw.add(box, mat(pk.x + pk.nx * q, strecke.hoeheAn(pk.x, pk.z) + h / 2, pk.z + pk.nz * q, kopf(pk.tx, pk.tz), 0.6, h, L.laenge / n + 0.02), k % 2 ? 0xffd23a : 0xff6a10);
        }
        sw.add(box, mat(p0.x + p0.nx * sg * (halb + 1.2) - p0.tx * 6, strecke.hoeheAn(p0.x, p0.z) + 2.6, p0.z + p0.nz * sg * (halb + 1.2) - p0.tz * 6, kopf(p0.tx, p0.tz), 0.3, 5.2, 0.3), 0x55565e);      // Mast
      });
      const pm = sp.punktBei(L.s - 6);
      schilder.push({ x: pm.x, z: pm.z, y: strecke.hoeheAn(pm.x, pm.z) + 5.4, ry: kopf(pm.tx, pm.tz) + Math.PI });
    });
    if (!sw.leer()) { const m = new THREE.Mesh(sw.geo(), new THREE.MeshLambertMaterial({ vertexColors: true })); m.name = 'SteilwandSeiten'; gruppe.add(m); }
    if (schilder.length && typeof document !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
      g.fillStyle = '#ff6a10'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 112);
      g.fillStyle = '#fff'; g.font = 'bold 66px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STEILWAND', 256, 68);
      const tex = new THREE.CanvasTexture(cv), geo = new THREE.PlaneGeometry(9, 2.25), sm = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      schilder.forEach((s) => { const m = new THREE.Mesh(geo, sm); m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry; gruppe.add(m); });
    }

    // Kisten: ein InstancedMesh für alle Stapel
    const stapel = kistenListe(strecke);
    if (stapel.length) {
      const n = stapel.length * KISTEN_LOKAL.length, im = new THREE.InstancedMesh(new THREE.BoxGeometry(KISTE, KISTE, KISTE), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      im.name = 'Kisten'; im.frustumCulled = false;
      const farben = [0xe9a23b, 0xf2c14e, 0xd9822b, 0xf0b35a];
      for (let i = 0; i < n; i++) im.setColorAt(i, col.set(farben[i % farben.length]));
      const zust = kistenNeu(stapel), m4 = new THREE.Matrix4(), eul = new THREE.Euler(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
      const setze = (si, k, x, y, z, ry, rot) => { eul.set(rot || 0, ry, 0, 'YXZ'); qq.setFromEuler(eul); pp.set(x, y, z); m4.compose(pp, qq, sc); im.setMatrixAt(si * KISTEN_LOKAL.length + k, m4); };
      const alle = () => { stapel.forEach((st, si) => { const ry = kopf(st.tx, st.tz); for (let k = 0; k < KISTEN_LOKAL.length; k++) { const p = kistePos(st, k); setze(si, k, p.x, strecke.hoeheAn(st.x, st.z) + p.y, p.z, ry, 0); } }); im.instanceMatrix.needsUpdate = true; };
      alle();
      gruppe.add(im);
      gruppe.userData.kisten = { stapel, zust, im, setze, alle, kopf, strecke };
    }
    quad.dispose(); box.dispose();
    return gruppe;
  }

  /** Je Bild: Wasser-Wellen und fliegende Kisten nachführen. */
  function animieren(gruppe, dt) {
    if (!gruppe || !gruppe.userData) return;
    ANIM.t += dt || 0;
    (gruppe.userData.anim || []).forEach((f) => f(ANIM.t));
    const K = gruppe.userData.kisten;
    if (!K) return;
    const erneuert = kistenSchritt(K.zust, dt || 0);
    let aktiv = erneuert;
    K.zust.forEach((z, si) => {
      const st = K.stapel[si], ry = K.kopf(st.tx, st.tz), g0 = K.strecke.hoeheAn(st.x, st.z);
      if (z.steht) { if (z._zeigt !== 'steht') { z._zeigt = 'steht'; for (let k = 0; k < KISTEN_LOKAL.length; k++) { const p = kistePos(st, k); K.setze(si, k, p.x, g0 + p.y, p.z, ry, 0); } aktiv = true; } return; }
      z._zeigt = 'fliegt'; aktiv = true;
      z.kisten.forEach((k, n) => K.setze(si, n, k.x, g0 + k.y, k.z, ry, k.rot));
    });
    if (aktiv) K.im.instanceMatrix.needsUpdate = true;
  }

  R.Moto.m3welt = { parkPunkte, parkEintrag, felder, feldBei, feldFaktor, kistenListe, kistenNeu, kistePos, kistenTreffer, kistenWegschleudern, kistenSchritt, KISTEN_LOKAL, KISTE, bauen, animieren };
})();
