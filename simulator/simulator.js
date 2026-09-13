// Exact crafting logic from server/crafting.js
const CRAFT_CHANCES = [60, 30, 15, 7.5, 4.5, 1.5, 1.0, 0.5, 0.1];

function craftPetals(p) {
    const res = { type: p.type, rarity: p.rarity + 1, count: 0 };
    let c = p.count;
    let attempts = 0;
    while (c >= 3) {
        attempts++;
        if (Math.random() < CRAFT_CHANCES[p.rarity] / 100) {
            c -= 3;
            res.count++;
        } else if (Math.random() < 0.5) {
            c -= 2;
        } else {
            c -= 1;
        }
    }
    p.count -= c;
    return { lose: p, gain: res, attempts };
}

// Exact drop logic from shared/mobs.js
const MOB_TYPES = {
    rock: {
        name: 'Rock',
        drops: [
            { w: { 'rockPetal': 1 } },
            { w: { 'heavy': 1 }, c: 0.4 },
        ],
    },
    ladybug: {
        name: 'Ladybug',
        drops: [
            { w: { 'rose': 1 } },
            { w: { 'bubble': 1 } },
            { w: { 'light': 1 } },
        ],
    },
    bee: {
        name: 'Bee',
        drops: [
            { w: { 'stinger': 1 } },
        ],
    },
    hornet: {
        name: 'Hornet',
        drops: [
            { w: { 'missile': 1 } },
            { w: { 'orange': 1 } },
        ],
    },
    soldier: {
        name: 'Soldier Ant',
        drops: [
            { w: { 'glass': 1 } },
            { w: { 'wing': 1 } },
        ],
    },
    worker: {
        name: 'Worker Ant',
        drops: [
            { w: { 'corn': 1 } },
            { w: { 'leaf': 1 } },
        ],
    },
    baby: {
        name: 'Baby Ant',
        drops: [
            { w: { 'light': 1 } },
            { w: { 'rice': 1 } },
            { w: { 'leaf': 1 } },
        ],
    },
    anthole: {
        name: 'Ant Hole',
        drops: [
            { w: { 'magnet': 1 } },
            { w: { 'jobapplication': 1 } },
        ],
    },
    scorpion: {
        name: 'Scorpion',
        drops: [
            { w: { 'iris': 1 } },
            { w: { 'pincer': 1 } },
        ],
    },
    beetle: {
        name: 'Beetle',
        drops: [
            { w: { 'privet': 1 } },
            { w: { 'beetleegg': 1 }, c: 0.5 },
        ],
    },
    cactus: {
        name: 'Cactus',
        drops: [
            { w: { 'stinger': 1 } },
            { w: { 'cactusPetal': 1 } },
        ],
    },
    bush: {
        name: 'Bush',
        drops: [
            { w: { 'goldenleaf': 1, '': 49 } },
            { w: { 'leaf': 1 } },
        ],
    },
    shinyladybug: {
        name: 'Ladybug',
        drops: [
            { w: { 'rose': 1 } },
            { w: { 'dahlia': 1 } },
            { w: { 'bubble': 1 } },
        ],
    },
    jungleladybug: {
        name: 'Ladybug',
        drops: [
            { w: { 'dahlia': 1, '': 1 } },
            { w: { 'yinyang': 1 } },
        ],
    },
    leafbug: {
        name: 'Leafbug',
        drops: [
            { w: { 'leaf': 1 } },
            { w: { 'root': 1, '': 1 } },
        ],
    },
    goldenleafbug: {
        name: 'Leafbug',
        drops: [
            { w: { 'goldenleaf': 1, '': 1 } },
            { w: { 'root': 1 } },
        ],
    },
    nazarbeetle: {
        name: 'Beetle',
        drops: [
            { w: { 'privet': 1 } },
            { w: { 'beetleegg': 1 } },
            { w: { 'nazaramulet': 1, '': 1 } },
        ],
    },
    firefly: {
        name: 'Firefly',
        drops: [
            { w: { 'wing': 1 } },
            { w: { 'bur': 1 } },
            { w: { 'lightbulb': 1 } },
        ],
    },
    mummybeetle: {
        name: 'Mummy Beetle',
        drops: [
            { w: { 'privet': 1 } },
            { w: { 'beetleegg': 1 } },
        ],
    },
    egyptbeetle: {
        name: 'Pharaoh Beetle',
        drops: [
            { w: { 'privet': 1 } },
        ],
    },
    queen: {
        name: 'Queen Ant',
        drops: [
            { w: { 'holycorn': 1, '': 3 } },
            { w: { 'holywing': 1, '': 3 } },
            { w: { 'holyrice': 1, '': 3 } },
            { w: { 'holyleaf': 1, '': 3 } },
            { w: { 'jobapplication': 1 } },
        ],
    },
    spider: {
        name: 'Spider',
        drops: [
            { w: { 'web': 1 } },
            { w: { 'fang': 1 } },
        ],
    },
    centi: {
        name: 'Centipede',
        drops: [
            { w: { 'web': 1 } },
            { w: { 'fang': 1 } },
        ],
    },
};

