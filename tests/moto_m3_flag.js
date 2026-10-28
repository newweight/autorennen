// Test-Hilfsdatei (M3): Motorrad-Modus an + kleiner localStorage-Ersatz (zum Prüfen der Garage-Speicherung). Wird zuerst in die Sandbox geladen.
window.MOTORRAD = true;
window.Rennspiel = window.Rennspiel || {};
window.Rennspiel._ls = (function () { const d = {}; return { d, getItem: (k) => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; })();
window.localStorage = window.Rennspiel._ls;
