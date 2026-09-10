# Florr3D Simulator

Een volledig losstaande simulator voor het Florr3D crafting en drop systeem.

## 🎯 Functionaliteit

### Crafting Simulator
- **Exacte crafting logica** uit de game (server/crafting.js)
- Simuleert crafting tussen rarities
- **50 individuele pogingen** (3 petals per poging)
- **5 pogingen met 100 petals**
- **5 pogingen met 1500 petals**
- Toont gemiddelden: success rate, failure rate, efficiency, etc.

### Drop Simulator
- **Exacte drop logica** uit de game (shared/mobs.js)
- **Exacte rarity weights** uit de game (server/gameSettings.js)
- Simuleert **100,000 mob kills**
- Toont drop rates per rarity en per item
- Progress bar tijdens simulatie

## 🚀 Gebruik

1. Open `index.html` in een browser
2. Kies een tab (Crafting of Drops)
3. Selecteer parameters
4. Klik op "Start Simulation"
5. Wacht tot de progress bar vol is
6. Bekijk de resultaten

## 📂 Bestanden

- `index.html` - Hoofd pagina
- `style.css` - Styling
- `simulator.js` - Game logica en simulatie code
- `README.md` - Dit bestand

## ⚙️ Systeem Vereisten

- Moderne web browser (Chrome, Firefox, Safari, Edge)
- Geen server nodig - werkt volledig client-side
- Geen internet verbinding nodig na eerste load

## 🎨 Features

- **Responsive design** - Werkt op desktop en mobile
- **Real-time progress bars** - Zie hoelang de simulatie duurt
- **Gedetailleerde statistieken** - Percentages, gemiddelden, totals
- **Professionele UI** - Moderne styling met gradients en animaties
- **Los van de game** - Geen dependencies op de game server

## 📊 Crafting Details

De simulator gebruikt de exacte CRAFT_CHANCES uit de game:
- Special → Common: 60%
- Common → Unusual: 30%
- Unusual → Rare: 15%
- Rare → Epic: 7.5%
- Epic → Legendary: 4.5%
- Legendary → Mythic: 1.5%
- Mythic → Ultra: 1.0%
- Ultra → Super: 0.5%
- Super → Eternal: 0.1%

Bij falen: 50% kans op -2 petals, 50% kans op -1 petal

## 📊 Drop Details

De simulator gebruikt de exacte drop rarity weights uit de game:
- Common mob: 100% Common
- Unusual mob: 70% Common, 30% Unusual
- Rare mob: 20% Common, 55% Unusual, 25% Rare
- Epic mob: 25% Unusual, 55% Rare, 20% Epic
- Legendary mob: 30% Rare, 60% Epic, 10% Legendary
- Mythic mob: 40% Epic, 55% Legendary, 5% Mythic
- Ultra mob: 50% Legendary, 48% Mythic, 2% Ultra
- Super mob: 91.9% Mythic, 8% Ultra, 0.1% Super

## 🔧 Technologie

- Pure HTML, CSS, JavaScript
- Geen frameworks of libraries
- Geen build process nodig
- Kopieer de simulator map naar elke locatie

## 📝 Notes

- De simulator gebruikt Math.random() voor willekeur
- Resultaten kunnen variëren tussen runs
- Voor statistische significantie zijn de aantallen zo gekozen
- De drop simulator (100k kills) kan enkele seconden duren

## 🎮 Integratie met Game

De simulator bevat de exacte logica uit:
- `server/crafting.js` - Crafting algoritme
- `shared/mobs.js` - Mob drop tables
- `server/gameSettings.js` - Rarity weights

Wanneer de game logica verandert, moet deze ook in de simulator worden bijgewerkt.