function pickDrop(mobType, rng = Math.random) {
    const drops = MOB_TYPES[mobType].drops;
    const l = [];
    for (const slot of drops) {
        let c = slot.c ?? 1;
        if (rng() < c) {
            let n = slot.n ?? 1;
            let r = 0;
            for (var i in slot.w) { r += slot.w[i]; }
            r *= rng();
            for (var i in slot.w) {
                r -= slot.w[i];
                if (r <= 0) {
                    if (i !== '') {
                        for (var j = 0; j < n; j++) l.push(i);
                    }
                    break;
                }
            }
        }
    }
    return l;
}

// Exact rarity weights from server/gameSettings.js
const defaultDropRarityWeights = () => {
    return [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],           // Special mob
        [0, 100, 0, 0, 0, 0, 0, 0, 0, 0],         // Common mob: 100% common
        [0, 70, 30, 0, 0, 0, 0, 0, 0, 0],        // Unusual mob: 70% common, 30% unusual
        [0, 20, 55, 25, 0, 0, 0, 0, 0, 0],       // Rare mob: 20% common, 55% unusual, 25% rare
        [0, 0, 25, 55, 20, 0, 0, 0, 0, 0],       // Epic mob: 25% unusual, 55% rare, 20% epic
        [0, 0, 0, 30, 60, 10, 0, 0, 0, 0],       // Legendary mob: 30% rare, 60% epic, 10% legendary
        [0, 0, 0, 0, 40, 55, 5, 0, 0, 0],       // Mythic mob: 40% epic, 55% legendary, 5% mythic
        [0, 0, 0, 0, 0, 50, 48, 2, 0, 0],       // Ultra mob: 50% legendary, 48% mythic, 2% ultra
        [0, 0, 0, 0, 0, 0, 91.9, 8, 0.1, 0],   // Super mob: 91.9% mythic, 8% ultra, 0.1% super
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],          // Eternal mob
    ];
};

const dropRarityWeights = defaultDropRarityWeights();

function pickWeightedRarity(weights, fallbackIdx = 0) {
    if (!Array.isArray(weights)) return fallbackIdx;
    let total = 0;
    for (const w of weights) if (Number.isFinite(w) && w > 0) total += w;
    if (total <= 0) return fallbackIdx;
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (!Number.isFinite(w) || w <= 0) continue;
        if (roll < w) return i;
        roll -= w;
    }
    return fallbackIdx;
}

const RARITY_NAMES = ['Special', 'Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super', 'Eternal'];

// UI Logic
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Crafting simulation
    document.getElementById('runCrafting').addEventListener('click', runCraftingSimulation);
    
    // Drop simulation
    document.getElementById('runDrops').addEventListener('click', runDropSimulation);
});

function runCraftingSimulation() {
    const petalType = document.getElementById('petalType').value;
    const fromRarity = parseInt(document.getElementById('fromRarity').value);
    const toRarity = parseInt(document.getElementById('toRarity').value);

    if (toRarity !== fromRarity + 1) {
        alert('To Rarity must be exactly one tier higher than From Rarity!');
        return;
    }

    const btn = document.getElementById('runCrafting');
    const progressContainer = document.getElementById('craftingProgress');
    const progressBar = document.getElementById('craftingProgressBar');
    const progressText = document.getElementById('craftingProgressText');
    const resultsContainer = document.getElementById('craftingResults');

    btn.disabled = true;
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');

    const smallResults = [];
    const mediumResults = [];
    const largeResults = [];

    let currentPhase = 0;
    const totalPhases = 3;

    function runPhase(phase) {
        if (phase === 0) {
            // 10,000 individual attempts (for statistical significance)
            const batchSize = 1000;
            let processed = 0;
            
            function processBatch() {
                const endIndex = Math.min(processed + batchSize, 10000);
                for (let i = processed; i < endIndex; i++) {
                    const result = craftPetals({ type: petalType, rarity: fromRarity, count: 3 });
                    smallResults.push(result);
                }
                processed = endIndex;
                const progress = (processed / 10000) * (1 / totalPhases) * 100;
                progressBar.style.width = progress + '%';
                progressText.textContent = Math.round(progress) + '%';
                
                if (processed < 10000) {
                    setTimeout(processBatch, 0);
                } else {
                    setTimeout(() => runPhase(1), 10);
                }
            }
            processBatch();
        } else if (phase === 1) {
            // 100 attempts with 100 petals
            for (let i = 0; i < 100; i++) {
                const result = craftPetals({ type: petalType, rarity: fromRarity, count: 100 });
                mediumResults.push(result);
                const progress = (1 / totalPhases * 100) + ((i + 1) / 100) * (1 / totalPhases) * 100;
                progressBar.style.width = progress + '%';
                progressText.textContent = Math.round(progress) + '%';
            }
            setTimeout(() => runPhase(2), 10);
        } else if (phase === 2) {
            // 100 attempts with 1500 petals
            for (let i = 0; i < 100; i++) {
                const result = craftPetals({ type: petalType, rarity: fromRarity, count: 1500 });
                largeResults.push(result);
                const progress = (2 / totalPhases * 100) + ((i + 1) / 100) * (1 / totalPhases) * 100;
                progressBar.style.width = progress + '%';
                progressText.textContent = Math.round(progress) + '%';
            }
            setTimeout(() => displayCraftingResults(), 10);
        }
    }

    runPhase(0);

    function displayCraftingResults() {
        btn.disabled = false;
        progressContainer.classList.add('hidden');
        resultsContainer.classList.remove('hidden');

        // Display small results
        displayCraftingPhase(smallResults, 'craftingSmallResults', 3);
        
        // Display medium results
        displayCraftingPhase(mediumResults, 'craftingMediumResults', 100);
        
        // Display large results
        displayCraftingPhase(largeResults, 'craftingLargeResults', 1500);

        // Calculate and display averages
        displayCraftingAverages(smallResults, mediumResults, largeResults);
    }
}

