// Fahrer-Hilfsfunktionen (config.js): Eindeutigkeit, Computer-Namen, Emoji
const { ladeModule } = require('./lade.js');
const R = ladeModule(['src/config.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FAIL ') + name + (info !== undefined ? ' – ' + JSON.stringify(info) : '')); if (!ok) fehler++; }

const namen = R.config.fahrer.map((f) => f.name);
pruefe('12 Fahrer, Namen eindeutig', namen.length === 12 && new Set(namen).size === 12, namen);
pruefe('jeder Fahrer hat ein Emoji', R.config.fahrer.every((f) => f.emoji && f.emoji.length > 0));
pruefe('Standard-Fahrer existieren', R.config.fahrerStandard.every((n) => namen.includes(n)), R.config.fahrerStandard);
pruefe('Eindeutig: gleich -> zweiter springt', JSON.stringify(R.fahrerEindeutig(['Senna', 'Senna'])) === JSON.stringify(['Senna', 'Verstappen']));
pruefe('Eindeutig: Ende der Liste läuft um', R.fahrerEindeutig(['Röhrl', 'Röhrl'])[1] === 'Emmy');
pruefe('Eindeutig: verschieden bleibt', JSON.stringify(R.fahrerEindeutig(['Jonas', 'Emmy'])) === JSON.stringify(['Jonas', 'Emmy']));
pruefe('Computer solo (Jonas): Schumacher, Senna, Verstappen, Röhrl, Emmy',
  JSON.stringify(R.fahrerComputerNamen(['Jonas'], 5)) === JSON.stringify(['Schumacher', 'Senna', 'Verstappen', 'Röhrl', 'Emmy']), R.fahrerComputerNamen(['Jonas'], 5));
pruefe('Computer überspringt gewählte (Senna, Verstappen)',
  JSON.stringify(R.fahrerComputerNamen(['Senna', 'Verstappen'], 3)) === JSON.stringify(['Schumacher', 'Röhrl', 'Emmy']), R.fahrerComputerNamen(['Senna', 'Verstappen'], 3));
pruefe('Computer-Namen nie doppelt zu Spielern', !R.fahrerComputerNamen(['Emmy', 'Sara'], 5).some((n) => ['Emmy', 'Sara'].includes(n)));
pruefe('Emoji-Suche / Fallback', R.fahrerEmoji('Jonas') === R.config.fahrer[2].emoji && R.fahrerEmoji('Unbekannt') === '🤖');
console.log(fehler ? fehler + ' Fehler' : 'alle Fahrer-Tests OK');
process.exit(fehler ? 1 : 0);
