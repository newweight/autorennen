/* Zug-Animation, Kampfszenen und Effekte (Board3DView.animateMove/playFight/Effekte, SchachSpiel.swift ~5365–5900).
 * Erweitert Schach3D.prototype. Zeiten, Höhen und Reihenfolgen 1:1 aus dem Swift-Code. */
(function (g) {
  'use strict';
  const THREE = g.THREE, A = g.Schach3DAktionen, F = g.Figuren3D, S = g.Schach3D, P = S.prototype;
  const PI = Math.PI;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const col = (r, gg, b) => new THREE.Color().setRGB(r, gg, b, THREE.SRGBColorSpace);
  const sqKey = (r, c) => r * 8 + c;
  const typVon = p => (p && (p.type || p)) || null;

  // ------------------------------------------------------------------ Zug berechnen (ohne Regeln: nur Mechanik)
  function nachZug(vor, z) {
    const n = vor.map(r => r.slice());
    const f = z.from, t = z.to, p = vor[f.row][f.col];
    if (!p) return n;
    n[f.row][f.col] = null;
    if (z.isEnPassant) n[f.row][t.col] = null;
    if (z.isCastling) {
      const rf = t.col === 6 ? 7 : 0, rt = t.col === 6 ? 5 : 3;
      n[f.row][rt] = n[f.row][rf]; n[f.row][rf] = null;
    }
    const promo = z.promotion ? typVon(z.promotion) : null;
    n[t.row][t.col] = promo ? { color: p.color, type: promo } : p;
    return n;
  }

  // ------------------------------------------------------------------ Zug-Animation
  /** zug: { from:{row,col}, to:{row,col}, capturedPiece?, isCastling?, isEnPassant?, promotion? } → Promise (fertig nach der Kampfszene) */
  P.animiereZug = function (zug) {
    return new Promise(resolve => {
      if (this._animiert) this._beendeSofort();
      const vor = this.gitter;
      if (!vor) { resolve(); return; }
      const nach = nachZug(vor, zug);
      this._sync(vor);
      const from = zug.from, to = zug.to;
      const mover = this.pieces.get(sqKey(from.row, from.col)), mp = vor[from.row][from.col];
      if (!mover || !mp) { this._sync(nach); resolve(); return; }
      const token = ++this._token;
      this._animiert = true; this._pendingGrid = nach; this._abschluss = resolve; this._abschlussZug = { farbe: mp.color };
      this._pendingPromo = zug.promotion ? { row: to.row, col: to.col } : null;

      let vpos = null;
      if (zug.isEnPassant) vpos = { row: from.row, col: to.col };
      else if (zug.capturedPiece || vor[to.row][to.col]) vpos = { row: to.row, col: to.col };
      const victim = vpos ? this.pieces.get(sqKey(vpos.row, vpos.col)) : null;
      const vp = vpos ? vor[vpos.row][vpos.col] : null;
      this.pieces.delete(sqKey(from.row, from.col));
      if (vpos) this.pieces.delete(sqKey(vpos.row, vpos.col));
      // Namensschild wandert mit
      const tag = this._tags.get(sqKey(from.row, from.col));
      this._tags.delete(sqKey(from.row, from.col));
      if (vpos) this._tags.delete(sqKey(vpos.row, vpos.col));
      if (victim) for (const ch of [...victim.children]) if (ch.name === 'namensschild') victim.remove(ch);
      if (tag) this._tags.set(sqKey(to.row, to.col), tag);

      if (zug.isCastling) {
        const row = from.row, rf = { row, col: to.col === 6 ? 7 : 0 }, rt = { row, col: to.col === 6 ? 5 : 3 };
        const rook = this.pieces.get(sqKey(rf.row, rf.col));
        if (rook) {
          this.pieces.delete(sqKey(rf.row, rf.col)); this.pieces.set(sqKey(rt.row, rt.col), rook); rook.userData.sq = [rt.row, rt.col];
          this.akt.run(rook, A.seq(A.warte(0.12), A.bogen(rook.position.clone(), this.squareCenter(rt.row, rt.col), 0.75, 0.5), A.stauchen(0.16)));
        }
      }

      let dauer;
      if (victim && vp && vpos && this._kampf) dauer = this._kampfSzene(mover, mp.type, victim, vp, from, to, vpos);
      else dauer = this._einfacherZug(mover, mp.type, from, to, victim);

      this.akt.nach(dauer, () => {
        if (this._token !== token) return;
        if (victim) { if (victim.parent) victim.parent.remove(victim); this._entsorge(victim); }
        this.akt.stopp(mover);
        this.pieces.set(sqKey(to.row, to.col), mover); mover.userData.sq = [to.row, to.col];
        this._abschliessen(true);
      });
    });
  };

  P._entsorge = function (n) {
    if (n.userData._eigeneMat) for (const m of n.userData._eigeneMat) m.dispose();
  };

  /** Laufende Animation sofort beenden (z.B. bei „Neu“ oder „Zurück“) */
  P._beendeSofort = function () {
    if (!this._animiert) return;
    this._token++;
    this.akt.alleStoppen();
    this._shake = null; this._kameraAktualisieren();
    for (const f of this._fx) if (f.ende) f.ende();
    this._fx = [];
    this.fxRoot.clear();
    this._abschliessen(false);
  };
  P.beendeAnimation = P._beendeSofort;

  P._abschliessen = function (natuerlich) {
    this._animiert = false;
    const b = this._pendingGrid || this.gitter;
    this._pendingGrid = null;
    this._sync(b);
    const pp = this._pendingPromo; this._pendingPromo = null;
    if (pp) {
      const n = this.pieces.get(sqKey(pp.row, pp.col));
      if (n) {
        n.scale.setScalar(0.2); this.akt.run(n, A.skalieren(1.0, 0.35));
        const p = this.squareCenter(pp.row, pp.col); p.y = 0.6;
        this._burst(p, col(1, 0.85, 0.3), 70, 2.2);
        this._blitz(p, col(1, 0.9, 0.5), 1500);
      }
    }
    const r = this._abschluss, z = this._abschlussZug; this._abschluss = null; this._abschlussZug = null;
    if (natuerlich && this._auto && z) this.wenden(z.farbe === 'white');   // Gegner ist am Zug
    this._dirty = true;
    if (r) r();
  };

  P._einfacherZug = function (mover, typ, from, to, victim) {
    const a = this.squareCenter(from.row, from.col), b = this.squareCenter(to.row, to.col);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const d = Math.min(0.75, 0.30 + 0.06 * dist);
    const h = typ === 'knight' ? 0.95 : 0.16 + 0.05 * dist;
    this.akt.run(mover, A.seq(A.bogen(a, b, h, d), A.stauchen(0.16)));
    if (victim) this.akt.run(victim, A.seq(A.warte(d * 0.75), A.gruppe(A.ausblenden(0.2), A.skalieren(0.3, 0.2))));
    return d + 0.18;
  };

  // ------------------------------------------------------------------ Kampfszenen je Angreifer
  P._kampfSzene = function (att, aTyp, victim, vPiece, from, to, vSq) {
    const a = this.squareCenter(from.row, from.col), target = this.squareCenter(to.row, to.col), v = this.squareCenter(vSq.row, vSq.col);
    let dx = v.x - a.x, dz = v.z - a.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    dx /= len; dz /= len;
    const dir = V(dx, 0, dz), tip = V(dz, 0, -dx);
    const vH = F.hoehe(vPiece.type, this._hunde);
    const impact = V(v.x, vH * 0.55, v.z);
    const appDist = 0.62;
    const approach = V(v.x - dx * appDist, 0, v.z - dz * appDist);
    const appDur = Math.min(0.55, 0.22 + 0.06 * len);
    const run = (n, ak) => this.akt.run(n, ak), at = (t, fn) => this.akt.nach(t, fn);
    const Y = V(0, 1, 0);

    switch (aTyp) {
      case 'knight': {   // Sprungangriff: Salto-Sprung, landet auf dem Opfer, das zerbricht
        const jump = 0.6;
        run(att, A.seq(A.gruppe(A.bogen(a, target, 1.4, jump), A.drehen(2 * PI, Y, jump)), A.stauchen(0.22)));
        run(victim, A.seq(A.warte(jump * 0.55), A.zittern(jump * 0.4),
          A.eigen(0.1, (n, t) => { const u = Math.min(1, t / 0.1); n.scale.set(1 + 0.4 * u, Math.max(0.08, 1 - 0.92 * u), 1 + 0.4 * u); }),
          A.verstecken()));
        at(jump, () => {
          this._splitter(vPiece, v, vH, dir, 0.8);
          this._staubring(v);
          this._wuff(impact);
          this._blitz(impact, col(1, 0.8, 0.5), 1800);
          this._wackeln(0.14);
        });
        return jump + 0.95;
      }
      case 'rook': {     // Rammbock: Anlauf, Aufprall, das Opfer fliegt im hohen Bogen vom Brett
        const stop = V(v.x - dx * 0.5, 0, v.z - dz * 0.5);
        const charge = Math.min(0.6, 0.25 + 0.05 * len);
        run(att, A.seq(A.drehen(-0.18, tip, 0.12),
          A.gruppe(A.anlauf(a, stop, charge), A.drehen(0.36, tip, charge)),
          A.drehen(-0.18, tip, 0.1), A.warte(0.1),
          A.bogen(stop, target, 0.12, 0.25), A.stauchen(0.16)));
        const hitT = 0.12 + charge;
        run(victim, A.seq(A.warte(hitT),
          A.gruppe(A.wurf(v, dir, 3.4, 2.1, 0.95), A.drehen(5 * PI, tip, 0.95), A.seq(A.warte(0.6), A.ausblenden(0.35)))));
        at(hitT, () => {
          this._burst(impact, col(1, 0.6, 0.15), 90, 3.6);
          this._wuff(impact);
          this._blitz(impact, col(1, 0.7, 0.4), 2200);
          this._wackeln(0.17);
        });
        return hitT + 1.0;
      }
      case 'bishop': {   // Schwerthieb: Ausholen, diagonaler Hieb mit Lichtblitz, das Opfer zerfällt
        run(att, A.seq(A.bogen(a, approach, 0.2, appDur),
          A.drehen(-0.4, tip, 0.18), A.drehen(0.85, tip, 0.09), A.warte(0.25), A.drehen(-0.45, tip, 0.15),
          A.bogen(approach, target, 0.15, 0.28), A.stauchen(0.16)));
        const hitT = appDur + 0.27;
        run(victim, A.seq(A.warte(hitT), A.zittern(0.12),
          A.gruppe(A.drehen(0.5, V(dx, 0, dz), 0.3), A.bewegenUm(V(-dz * 0.25, -0.35, dx * 0.25), 0.35), A.ausblenden(0.35))));
        at(hitT, () => {
          this._hieb(impact, dir);
          this._wuff(impact);
          this._splitter(vPiece, v, vH, dir, 0.4);
          this._burst(impact, col(0.6, 0.9, 1), 60, 2.8);
          this._wackeln(0.1);
        });
        return hitT + 0.95;
      }
      case 'queen': {    // Magie: Die Dame steigt auf und dreht sich, das Opfer schwebt, leuchtet und implodiert
        const rise = 0.45;
        const up = V(approach.x, 0.45, approach.z);
        run(att, A.seq(A.bogen(a, approach, 0.25, appDur),
          A.gruppe(A.bewegenNach(up, rise), A.drehen(2 * PI, Y, rise * 2)),
          A.warte(rise * 0.6),
          A.bogen(up, target, 0.2, 0.35), A.stauchen(0.2)));
        const mats = A.eigeneMaterialien(victim);
        const magicStart = appDur + 0.1, implodeT = appDur + rise + 0.55;
        const mdauer = implodeT - magicStart;
        run(victim, A.seq(A.warte(magicStart),
          A.gruppe(A.bewegenUm(V(0, 0.7, 0), mdauer), A.drehen(PI, Y, mdauer),
            A.eigen(mdauer, (n, t) => { const u = Math.min(1, t / mdauer); for (const m of mats) if (m.emissive) m.emissive.setRGB(0.8 * u, 0.45 * u, 1.0 * u); })),
          A.skalieren(0.01, 0.16)));
        at(magicStart, () => this._wirbel(victim));
        at(implodeT + 0.14, () => {
          const p = V(v.x, 0.7 + vH * 0.5, v.z);
          this._burst(p, col(1, 0.85, 0.35), 140, 3.2, { size: 0.06 });
          this._burst(p, col(0.75, 0.4, 1), 80, 2.0, { size: 0.05, gravity: false });
          this._blitz(p, col(0.9, 0.7, 1), 2600);
          this._wuff(p);
          this._wackeln(0.08);
        });
        return implodeT + 0.2 + 0.55;
      }
      default: {         // Bauer / König – Schubser: Anlauf, Ausholen, Stoß – das Opfer kippt um und versinkt
        const heavy = aTyp === 'king';
        run(att, A.seq(A.bogen(a, approach, 0.18, appDur),
          A.drehen(-0.3, tip, 0.14),
          A.gruppe(A.drehen(0.55, tip, 0.09), A.bewegenUm(V(dx * 0.22, 0, dz * 0.22), 0.09)),
          A.warte(0.18), A.drehen(-0.25, tip, 0.12),
          A.bogen(V(approach.x + dx * 0.22, 0, approach.z + dz * 0.22), target, 0.12, 0.25), A.stauchen(0.16)));
        const hitT = appDur + 0.23;
        run(victim, A.seq(A.warte(hitT),
          A.gruppe(A.drehen(1.5, tip, 0.38), A.bewegenUm(V(dx * 0.45, 0, dz * 0.45), 0.38)),
          A.gruppe(A.bewegenUm(V(0, -0.45, 0), 0.35), A.ausblenden(0.35))));
        at(hitT, () => {
          this._burst(impact, col(1, 0.85, 0.3), heavy ? 80 : 50, 2.6);
          this._blitz(impact, col(1, 0.85, 0.5), heavy ? 2000 : 1300);
          this._wackeln(heavy ? 0.13 : 0.07);
          this._wuff(impact);
        });
        at(hitT + 0.38, () => this._staubring(V(v.x + dx * 0.5, 0, v.z + dz * 0.5)));
        return hitT + 0.95;
      }
    }
  };

  // ------------------------------------------------------------------ Effekte
  let funkenTex = null;
  function funken() {
    if (funkenTex) return funkenTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    funkenTex = new THREE.CanvasTexture(cv); funkenTex.colorSpace = THREE.SRGBColorSpace;
    return funkenTex;
  }

  P._fxSchritt = function (dt) {
    for (const f of this._fx) f.alt += dt;
    this._fx = this._fx.filter(f => { const lebt = f.update(dt); if (!lebt && f.ende) f.ende(); return lebt; });
  };

  /** Teilchen-System (Ersatz für SCNParticleSystem). Additiv: Ausblenden über die Vertexfarbe. */
  P._teilchen = function (o) {
    const n = Math.max(4, Math.round(o.n * this.partikelFaktor));
    const posA = new Float32Array(n * 3), colA = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3), delay = new Float32Array(n), life = new Float32Array(n), basis = [];
    const cv = o.farbe;
    for (let i = 0; i < n; i++) {
      let dx = rnd(-1, 1), dy = rnd(-1, 1), dz = rnd(-1, 1);
      let l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      let sx = 0, sy = 0, sz = 0;
      const sp = o.tempo * (1 + rnd(-0.6, 0.6));
      if (o.form === 'ring') {
        const w = rnd(0, 2 * PI), r = o.radius * Math.sqrt(Math.random());
        sx = Math.cos(w) * r; sz = Math.sin(w) * r;
        const rl = Math.hypot(sx, sz) || 1;
        dx = sx / rl; dz = sz / rl; dy = rnd(0.15, 0.4);
        l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      } else if (o.form === 'kugel') { sx = dx * o.radius; sy = dy * o.radius; sz = dz * o.radius; }
      posA[i * 3] = sx; posA[i * 3 + 1] = sy; posA[i * 3 + 2] = sz;
      vel[i * 3] = dx * sp; vel[i * 3 + 1] = dy * sp; vel[i * 3 + 2] = dz * sp;
      delay[i] = o.dauerEmission ? Math.random() * o.dauerEmission : Math.random() * 0.06;
      life[i] = o.leben * (1 + rnd(-0.4, 0.4));
      const k = 1 + rnd(-0.2, 0.2);
      basis.push(new THREE.Color(Math.min(1, cv.r * k), Math.min(1, cv.g * (1 + rnd(-0.15, 0.15))), Math.min(1, cv.b * (1 + rnd(-0.2, 0.2)))));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    const additiv = o.mischung !== 'normal';
    const mat = new THREE.PointsMaterial({ size: o.groesse * 4.2, map: funken(), vertexColors: true, transparent: true, depthWrite: false, fog: false,
      blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.deckkraft || 1 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    if (o.eltern) { pts.position.copy(o.pos); o.eltern.add(pts); } else { pts.position.copy(o.pos); this.fxRoot.add(pts); }
    const grav = o.schwerkraft === false ? 0 : 6, daempf = o.daempfung || 0;
    const maxZeit = Math.max(...life) + (o.dauerEmission || 0.06);
    let t = 0;
    const f = {
      alt: 0,
      update: dt => {
        t += dt;
        const k = Math.exp(-daempf * dt);
        for (let i = 0; i < n; i++) {
          const a = t - delay[i];
          if (a < 0 || a > life[i]) { colA[i * 3] = colA[i * 3 + 1] = colA[i * 3 + 2] = 0; continue; }
          vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav * dt; vel[i * 3 + 2] *= k;
          posA[i * 3] += vel[i * 3] * dt; posA[i * 3 + 1] += vel[i * 3 + 1] * dt; posA[i * 3 + 2] += vel[i * 3 + 2] * dt;
          const u = a / life[i], fade = additiv ? (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45) : 1;
          const b = basis[i];
          colA[i * 3] = b.r * fade; colA[i * 3 + 1] = b.g * fade; colA[i * 3 + 2] = b.b * fade;
        }
        if (!additiv) mat.opacity = (o.deckkraft || 1) * Math.max(0, 1 - t / maxZeit);
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        return t < maxZeit;
      },
      ende: () => { if (pts.parent) pts.parent.remove(pts); geo.dispose(); mat.dispose(); },
    };
    f.update(0);
    this._fx.push(f);
    this._dirty = true;
  };

  P._burst = function (p, farbe, n, tempo, o) {
    o = o || {};
    this._teilchen({ pos: p, farbe, n, tempo, groesse: o.size || 0.05, leben: 0.7, schwerkraft: o.gravity !== false, form: 'punkt', radius: 0 });
  };
  /** Staubring am Boden (Landung / Umfallen) */
  P._staubring = function (p) {
    this._teilchen({ pos: V(p.x, 0.03, p.z), farbe: col(0.8, 0.72, 0.6), n: 70, tempo: 1.4, groesse: 0.12, leben: 0.8, schwerkraft: false, daempfung: 2, form: 'ring', radius: 0.3, mischung: 'normal', deckkraft: 0.65 });
  };
  /** Magischer Wirbel um eine Figur (Dame) – bewegt sich mit der Figur mit */
  P._wirbel = function (node) {
    this._teilchen({ pos: V(0, 0.45, 0), eltern: node, farbe: col(0.8, 0.5, 1), n: 110, tempo: 0.4, groesse: 0.05, leben: 0.6, schwerkraft: false, form: 'kugel', radius: 0.42, dauerEmission: 0.55 });
  };

  /** Lichtblitz: eines von 3 festen Punktlichtern (keine Shader-Neuübersetzung) */
  P._blitz = function (p, farbe, peak) {
    const l = this.blitze.find(x => x.userData.frei) || this.blitze[0];
    l.userData.frei = false; l.position.copy(p); l.color.copy(farbe);
    const spitze = peak / 55; let t = 0;
    this._fx.push({ alt: 0, update: dt => {
      t += dt; const u = t / 0.4;
      l.intensity = spitze * (u < 0.15 ? u / 0.15 : Math.max(0, 1 - (u - 0.15) / 0.85));
      if (u >= 1) { l.intensity = 0; l.userData.frei = true; return false; }
      return true;
    }, ende: () => { l.intensity = 0; l.userData.frei = true; } });
  };

  P._wackeln = function (st) { this._shake = { t: 0, dauer: 0.38, st, x: 0, y: 0 }; };

  /** Comic-„WUFF!“ beim Kampf im Hunde-Modus */
  P._wuff = function (p) {
    if (!this._hunde) return;
    const worte = ['WUFF!', 'WAU!', 'KLAFF!'], wort = worte[Math.floor(Math.random() * worte.length)];
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 150;
    const c = cv.getContext('2d');
    c.font = "900 96px 'Arial Black','Helvetica Neue',Arial,sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = 'rgb(204,26,13)'; c.strokeText(wort, 180, 78);
    c.fillStyle = 'rgb(255,217,26)'; c.fillText(wort, 180, 78);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    sp.renderOrder = 60; sp.position.set(p.x, p.y + 0.9, p.z);
    this.fxRoot.add(sp);
    let t = 0;
    this._fx.push({ alt: 0, update: dt => {
      t += dt;
      const s = Math.min(1, 0.2 + 0.8 * t / 0.14);
      sp.scale.set(1.2 * s, 0.5 * s, 1);
      sp.position.y = p.y + 0.9 + 0.45 * Math.min(1, Math.max(0, (t - 0.14) / 0.7));
      sp.material.opacity = t < 0.54 ? 1 : Math.max(0, 1 - (t - 0.54) / 0.3);
      return t < 0.84;
    }, ende: () => { if (sp.parent) sp.parent.remove(sp); tex.dispose(); sp.material.dispose(); } });
  };

  /** Lichtschwert-Hieb (Läufer) */
  P._hieb = function (p, dir) {
    const mat = new THREE.MeshBasicMaterial({ color: col(0.8, 0.97, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const klinge = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.11), mat);
    klinge.rotation.z = 0.75; klinge.scale.set(0.05, 1, 1);
    const halter = new THREE.Group(); halter.position.copy(p); halter.rotation.y = Math.atan2(dir.x, dir.z);
    halter.add(klinge); this.fxRoot.add(halter);
    // kleine Zusatzklinge für den Glanz (breiter, schwächer)
    const k2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.34), mat.clone()); k2.material.opacity = 0.45; k2.rotation.z = 0.75; k2.scale.set(0.05, 1, 1); halter.add(k2);
    let t = 0;
    this._fx.push({ alt: 0, update: dt => {
      t += dt;
      const sx = t < 0.1 ? Math.max(0.05, t / 0.1) : 1;
      klinge.scale.x = sx; k2.scale.x = sx;
      const o = t < 0.1 ? 1 : Math.max(0, 1 - (t - 0.1) / 0.3);
      mat.opacity = o; k2.material.opacity = 0.45 * o;
      return t < 0.5;
    }, ende: () => { if (halter.parent) halter.parent.remove(halter); mat.dispose(); k2.material.dispose(); klinge.geometry.dispose(); k2.geometry.dispose(); } });
  };

  /** Das Opfer zerbricht in Splitter (eigene kleine Physik: fallen, springen, rollen aus) */
  P._splitter = function (piece, p, hoehe, dir, power) {
    const mat = F.material(piece.color);
    const geo = this._geo('splitter', () => new THREE.BoxGeometry(1, 1, 1));
    const n = Math.max(6, Math.round(20 * Math.min(1, this.partikelFaktor + 0.3)));
    const teile = [];
    for (let i = 0; i < n; i++) {
      const s = rnd(0.05, 0.11), sh = s * rnd(0.6, 1.5);
      const m = new THREE.Mesh(geo, mat); m.scale.set(s, sh, s);
      const ox = rnd(-0.16, 0.16), oz = rnd(-0.16, 0.16);
      m.position.set(p.x + ox, rnd(0.06, Math.max(0.1, hoehe)), p.z + oz);
      m.rotation.set(rnd(0, 3), rnd(0, 3), 0);
      m.castShadow = true; m.receiveShadow = true;
      this.fxRoot.add(m);
      teile.push({ m, sh, s, vx: ox * 9 + dir.x * power * 2, vy: rnd(1.2, 2.8), vz: oz * 9 + dir.z * power * 2,
        wx: rnd(-6, 6), wy: rnd(-6, 6), wz: rnd(-6, 6), leben: 1.4 + i * 0.02 });
    }
    let t = 0;
    this._fx.push({ alt: 0, update: dt => {
      t += dt; let lebt = false;
      for (const q of teile) {
        if (t > q.leben + 0.4) { q.m.visible = false; continue; }
        lebt = true;
        q.vy -= 14 * dt;
        q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt;
        q.m.rotation.x += q.wx * dt; q.m.rotation.y += q.wy * dt; q.m.rotation.z += q.wz * dt;
        const boden = q.sh * 0.5;
        if (q.m.position.y < boden) {
          q.m.position.y = boden;
          if (Math.abs(q.vy) > 0.4) q.vy = -q.vy * 0.35; else q.vy = 0;
          const f = Math.exp(-5 * dt); q.vx *= f; q.vz *= f; q.wx *= f; q.wy *= f; q.wz *= f;
        }
        if (t > q.leben) { const k = Math.max(0, 1 - (t - q.leben) / 0.4); q.m.scale.set(q.s * k, q.sh * k, q.s * k); }
      }
      return lebt;
    }, ende: () => { for (const q of teile) if (q.m.parent) q.m.parent.remove(q.m); } });
  };
})(typeof window !== 'undefined' ? window : globalThis);