function displayCraftingPhase(results, containerId, petalCount) {
    const container = document.getElementById(containerId);
    const successes = results.filter(r => r.gain.count > 0).length;
    const totalGained = results.reduce((sum, r) => sum + r.gain.count, 0);
    const totalLost = results.reduce((sum, r) => sum + r.lose.count, 0);
    const totalAttempts = results.reduce((sum, r) => sum + r.attempts, 0);
    
    // Calculate sets of 3 that succeeded
    const totalSetsAttempted = results.reduce((sum, r) => sum + Math.floor(petalCount / 3), 0);
    const setsSucceeded = totalGained; // Each successful craft is one set of 3 that succeeded
    const setSuccessRate = totalSetsAttempted > 0 ? (setsSucceeded / totalSetsAttempted * 100) : 0;
    
    container.innerHTML = `
        <div class="stat-grid">
            <div class="stat-card">
                <h4>Attempt Success Rate</h4>
                <div class="value">${((successes / results.length) * 100).toFixed(2)}%</div>
            </div>
            <div class="stat-card">
                <h4>Set of 3 Success Rate</h4>
                <div class="value">${setSuccessRate.toFixed(4)}%</div>
            </div>
            <div class="stat-card">
                <h4>Total Gained</h4>
                <div class="value">${totalGained}</div>
            </div>
            <div class="stat-card">
                <h4>Total Lost</h4>
                <div class="value">${totalLost}</div>
            </div>
            <div class="stat-card">
                <h4>Avg Attempts</h4>
                <div class="value">${(totalAttempts / results.length).toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <h4>Total Sets Attempted</h4>
                <div class="value">${totalSetsAttempted.toLocaleString()}</div>
            </div>
        </div>
    `;
}

function displayCraftingAverages(smallResults, mediumResults, largeResults) {
    const container = document.getElementById('craftingAverageResults');
    const allResults = [...smallResults, ...mediumResults, ...largeResults];
    
    const successes = allResults.filter(r => r.gain.count > 0).length;
    const totalGained = allResults.reduce((sum, r) => sum + r.gain.count, 0);
    const totalLost = allResults.reduce((sum, r) => sum + r.lose.count, 0);
    const totalAttempts = allResults.reduce((sum, r) => sum + r.attempts, 0);
    
    // Calculate total sets of 3 attempted and succeeded
    const totalSetsAttempted = smallResults.length * 1 + mediumResults.length * 33 + largeResults.length * 500; // 3, 100, 1500 petals per attempt
    const setsSucceeded = totalGained;
    const setSuccessRate = totalSetsAttempted > 0 ? (setsSucceeded / totalSetsAttempted * 100) : 0;
    
    // Calculate failure chances
    const failures = allResults.filter(r => r.gain.count === 0);
    const failChance = (failures.length / allResults.length) * 100;
    
    container.innerHTML = `
        <div class="stat-grid">
            <div class="stat-card">
                <h4>Overall Attempt Success</h4>
                <div class="value">${((successes / allResults.length) * 100).toFixed(4)}%</div>
            </div>
            <div class="stat-card">
                <h4>Overall Set of 3 Success</h4>
                <div class="value">${setSuccessRate.toFixed(4)}%</div>
            </div>
            <div class="stat-card">
                <h4>Overall Failure Rate</h4>
                <div class="value">${failChance.toFixed(4)}%</div>
            </div>
            <div class="stat-card">
                <h4>Avg Petals Gained</h4>
                <div class="value">${(totalGained / allResults.length).toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <h4>Avg Petals Lost</h4>
                <div class="value">${(totalLost / allResults.length).toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <h4>Efficiency</h4>
                <div class="value">${((totalGained / totalLost) * 100).toFixed(4)}%</div>
            </div>
            <div class="stat-card">
                <h4>Total Sets Attempted</h4>
                <div class="value">${totalSetsAttempted.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h4>Total Sets Succeeded</h4>
                <div class="value">${setsSucceeded.toLocaleString()}</div>
            </div>
        </div>
    `;
}

