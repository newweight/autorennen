// ============================================================
// Spaß-Paket S3 – Darstellung der Tricks (nur Browser, braucht Three.js; läuft ganz am Ende, alles Umhüllungen):
//   Fahrer-Animation (Motorrad): ein zweites, gegliedertes Fahrermodell („Trick-Fahrer“, wird beim ersten Trick je Motorrad gebaut und hängt in `inhalt`) ersetzt
//     während Superman/Handstand das feste Fahrermodell: Oberkörper starr gedreht, Beine per Zwei-Knochen-IK zu Fußzielen, Arme per IK zu den Griffen (die Handschuhe
//     des Motorrads bleiben, sie folgen dem Lenken). Pose aus R.SpassTricks.fahrerPose (reine Zahlen, getestet). Im Ruhezustand ist das feste Modell sichtbar – der
//     Trick-Fahrer ist dann ausgeblendet (keine zusätzlichen Draw-Calls).
//   Auto-Pose: Fassrolle (Längsachse) und Schraube (Hochachse) um die Fahrzeugmitte, kleiner Hüpfer, Wackeln nach unfertiger Landung (nur Anzeige).
//   R.sonderbauten.motorrad   umhüllt: merkt Farben/Fahrer-Versatz des Typs in userData.tricksFarbe (für den Bau des Trick-Fahrers)
//   R.dach.frame              umhüllt: je Bild Fahrer-Animation (Motorrad, offline aus spiel._t3, online aus spiel.stunt.fz[i].neuPoseZiel) und Auto-Pose
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.SpassTricks || typeof THREE === 'undefined') return;
  const ST = R.SpassTricks;
  const M = R.Moto && R.Moto.modell;
  const moto = () => window.MOTORRAD === true;

  // ---------- Farben/Versatz des Typs merken ----------
  function sonderbauHuelle() {
    if (!R.sonderbauten || !R.sonderbauten.motorrad || R.sonderbauten.motorrad._tricks3) return;
    const orig = R.sonderbauten.motorrad;
    const neu = function (autoDaten, opt) {
      const g = orig.apply(this, arguments);
      try {
        const o = Object.assign({}, (autoDaten && autoDaten.optionen) || {}, opt || {}), zahl = (v, d) => (v !== undefined && v !== null && Number.isFinite(v) ? v >>> 0 : d);
        const jersey = zahl(o.fahrer, zahl(autoDaten && autoDaten.farbe2, 0x1d4ed8)), helm = zahl(o.helm, 0xf4f4f4);
        const lum = (M && M.werkzeug && M.werkzeug.lum) || ((h) => ((h >> 16) & 255) * 0.299 + ((h >> 8) & 255) * 0.587 + (h & 255) * 0.114);
        const hose = lum(jersey) < 110 ? jersey : 0x23262d;
        const T = R.Moto && R.Moto.typen && R.Moto.typen.modell && R.Moto.typen.modell.T, t = T && autoDaten && autoDaten.typ ? T[autoDaten.typ] : null;
        if (g && g.userData) g.userData.tricksFarbe = { jersey, helm, hose, y: t && t.fahrer ? t.fahrer.y : 0, z: t && t.fahrer ? t.fahrer.z : 0 };
      } catch (e) { /* ohne Trick-Fahrer */ }
      return g;
    };
    Object.keys(orig).forEach((k) => { neu[k] = orig[k]; });
    neu._tricks3 = true;
    R.sonderbauten.motorrad = neu;
  }
  sonderbauHuelle();

  // ---------- Trick-Fahrer bauen ----------
  const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const _uy = new THREE.Vector3(0, 1, 0), _ux = new THREE.Vector3(1, 0, 0), _uz = new THREE.Vector3(0, 0, 1);
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  function geoKoerper(farbe) {
    const W = M.werkzeug, F = W.F, S = W.sammler(), A = ST.FAHRER.A, rel = (x, y, z) => new THREE.Vector3(x - A[0], y - A[1], z - A[2]);
    const fm = (cx, cy, cz, sx, sy, sz, rx, hex) => { _q.setFromEuler(_e.set(rx || 0, 0, 0)); _s.set(1, 1, 1); _m.compose(rel(cx, cy, cz), _q, _s); S.add(new THREE.BoxGeometry(sx, sy, sz), _m, hex); };
    fm(0, 1.03, 0.20, 0.30, 0.15, 0.24, 0, farbe.hose);                                                          // Becken
    const B = ST.FAHRER.B, d = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), l = d.length(); d.divideScalar(l);
    const g = new THREE.CylinderGeometry(0.13, 0.108, 1, 8, 1, false); g.translate(0, 0.5, 0);                    // Rumpf (nach vorn geneigt)
    _q.setFromUnitVectors(_uy, d); _s.set(1.3, l, 0.88); _m.compose(new THREE.Vector3(0, 0, 0), _q, _s); S.add(g, _m, farbe.jersey);
    _q.identity(); _s.set(0.22, 0.075, 0.115); _m.compose(rel(0, 1.45, -0.04), _q, _s); S.add(new THREE.SphereGeometry(1, 8, 5), _m, farbe.jersey);   // Schultern
    fm(0, 1.27, 0.11, 0.2, 0.13, 0.05, -0.35, F.schwarz);                                                        // Rückenschutz
    const a = rel(0, 1.47, -0.07), b = rel(0, 1.56, -0.11), nd = new THREE.Vector3().subVectors(b, a), nl = nd.length(); nd.divideScalar(nl);
    const gn = new THREE.CylinderGeometry(0.045, 0.05, 1, 6); gn.translate(0, 0.5, 0); _q.setFromUnitVectors(_uy, nd); _s.set(1, nl, 1); _m.compose(a, _q, _s); S.add(gn, _m, F.schwarz);   // Nacken
    return S.geo();
  }
  function geoKopf(farbe) {
    const F = M.werkzeug.F, S = M.werkzeug.sammler();
    const el = (cx, cy, cz, rx, ry, rz, hex, ws, hs) => { _q.identity(); _s.set(rx, ry, rz); _m.compose(new THREE.Vector3(cx, cy, cz), _q, _s); S.add(new THREE.SphereGeometry(1, ws || 8, hs || 6), _m, hex); };
    const bx = (cx, cy, cz, sx, sy, sz, rx, hex) => { _q.setFromEuler(_e.set(rx || 0, 0, 0)); _s.set(1, 1, 1); _m.compose(new THREE.Vector3(cx, cy, cz), _q, _s); S.add(new THREE.BoxGeometry(sx, sy, sz), _m, hex); };
    el(0, 0.015, 0.01, 0.135, 0.135, 0.165, farbe.helm, 9, 7);                    // Schale
    bx(0, -0.075, -0.15, 0.15, 0.09, 0.10, 0.15, farbe.helm);                      // Kinnbügel
    bx(0, -0.07, -0.205, 0.06, 0.05, 0.03, 0, F.schwarz);                          // Mundstück
    bx(0, 0.085, -0.19, 0.17, 0.014, 0.15, -0.28, farbe.helm);                     // Schirm
    el(0, 0, -0.02, 0.141, 0.05, 0.168, F.schwarz, 9, 4);                          // Brillenband
    bx(0, 0, -0.148, 0.185, 0.085, 0.03, 0, F.weiss);                              // Brillenrahmen
    bx(0, 0, -0.166, 0.155, 0.06, 0.02, 0, F.glas);                                // Brillenglas
    return S.geo();
  }
  function geoStiefel() {
    const F = M.werkzeug.F, S = M.werkzeug.sammler();
    const bx = (cx, cy, cz, sx, sy, sz, hex) => { _q.identity(); _s.set(1, 1, 1); _m.compose(new THREE.Vector3(cx, cy, cz), _q, _s); S.add(new THREE.BoxGeometry(sx, sy, sz), _m, hex); };
    bx(0, -0.065, -0.07, 0.10, 0.12, 0.30, F.stiefel);                             // Stiefel (relativ zum Fußpunkt der Sitzpose)
    bx(0, -0.12, -0.16, 0.10, 0.04, 0.12, F.schwarz);                              // Spitze
    return S.geo();
  }

  /** Trick-Fahrer für ein Motorrad-Mesh bauen (einmalig, danach u.trickFahrer). null, wenn das Mesh kein Motorrad ist. */
  function bauen(mesh) {
    const u = mesh && mesh.userData;
    if (!u || !u.moto || !u.inhalt || !M || !M.werkzeug) return null;
    if (u.trickFahrer) return u.trickFahrer;
    const W = M.werkzeug, farbe = u.tricksFarbe || { jersey: 0x1d4ed8, helm: 0xf4f4f4, hose: 0x23262d, y: 0, z: 0 };
    const grp = new THREE.Group(); grp.name = 'trickFahrer'; grp.position.set(0, farbe.y, farbe.z); grp.visible = false; u.inhalt.add(grp);
    const mesh_ = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.frustumCulled = false; grp.add(m); return m; };
    const koerper = mesh_(geoKoerper(farbe), W.vertexMat(false), 'tfKoerper');
    const kopf = mesh_(geoKopf(farbe), W.vertexMat(false), 'tfKopf');
    const beine = [0, 1].map((s) => ({
      ober: mesh_(W.stabGeo(0.078, 0.064), W.lambert(farbe.hose), 'tfOberschenkel'), unter: mesh_(W.stabGeo(0.066, 0.056), W.lambert(W.F.stiefel), 'tfSchienbein'),
      knie: mesh_(W.memo('tfKnie', () => { const g = new THREE.SphereGeometry(1, 6, 4); g.scale(0.07, 0.07, 0.06); return g; }), W.lambert(W.F.stiefel), 'tfKnie'),
      stiefel: mesh_(W.memo('tfStiefel', geoStiefel), W.vertexMat(false), 'tfStiefel'), n0: null, s,
    }));
    const arme = [0, 1].map(() => ({ ober: mesh_(W.stabGeo(0.05, 0.043), W.lambert(farbe.jersey), 'tfOberarm'), unter: mesh_(W.stabGeo(0.042, 0.036), W.lambert(farbe.jersey), 'tfUnterarm') }));
    // Ruhe-Richtung des Schienbeins je Seite (für die Stiefel-Ausrichtung)
    const ruhe = ST.fahrerPose(null, 0), kn = new THREE.Vector3();
    [0, 1].forEach((s) => {
      const sg = s === 0 ? -1 : 1, h = V(ST.ausKoerper(ruhe, [sg * 0.11, 1.0, 0.20])), f = V(ruhe.fuss[s]);
      W.gelenk(h, f, ST.FAHRER.bein, ST.FAHRER.bein, V(ruhe.knie[s]).normalize(), kn);
      beine[s].n0 = new THREE.Vector3().subVectors(f, kn).normalize();
    });
    // die festen Teile des Motorrads, die der Trick-Fahrer ersetzt
    const statisch = [], haende = [];
    u.inhalt.children.forEach((c) => {
      if (c.name === 'fahrer' || c.name === 'oberarm' || c.name === 'unterarm') statisch.push(c);
      else if (c.name === 'handschuh') haende.push(c);
    });
    const T = u.trickFahrer = { grp, koerper, kopf, beine, arme, statisch, haende, versatz: farbe, an: false };
    return T;
  }

  const _h = new THREE.Vector3(), _k = new THREE.Vector3(), _f = new THREE.Vector3(), _p = new THREE.Vector3(), _sh = new THREE.Vector3(), _el = new THREE.Vector3(), _hd = new THREE.Vector3(), _n = new THREE.Vector3();
  function zeigen(T, an) {
    if (T.an === an) return;
    T.an = an; T.grp.visible = an;
    T.statisch.forEach((c) => { c.visible = !an; });
  }
  /** Fahrer in die Pose bringen. art 'superman' | 'handstand' | null; w = Gewicht; t = Zeit (s). Ohne Trick: festes Modell sichtbar. */
  function animieren(mesh, art, w, t) {
    const u = mesh && mesh.userData;
    if (!u || !u.moto) return;
    let T = u.trickFahrer;
    if (!art || !(w > 0.003)) { if (T && T.an) zeigen(T, false); return; }
    if (!T) T = bauen(mesh);
    if (!T) return;
    const W = M.werkzeug, F = ST.FAHRER, pose = ST.fahrerPose(art, w, t), off = T.versatz;
    zeigen(T, true);
    _qa.setFromAxisAngle(_ux, pose.theta); _qb.setFromAxisAngle(_uz, pose.rho); _q.copy(_qa).multiply(_qb);
    T.koerper.position.set(pose.A[0], pose.A[1], pose.A[2]); T.koerper.quaternion.copy(_q);
    const hp = ST.ausKoerper(pose, F.kopf);
    T.kopf.position.set(hp[0], hp[1], hp[2]); T.kopf.quaternion.setFromAxisAngle(_uz, pose.kopfRoll);
    // Beine: Hüfte (nach der Drehung) → Fuß-Ziel der gleichen Seite
    for (let a = 0; a < 2; a++) {
      const sg = a === 0 ? -1 : 1, hh = ST.ausKoerper(pose, [sg * F.hueft[0], F.hueft[1], F.hueft[2]]), s = hh[0] < 0 ? 0 : 1, b = T.beine[a];
      _h.set(hh[0], hh[1], hh[2]); _f.set(pose.fuss[s][0], pose.fuss[s][1], pose.fuss[s][2]); _p.set(pose.knie[s][0], pose.knie[s][1], pose.knie[s][2]).normalize();
      W.gelenk(_h, _f, F.bein, F.bein, _p, _k);
      W.spanne(b.ober, _h, _k); W.spanne(b.unter, _k, _f); b.knie.position.copy(_k);
      b.stiefel.position.copy(_f); _n.subVectors(_f, _k).normalize(); b.stiefel.quaternion.setFromUnitVectors(b.n0 || _n, _n);
      if (b.n0) { /* Stiefel folgt dem Schienbein */ }
    }
    // Arme: Schulter (nach der Drehung) → Handschuh des Motorrads (bleibt am Griff)
    for (let a = 0; a < 2; a++) {
      const sg = a === 0 ? -1 : 1, ss = ST.ausKoerper(pose, [sg * F.schulter[0], F.schulter[1], F.schulter[2]]), s = ss[0] < 0 ? 0 : 1;
      _sh.set(ss[0], ss[1], ss[2]);
      let hand = null;
      for (let q = 0; q < T.haende.length; q++) { const c = T.haende[q]; if ((c.position.x < 0 ? 0 : 1) === s) { hand = c; break; } }
      if (!hand) continue;
      _hd.set(hand.position.x - off.y * 0, hand.position.y - off.y, hand.position.z - off.z);
      _p.set(pose.ellbogen[s][0], pose.ellbogen[s][1], pose.ellbogen[s][2]).normalize();
      W.gelenk(_sh, _hd, 0.27, 0.27, _p, _el);
      W.spanne(T.arme[a].ober, _sh, _el); W.spanne(T.arme[a].unter, _el, _hd);
    }
  }

  // ---------- Auto-Pose ----------
  const _c = new THREE.Vector3(0, 0.55, 0), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
  function autoPose(mesh, po) {
    if (!mesh) return;
    const sch = mesh.getObjectByName ? mesh.getObjectByName('schatten') : null;
    const aktiv = !!po && (po.rolle || po.schraube || po.hoehe);
    if (sch) { if (aktiv && sch.visible) { sch.visible = false; mesh.userData._schattenAus = true; } else if (!aktiv && mesh.userData._schattenAus) { sch.visible = true; mesh.userData._schattenAus = false; } }
    if (!aktiv) return;
    _q0.copy(mesh.quaternion);
    _qa.setFromAxisAngle(_uy, po.schraube || 0); _qb.setFromAxisAngle(_uz, po.rolle || 0);
    _q1.copy(_q0).multiply(_qa).multiply(_qb);
    _p0.copy(_c).applyQuaternion(_q0); _p1.copy(_c).applyQuaternion(_q1);
    mesh.position.add(_p0).sub(_p1); mesh.position.y += po.hoehe || 0;
    mesh.quaternion.copy(_q1);
  }

  // ---------- je Bild ----------
  function bild(spiel, dt) {
    const F = spiel.fahrzeuge;
    if (!F) return;
    const zeit = (spiel._tricksZeit = (spiel._tricksZeit || 0) + (dt || 0));
    if (moto()) {
      for (let i = 0; i < F.length; i++) {
        const f = F[i], mesh = f && f.mesh;
        if (!mesh || !mesh.userData || !mesh.userData.moto) continue;
        let art = null, w = 0, t = zeit;
        const t3 = spiel._t3 && spiel._t3.fz[i], zs = spiel.stunt && spiel.stunt.fz[i];
        if (t3 && t3.trick && (t3.pose.art === 'superman' || t3.pose.art === 'handstand') && !(spiel.online || spiel.zustand === 'online')) { art = t3.pose.art; w = t3.pose.w; }
        else if (zs && zs.neuPoseZiel && (zs.neuPoseZiel.art === 'superman' || zs.neuPoseZiel.art === 'handstand')) {       // online: weich zum Server-Wert
          const z = zs.neuPoseZiel, k = 1 - Math.exp(-Math.max(0, dt || 0) / 0.06);
          z.wAnz = (z.wAnz || 0) + (z.w - (z.wAnz || 0)) * k; art = z.art; w = z.wAnz;
        } else if (zs && zs.neuPoseZiel) { zs.neuPoseZiel.wAnz = 0; }
        animieren(mesh, art, w, t);
      }
    } else if (spiel._t3 && spiel._t3.fz) {
      for (let i = 0; i < F.length; i++) {
        const z3 = spiel._t3.fz[i], f = F[i];
        if (!z3 || !f || !f.mesh) continue;
        autoPose(f.mesh, z3.pose);
      }
    }
  }
  if (R.dach && typeof R.dach.frame === 'function' && !R.dach._tricks3) {
    R.dach._tricks3 = true;
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bild(spiel, dt); } catch (e) { if (typeof console !== 'undefined') console.error('Tricks (Bild):', e); }
      return r;
    };
  }

  ST.fahrer = { bauen, animieren, autoPose, bild, zeigen };
})();
