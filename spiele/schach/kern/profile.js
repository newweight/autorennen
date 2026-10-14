/* Schach-Kern: Spielerprofile (Swift: LessonProgress, PlayerProfile, PlayerProfileStore).
   Speicher: localStorage statt Application-Support-Datei; jeder Zugriff in try/catch, Fallback = Arbeitsspeicher.
   Profile sind einfache Objekte; wie Swift-Structs werden Kopien herausgegeben (aendern -> update() aufrufen). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  K.LessonProgress = function (o) {
    o = o || {};
    return { completed: !!o.completed, attempts: o.attempts | 0, stars: o.stars | 0 };   // stars: 3 = 1. Versuch, 2 = 2.-3., 1 = spaeter
  };
  K.PlayerProfile = function (name) {
    return { name: name, createdAt: new Date().toISOString(), lessonProgress: {}, lastLevel: 1, gamesPlayed: 0 };
  };
  K.profileTotalStars = function (p) {
    var n = 0, lp = p.lessonProgress || {};
    for (var k in lp) if (Object.prototype.hasOwnProperty.call(lp, k)) n += lp[k].stars | 0;
    return n;
  };

  var KEY = 'schach.spielerprofile.v1';

  function defaultStorage() {
    try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch (e) { /* gesperrt */ }
    return null;
  }

  // opts: { storage: {getItem,setItem}, key: 'name' }
  function PlayerProfileStore(opts) {
    opts = opts || {};
    this.key = opts.key || KEY;
    this._storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this._mem = null;            // Fallback, wenn Speicher fehlt/blockiert ist
    this.profiles = [];
    this.persistFailed = false;
    this.load();
  }

  PlayerProfileStore.prototype.load = function () {
    var raw = null;
    try { raw = this._storage ? this._storage.getItem(this.key) : null; } catch (e) { raw = null; this._storage = null; }
    if (raw === null || raw === undefined) raw = this._mem;
    if (!raw) return;
    try {
      var list = JSON.parse(raw);
      if (Array.isArray(list)) this.profiles = list.filter(function (p) { return p && typeof p.name === 'string'; });
    } catch (e) { /* kaputte Daten: leer lassen wie Swift (try? decode) */ }
  };

  PlayerProfileStore.prototype.persist = function () {
    var raw = JSON.stringify(this.profiles);
    this._mem = raw;
    try {
      if (this._storage) { this._storage.setItem(this.key, raw); this.persistFailed = false; }
      else this.persistFailed = true;
    } catch (e) { this.persistFailed = true; }
  };

  function same(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

  PlayerProfileStore.prototype.profile = function (name) {   // Swift: profile(named:)
    for (var i = 0; i < this.profiles.length; i++) if (same(this.profiles[i].name, name)) return clone(this.profiles[i]);
    return null;
  };
  PlayerProfileStore.prototype.profileNamed = PlayerProfileStore.prototype.profile;

  PlayerProfileStore.prototype.createOrGet = function (name) {
    var clean = String(name === undefined || name === null ? '' : name).trim();
    var existing = this.profile(clean);
    if (existing) return existing;
    var p = K.PlayerProfile(clean === '' ? 'Spieler' : clean);
    this.profiles.push(p);
    this.persist();
    return clone(p);
  };

  PlayerProfileStore.prototype.update = function (profile) {
    var c = clone(profile), found = false;
    for (var i = 0; i < this.profiles.length; i++) {
      if (same(this.profiles[i].name, c.name)) { this.profiles[i] = c; found = true; break; }
    }
    if (!found) this.profiles.push(c);
    this.persist();
  };

  PlayerProfileStore.prototype.removeProfile = function (name) {   // Swift: removeProfile(named:)
    this.profiles = this.profiles.filter(function (p) { return !same(p.name, name); });
    this.persist();
  };
  PlayerProfileStore.prototype.removeProfileNamed = PlayerProfileStore.prototype.removeProfile;

  PlayerProfileStore.prototype.names = function () { return this.profiles.map(function (p) { return p.name; }); };

  var shared = null;
  Object.defineProperty(PlayerProfileStore, 'shared', {
    get: function () { if (!shared) shared = new PlayerProfileStore(); return shared; }
  });

  K.PlayerProfileStore = PlayerProfileStore;
});
