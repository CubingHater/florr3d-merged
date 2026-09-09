import {CRAFT_CHANCES} from '../shared/petals.js';

export function craftPetals(p) {
    const res = { type: p.type, rarity: p.rarity + 1, count: 0 };
    let c = p.count;
    let attempts = 0;
    while (c >= 3) {
        attempts++;
        if (Math.random() < CRAFT_CHANCES[p.rarity] / 100) {c -= 3; res.count++;}
        else if (Math.random() < 0.5) c -= 2;
        else c -= 1;
    }
    p.count -= c;
    return { lose: p, gain: res, attempts };
}
