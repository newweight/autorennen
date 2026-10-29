import sys, runpy
sys.argv = ['x', 'dino', '--moto', '--nichts']
src = open('/home/claude/autorennen/.claude/worktrees/agent-a3980f91928234ba9/tests/fix1_browser.py').read().split("\nwith sync_playwright() as p:")[0]
exec(compile(src, 'fix1', 'exec'))
with sync_playwright() as p:
    b, pg = oeffnen(p, 'Motorrad', [])
    pg.evaluate("Rennspiel.SpassWeltenUI.einst().dino = 'immer'")
    starten(pg, True, 'regenbogenland')
    pg.evaluate("([a, q, v, p]) => __tp(a, q, v, p)", [250, 0, 20, {'v': 20, 'tempo': 0.9}])
    for i in range(60 * 16):
        z = pg.evaluate("__frames(1)")
        if i % 15 == 0:
            info = pg.evaluate("() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle; return { fl: f.flug && f.flug.aktiv, imF: v.imFlug, ug: v.untergrund, mag: !!(f.flug && f.flug.z && f.flug.z.mag), gl: !!(f.flug && f.flug.gleit), q: f.nah && +f.nah.seitenabstand.toFixed(1), tempoBei: s.strecke.tempoBei(f.nah.s), tore: (s.strecke.spass.tore || []).map(t => Math.round(t.sA)) }; }")
            print(i, round(z['s']), round(z['v'] * 3.6), info)
    b.close()
