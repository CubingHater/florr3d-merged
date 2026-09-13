# Merge changelog — CubingHater (versie A) × Garchmop (versie B)

Basis: **versie B (Garchmop)**, met de onderdelen uit `Verschillen_CubingHater_vs_Garchmop.docx`
die "VOORANG VERSIE A" waren aangemerkt teruggezet. Items zonder wijziging waren al correct
in versie B en zijn ongemoeid gelaten.

## Toegepast: versie A wint
- **Items 38–43** — Rarity-statmultipliers en visuele scale-factoren teruggezet naar versie A
  (Legendary 120 — bevestigd door jou ondanks ontbrekende VOORANG-vermelding in de docx).
- **Item 44** — `pickRarity()` teruggebracht naar versie A's eenvoudige
  gewicht-per-rarity-formule (met `RARITY_DEPTH_BIAS = 3.0` uit versie B, item 45).
- **Items 35–37** — `ultraSpawnIntervalSec` (900s), `superSpawnIntervalSec` (15000s),
  `SAFE_RING_MAX_RARITY` (3).
- **Item 32** — Bossbalk-drempel terug naar rarity ≥ 7.
- **Items 68–70** — Model-yaw voor firefly/mummybeetle/egyptbeetle.
- **Items 7, 8, 9, 26, 75, 76, 77** — Multi-map-systeem en Ant Hell-content, zie hieronder.

## Toegepast: versie B wint (bevestigd, geen wijziging nodig)
Items 1–6, 10–25, 27–31, 33–34, 45, 53–67, 71–74 waren al zoals in versie B (de basis) en zijn
niet aangeraakt.

## Multi-map-systeem (items 7, 8, 9, 26, 75, 76, 77) — belangrijkste architecturale beslissing
Versie A's twee-kaarten-systeem gaf elke kaart ("Garden"/"Ant Hell") een **eigen, gelijktijdig
levende** MobManager/DropManager met eigen tegeldata. Versie B's engine is intussen herbouwd
(items 1–4, al VOORANG VERSIE B) rondom **één globale kaarttoestand** in `shared/config.js`
(`ARENA_HALF`, `TILE_SIZE`, `tileTypeAt`, `isWallCell`, `SPAWN_POS` zijn module-scope, niet
per-instantie). Twee kaarten echt gelijktijdig laten draaien zou een zeer invasieve refactor van
vrijwel elk serverbestand vereisen (mobs.js, drops.js, player.js, petals.js, walls-rendering, …)
zonder dat ik dit in deze omgeving kan playtesten.

**Gekozen aanpak: kaartwissel in plaats van twee gelijktijdige werelden.**
- `map1.json` (Ant Hell) toegevoegd naast het bestaande `map.json` (Garden).
- `shared/config.js`: `antHell`/`anthell`-tegeltype teruggezet.
- `anthell.svg` gekopieerd; tegel-overlay (`tiles.js`), muurmateriaal (`walls.js`) en
  minimap-kleur (`minimap.js`) uitgebreid met Ant Hell.
- `server/map.js`: `loadMap(mapName)` laadt `map.json` ('garden') of `map1.json` ('anthell').
- `server/index.js`: `/map.json?map=...` leest de querystring (item 77).
- `server/world.js`: nieuwe `World.switchMap(mapName)` herlaadt de kaartdata voor de **hele
  gedeelde wereld** (alle spelers) en herstart `MobManager`/`DropManager`. Nieuw netwerkcommando
  `{t:'switchMap', map}`.
- Client (`boot.js`, `main.js`): kaartkeuze-knoppen in het naamscherm, opgeslagen in
  `localStorage.selectedMap`; bij wisselen herlaadt de pagina (garandeert dat terrein/minimap
  altijd consistent met de nieuwe kaartdata worden opgebouwd — een live in-session 3D-terrein-
  rebuild zonder testomgeving vond ik te risicovol om blind te implementeren). Na het joinen
  stuurt de client alsnog `switchMap` zodat de server-actieve kaart overeenkomt.
- `minimap.js`: achtergrond-canvas is nu herbouwbaar (`draw.rebuild()`), ter voorbereiding op
  item 75.

**Bekende beperking t.o.v. versie A:** met deze aanpak delen alle spelers op de server altijd
dezelfde actieve kaart — wie het laatst wisselt, bepaalt de kaart voor iedereen (server-breed),
in plaats van dat elke speler zijn eigen kaart-wereld heeft. Wil je echt volledig onafhankelijke,
gelijktijdige werelden, dan is dat een aparte, grotere vervolgopdracht.

## Afwijking van je instructie: item 46 (drop-kansverdeling)
Versie A's `pickDrop()` werkt op het oude drop-formaat (`[type, weight]`-paren in
`shared/config.js`). Versie B's mobs (al VOORANG VERSIE B, items 1–2) zijn herbouwd als losse
klassen in `shared/mobs.js` met een nieuw droptabel-formaat (`{c, n, w}` per slot). Versie A's
algoritme kan dit format niet lezen — het letterlijk overzetten zou de droptabellen van **alle**
mobs breken. Ik heb daarom versie B's `pickDrop()` (in `shared/mobs.js`) laten staan. Als je dit
toch anders wilt, kan ik in een vervolgstap versie A's kansformule herschrijven zodat die tegen
het nieuwe `{c,n,w}`-formaat werkt (wel met een net iets andere resulterende verdeling dan het
letterlijke origineel, omdat het onderliggende model anders is).

## Bug-check
- Volledige codebase (`server/`, `shared/`, `client/src/`) is met `node --check` op syntaxfouten
  gecontroleerd — geen fouten gevonden.
- Gecontroleerd dat geen enkel bestand nog verwijst naar de verwijderde `rarityWeights()`-helper.
- Gecontroleerd dat `world.mobs` / `world.drops` overal dynamisch via `world.mobs.…` worden
  benaderd (niet gecachet), zodat `switchMap()`'s her-instantiëring van `MobManager`/
  `DropManager` niet leidt tot stale references in `combat.js`.
- `.session-secret`, `node_modules/` en `dist/` (versie A-specifieke, niet-broncode-bestanden,
  item 27–28) zaten niet in versie B en dus ook niet in deze merge.

## Niet gedaan (buiten scope van de docx)
Geen volledige, diepgaande security-/logica-audit van de rest van de ~180 bestanden — dat was
niet wat de docx vroeg. Als je specifieke, bekende bugs hebt (bijv. een crash, exploit, of
verkeerd gedrag dat je zelf hebt waargenomen), geef ze door dan pak ik die gericht aan.