function runDropSimulation() {
    const mobType = document.getElementById('mobType').value;
    const mobRarity = parseInt(document.getElementById('mobRarity').value);

    const btn = document.getElementById('runDrops');
    const progressContainer = document.getElementById('dropProgress');
    const progressBar = document.getElementById('dropProgressBar');
    const progressText = document.getElementById('dropProgressText');
    const resultsContainer = document.getElementById('dropResults');

    btn.disabled = true;
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');

    const totalKills = 10000000; // 10 million - statistically significant but feasible
    const dropCounts = {};
    const rarityCounts = {};

    let processed = 0;
    const batchSize = 10000;

    function processBatch() {
        const endIndex = Math.min(processed + batchSize, totalKills);
        
        for (let i = processed; i < endIndex; i++) {
            const dropTypes = pickDrop(mobType);
            if (!dropTypes) continue;
            
            const drops = Array.isArray(dropTypes) ? dropTypes : [dropTypes];
            
            for (const dropType of drops) {
                const rarity = pickWeightedRarity(dropRarityWeights[mobRarity], mobRarity);
                
                if (!dropCounts[dropType]) {
                    dropCounts[dropType] = {};
                }
                if (!dropCounts[dropType][rarity]) {
                    dropCounts[dropType][rarity] = 0;
                }
                dropCounts[dropType][rarity]++;
                
                if (!rarityCounts[rarity]) {
                    rarityCounts[rarity] = 0;
                }
                rarityCounts[rarity]++;
            }
        }

        processed = endIndex;
        const progress = (processed / totalKills) * 100;
        progressBar.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';

        if (processed < totalKills) {
            setTimeout(processBatch, 0);
        } else {
            displayDropResults(dropCounts, rarityCounts, totalKills);
        }
    }

    processBatch();

    function displayDropResults(dropCounts, rarityCounts, totalKills) {
        btn.disabled = false;
        progressContainer.classList.add('hidden');
        resultsContainer.classList.remove('hidden');

        // Display summary
        const totalDrops = Object.values(rarityCounts).reduce((a, b) => a + b, 0);
        const summaryHTML = `
            <div class="stat-grid">
                <div class="stat-card">
                    <h4>Total Kills</h4>
                    <div class="value">${totalKills.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <h4>Total Drops</h4>
                    <div class="value">${totalDrops.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <h4>Avg Drops per Kill</h4>
                    <div class="value">${(totalDrops / totalKills).toFixed(2)}</div>
                </div>
            </div>
        `;
        document.getElementById('dropSummary').innerHTML = summaryHTML;

        // Display rarity distribution
        let rarityHTML = '<h3>Rarity Distribution</h3>';
        for (const rarity in rarityCounts) {
            const count = rarityCounts[rarity];
            const percentage = (count / totalDrops * 100).toFixed(4);
            rarityHTML += `
                <div class="drop-item">
                    <span class="drop-name"><span class="rarity-badge rarity-${rarity}">${RARITY_NAMES[rarity]}</span></span>
                    <span class="drop-chance">${count.toLocaleString()} (${percentage}%)</span>
                </div>
            `;
        }

        // Display item drops
        let itemHTML = '<h3>Item Drops</h3>';
        for (const itemType in dropCounts) {
            itemHTML += `<h4>${itemType}</h4>`;
            for (const rarity in dropCounts[itemType]) {
                const count = dropCounts[itemType][rarity];
                const percentage = (count / totalKills * 100).toFixed(4);
                itemHTML += `
                    <div class="drop-item">
                        <span class="drop-name"><span class="rarity-badge rarity-${rarity}">${RARITY_NAMES[rarity]}</span></span>
                        <span class="drop-chance">${count.toLocaleString()} (${percentage}%)</span>
                    </div>
                `;
            }
        }

        document.getElementById('dropDetails').innerHTML = rarityHTML + itemHTML;
    }
}
