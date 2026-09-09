const P_MULTS = [1, 2, 4, 8, 16, 32, 64, 192, 960]

const ORBIT_NEUTRAL = 3.0;
const ORBIT_ATTACK = 6.0;
const ORBIT_DEFEND = 1.5;
const ORBITS_NORMAL = [ORBIT_NEUTRAL, ORBIT_ATTACK, ORBIT_DEFEND]
const ORBITS_DEFEND = [ORBIT_DEFEND, /*ORBIT_NEUTRAL*/ORBIT_DEFEND, ORBIT_DEFEND]

// One entry per craftable source rarity: Special through Super. Eternal is
// the final tier and deliberately has no entry.
export const CRAFT_CHANCES = [60, 30, 15, 7.5, 4.5, 1.5, 1.0, 0.5, 0.1];

function n_fn(val) {return function (r) {return val * P_MULTS[r];}}
function c_fn(val) {return function (r) {return val;}}
function l_fn(l) {return function (r) {return l[r];}}
function rad_fn(rad) {return function (r) {return rad * (1 + r * 0.08);}}

class PetalBase {
  constructor(name, funcs) {
    this.type = name;
    for (var i in funcs) {
        let func = funcs[i];
        if (typeof func !== 'function') this[i] = c_fn(func);
        else this[i] = func;
    };
    if (!this['orbits']) this['orbits'] = c_fn(ORBITS_NORMAL);
    if (!this['count']) this['count'] = c_fn(1);
    if (!this['color']) this['color'] = c_fn('#ffffff');
    if (!this['svg']) this['svg'] = c_fn(name);
    if (!this['stats']) this['stats'] = function(r) {
        return [this.s_hp_fn(r), this.s_dmg_fn(r)].join('\n');
    }
  }
  s_dmg_fn(r) {return `<span style="color: #e8483c">Damage: ${Math.round(this['dmg' ](r)*10)/10}</span>`;}
  s_hp_fn(r) {return `<span style="color: #78dd39">Health:  ${Math.round(this['hp'  ](r)*10)/10}</span>`;}
  s_heal_fn(r) {return `<span style="color: #ff94c9">Heal:  ${Math.round(this['heal'](r)*10)/10}</span>`;}
  s_any_fn(t, nt, r) {return `<span style="color: #cfe8d6;opacity:0.9;">${nt}: ${this[t](r)}</span>`;}
}

class BasicPetal extends PetalBase {
    constructor() {
        super('basic', {
            name: 'Basic', hp: n_fn(10), dmg: n_fn(10), reload: 2.5,
            radius: rad_fn(0.42),
            desc: 'A nice petal, not too strong but not too weak.',
            uncraftable: true,
        })
    }
}

class RockPetal extends PetalBase {
    constructor() {
        super('rockPetal', {
            name: 'Rock', hp: n_fn(45), dmg: n_fn(15), reload: 3,
            radius: rad_fn(0.5), color: '#7d7d84',
            desc: 'Heavy and durable.',
            knockMult: 1.3,
        })
    }
}

class RosePetal extends PetalBase {
    constructor() {
        super('rose', {
            name: 'Rose', hp: n_fn(5), dmg: n_fn(5), reload: 3.5,
            heal: n_fn(18),
            orbits: ORBITS_DEFEND,
            radius: rad_fn(0.4), color: '#ff94c9',
            desc: "It's heals your skill issue.",
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_heal_fn(r)].join('\n'); }
        })
    }
}

class LightPetal extends PetalBase {
    constructor() {
        super('light', {
            name: 'Light', hp: n_fn(5), dmg: n_fn(6), reload: 1,
            radius: rad_fn(0.25), count: l_fn([1, 2, 2, 3, 3, 5, 5, 5, 5, 5]),
            desc: "Weaker, but more and we ALL love more.",
            knockMult: 0.25,
            svg: l_fn([
                'light1',
                'light2','light2',
                'light3','light3',
                'light5','light5','light5','light5','light5'
            ]),
        })
    }
}

class StingerPetal extends PetalBase {
    constructor() {
        super('stinger', {
            name: 'Stinger', hp: 1 /*flatHp*/, dmg: n_fn(30), reload: 6,
            radius: rad_fn(0.35), count: l_fn([1, 1, 1, 1, 1, 3, 5, 5, 5, 5]), color: '#333333',
            desc: "Long reload, high reward.",
            svg: l_fn([
                'stinger','stinger','stinger','stinger','stinger',
                'tringer',
                'pinger','pinger','pinger','pinger'
            ]),
        })
    }
}

class OrangePetal extends PetalBase {
    constructor() {
        super('orange', {
            name: 'Orange', hp: n_fn(4), dmg: n_fn(20), reload: 1,
            radius: rad_fn(0.3), count: 3, color: '#eb9c2d',
            orbits: function(r) {return [ORBIT_NEUTRAL, ORBIT_ATTACK + 1.3 * r, ORBIT_DEFEND]},
            desc: "Why would a hornet eat a orange??",
            knockMult: 0.8,
        })
    }
}

class MissilePetal extends PetalBase {
    constructor() {
        super('missile', {
            name: 'Missile', hp: n_fn(2), dmg: n_fn(30), reload: 5,
            radius: rad_fn(0.4), color: '#333333',
            projectile: { speed: 150, life: 10 },
            desc: "pew pew",
        })
    }
}

class GlassPetal extends PetalBase {
    constructor() {
        super('glass', {
            name: 'Glass', hp: n_fn(3), dmg: n_fn(15), reload: 3,
            radius: rad_fn(0.4), color: '#eaf6fb',
            hitCooldown: 1,
            // Damage = dmg * idle * growth^(speed ratio), where the ratio is
            // your current speed / base walk speed, capped at maxRatio. Tuned
            // so a plain walk (ratio 1) is fairly weak and only pairing with
            // Bubble's speed (ratio ~3) reaches the big numbers. For Ultra
            // (base dmg 960): idle-still ≈ 509, walking ≈ 1220, max ≈ 7030.
            speedDmg: { idle: 0.53, growth: 2.4, maxRatio: 3.0 },
            desc: "This one cuts. Damage climbs exponentially with your movement speed — weak at a walk, devastating in flight. Pair with Bubble to hit top speed. Can't hit the same enemy more than once per second.",
        })
    }
}

class RicePetal extends PetalBase {
    constructor() {
        super('rice', {
            name: 'Rice', hp: n_fn(1), dmg: n_fn(14), reload: 0.3,
            radius: rad_fn(0.2), color: '#f2f2ec',
            desc: "Slop.",
            knockMult: 0.2,
        })
    }
}

class CornPetal extends PetalBase {
    constructor() {
        super('corn', {
            name: 'Corn', hp: n_fn(250), dmg: n_fn(10), reload: 7,
            radius: rad_fn(0.55), color: '#ffe419',
            desc: "This petal is so corny.",
            knockMult: 3,
        })
    }
}

class LeafPetal extends PetalBase {
    constructor() {
        super('leaf', {
            name: 'Leaf', hp: n_fn(12), dmg: n_fn(16), reload: 2,
            radius: rad_fn(0.42), color: '#39b54a',
            desc: "It heals and damages at the same time.",
            knockMult: 0.7,
            heal: n_fn(2),
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_heal_fn(r)].join('\n'); }
        })
    }
}

class WingPetal extends PetalBase {
    constructor() {
        super('wing', {
            name: 'Wing', hp: 1, dmg: 0, reload: 4,
            radius: rad_fn(0.45), count: 1,
            desc: "Did you know that soldier ants drink redbull?",
            stats: function(r) { return this.s_hp_fn(r); }
        })
    }
}

class BubblePetal extends PetalBase {
    constructor() {
        super('bubble', {
            name: 'Bubble', hp: 1, dmg: 0, reload: 5,
            radius: rad_fn(0.45), color: '#dff2fb',
            orbits: ORBITS_DEFEND,
            desc: "LOOK MOM I CAN FLY",
            stats: function(r) { return this.s_hp_fn(r); }
        })
    }
}

class IrisPetal extends PetalBase {
    constructor() {
        super('iris', {
            name: 'Iris', hp: n_fn(9), dmg: n_fn(20), reload: 2.5,
            radius: rad_fn(0.4), color: '#C673D3',
            desc: 'Poisons the mobs I guess',
        })
    }
}

class GoldenLeafPetal extends PetalBase {
    constructor() {
        super('goldenleaf', {
            name: 'Golden Leaf', hp: n_fn(15), dmg: n_fn(20), reload: 2.5,
            radius: rad_fn(0.42), color: '#a9a613',
            desc: 'Reduces the reload time of all petals: 0% at Common, then 3% more per rarity.',
            reloadMult: l_fn([0, 4, 8, 12, 16, 20, 24, 28, 32]),
            reloadMultStr: function(r) {return `-${this.reloadMult[r]}%`},
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_any_fn('reloadMultStr', 'Reload', r)].join('\n'); }
        })
    }
}

class PrivetPetal extends PetalBase {
    constructor() {
        super('privet', {
            name: 'Privet', hp: n_fn(10), dmg: n_fn(1), reload: 3,
            radius: rad_fn(0.35), color: '#141410',
            desc: 'I WANT MORE POISON. Boosts iris and pincer damage.',
        })
    }
}

class AirPetal extends PetalBase {
    constructor() {
        super('air', {
            name: 'Air', hp: n_fn(0), dmg: n_fn(0), reload: 2.5,
            radius: rad_fn(0.42), color: '#141410',
            desc: 'Not a placeholder trust.',
        })
    }
}

class PincerPetal extends PetalBase {
    constructor() {
        super('pincer', {
            name: 'Pincer', hp: n_fn(7), dmg: n_fn(13), reload: 1.5,
            radius: rad_fn(0.4),
            slow: 1,
            slowStr: function(r) {return `-${this.slow[r]}%`},
            desc: 'Slow down buddy.',
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_any_fn('slowStr', 'Slow', r)].join('\n'); }
        })
    }
}

class BloodSacrificePetal extends PetalBase {
    constructor() {
        super('bloodsacrifice', {
            name: 'Developer Sacrifice', hp: 1, dmg: 0, reload: 100,
            radius: rad_fn(1),
            desc: 'Sacrifice the blood of the developer to feel the power of admin abuse.',
            uncraftable: true,
        })
    }
}

class JobApplicationPetal extends PetalBase {
    constructor() {
        super('jobapplication', {
            name: 'Job Application', hp: n_fn(30), dmg: n_fn(135), reload: 1.5,
            radius: rad_fn(0.42), color: '#ff6b6b',
            desc: 'Get a job man',
        })
    }
}

class NothingPetal extends PetalBase {
    constructor() {
        super('nothing', {
            name: 'Nothing', hp: 1, dmg: 0, reload: 2.5,
            radius: rad_fn(0.42),
            desc: 'Mbappe special.',
        })
    }
}

class PharCrownPetal extends PetalBase {
    constructor() {
        // Keep this ID aligned with the inventory key, SVG map and model map.
        // The old capital C made the UI look up a non-existent "Crown" SVG.
        super('pharcrown', {
            name: 'Crown', hp: n_fn(10), dmg: n_fn(10), reload: 86_400,
            radius: rad_fn(0.42),
            desc: 'Summons some old friends from Egypt.',
            uncraftable: true,
        })
    }
}

class BeetleEggPetal extends PetalBase {
    constructor() {
        super('beetleegg', {
            name: 'Beetle Egg', hp: n_fn(10), dmg: n_fn(10), reload: 86_400,
            radius: rad_fn(0.42),
            desc: 'A nice petal, not too strong but not too weak.',
        })
    }
}

class RootPetal extends PetalBase {
    constructor() {
        super('root', {
            name: 'Root', hp: n_fn(10), dmg: n_fn(5), reload: 5,
            radius: rad_fn(0.42),
            infiniteHp: true,
            orbits: ORBITS_DEFEND,
            flowerarmor: n_fn(0.5),
            desc: 'square root',
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_any_fn('flowerarmor', 'Armor', r)].join('\n'); }
        })
    }
}

class DahliaPetal extends PetalBase {
    constructor() {
        super('dahlia', {
            name: 'Dahlia', hp: n_fn(7), dmg: n_fn(7), reload: 2,
            radius: rad_fn(0.42),
            heal: n_fn(10),
            desc: 'faster',
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_heal_fn(r)].join('\n'); }
        })
    }
}

class YinYangPetal extends PetalBase {
    constructor() {
        super('yinyang', {
            name: 'Yin Yang', hp: n_fn(4), dmg: n_fn(3), reload: 0.1,
            radius: rad_fn(0.42),
            desc: 'Turn arround.',
            knockMult: 0.4,
        })
    }
}

class CactusPetal extends PetalBase {
    constructor() {
        super('cactusPetal', {
            name: 'Cactus', hp: n_fn(15), dmg: n_fn(5), reload: 1,
            radius: rad_fn(0.42),
            desc: 'Kevin has no mercy, cactus is not enough you fool.',
            flowerhealth: n_fn(55),
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_any_fn('flowerhealth', 'Health bonus', r)].join('\n'); }
        })
    }
}

class BurPetal extends PetalBase {
    constructor() {
        super('bur', {
            name: 'Bur', hp: n_fn(10), dmg: n_fn(13), reload: 3,
            radius: rad_fn(0.42),
            minusarmor: n_fn(0.5),
            desc: 'Might be bugged idk.',
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_any_fn('minusarmor', 'Armor lowering', r)].join('\n'); }
        })
    }
}

class NazarAmuletPetal extends PetalBase {
    constructor() {
        super('nazaramulet', {
            name: 'Nazar Amulet', hp: n_fn(10), dmg: n_fn(10), reload: l_fn([60, 45, 30, 20, 15, 10, 6, 4, 2]),
            radius: rad_fn(0.42),
            damageBlock: true, infiniteHp: true,
            orbits: ORBITS_DEFEND,
            desc: 'Blocks 99% of damage taken.',
            charges: l_fn([2, 3, 4, 5, 6, 7, 8, 9, 10]),
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_any_fn('charges', 'Charges', r)].join('\n'); }
        })
    }
}


class LightbulbPetal extends PetalBase {
    constructor() {
        super('lightbulb', {
            name: 'Light Bulb', hp: n_fn(10), dmg: n_fn(10), reload: l_fn([60, 45, 30, 20, 15, 10, 6, 4, 2]),
            radius: rad_fn(0.42),
            infiniteHp: true, dropRadar: true,
            orbits: ORBITS_DEFEND,
            desc: 'Shows all drops on the map as dots.',
        })
    }
}

class DeadRicePetal extends PetalBase {
    constructor() {
        super('holyrice', {
            name: 'Job Rice', hp: n_fn(3), dmg: n_fn(45), reload: 0.03,
            radius: rad_fn(0.28), color: '#f2f2ec',
            desc: 'Slop. If you got this petal, get a job.',
        })
    }
}

class DeadCornPetal extends PetalBase {
    constructor() {
        super('holycorn', {
            name: 'Job Corn', hp: n_fn(600), dmg: n_fn(30), reload: 10,
            radius: rad_fn(0.55), color: '#ffe419',
            desc: 'This petal is so corny. If you got this petal, get a job.',
        })
    }
}


class DeadLeafPetal extends PetalBase {
    constructor() {
        super('holyleaf', {
            name: 'Job  Leaf', hp: n_fn(36), dmg: n_fn(48), reload: 1,
            radius: rad_fn(0.42), color: '#39b54a', heal: n_fn(8),
            desc: 'It heals and damages at the same time. If you got this petal, get a job.',
            stats: function(r) { return [this.s_hp_fn(r), this.s_dmg_fn(r), this.s_heal_fn(r)].join('\n'); }
        })
    }
}


class DeadWingPetal extends PetalBase {
    constructor() {
        super('holywing', {
            name: 'Job Wing', hp: n_fn(36), dmg: n_fn(30), reload: 2,
            radius: rad_fn(0.45), color: '#ffffff',
            desc: 'Did you know that soldier ants drink redbull? If you got this petal, get a job.',
        })
    }
}


class MagnetPetal extends PetalBase {
    constructor() {
        super('magnet', {
            name: 'Magnet', hp: n_fn(10), dmg: n_fn(10), reload: l_fn([500, 350, 250, 175, 125, 60, 45, 30, 10]),
            radius: rad_fn(0.42),
            dropMagnet: true,
            orbits: ORBITS_DEFEND,
            desc: 'Attracts all drops on the map to you.',
        })
    }
}

class PollenPetal extends PetalBase {
    constructor() {
        super('pollen', {
            name: 'Pollen', hp: n_fn(3), dmg: n_fn(5), reload: 1.5,
            radius: rad_fn(0.15),
            desc: 'Emanates an aura of pollen particles around it which damage all mobs within range.',
            color: '#ffe763',
            hitCooldown: 0.5,
            effectRadius: l_fn([20, 25, 30, 35, 40, 45, 50, 55, 60]), 
            minDmg: n_fn(3.5 * 0.5), 
            maxDmg: n_fn(11.5 * 0.5),
            stats: function(r) { return [
                this.s_hp_fn(r), this.s_dmg_fn(r), 
                this.s_any_fn('effectRadius', 'Effect radius', r),
                this.s_any_fn('minDmg', 'Aura damage (minimum)', r),
                this.s_any_fn('maxDmg', 'Aura damage (maximum)', r),
            ].join('\n'); }
        })
    }
}

class FasterPetal extends PetalBase {
    constructor() {
        super('faster', {
            name: 'Faster', hp: n_fn(5), dmg: n_fn(7), reload: 1,
            radius: rad_fn(0.2),
            desc: 'It\'s so light it makes your petals rotate faster.',
            color: '#feffc9',
            rotSpeed: l_fn([0.1, 0.3, 0.4, 0.6, 0.9, 1.5, 2.2, 3.0, 4.7]),
        })
    }
}

class HeavyPetal extends PetalBase {
    constructor() {
        super('heavy', {
            name: 'Heavy', hp: n_fn(560), dmg: n_fn(9), reload: 15,
            radius: rad_fn(0.5),
            desc: 'It\'s so heavy nothing gets in its way.',// Makes flowers fall faster.',
            color: '#333333',
            knockMult: 7,
        })
    }
}

export const PETAL_TYPES = {
  'basic': new BasicPetal(),
  'rockPetal': new RockPetal(),
  'rose': new RosePetal(),
  'light': new LightPetal(),
  'stinger': new StingerPetal(),
  'orange': new OrangePetal(),
  'missile': new MissilePetal(),
  'glass': new GlassPetal(),
  'rice': new RicePetal(),
  'corn': new CornPetal(),
  'leaf': new LeafPetal(),
  'wing': new WingPetal(),
  'bubble': new BubblePetal(),
  'iris': new IrisPetal(),
  'goldenleaf': new GoldenLeafPetal(),
  'privet': new PrivetPetal(),
  'air': new AirPetal(),
  'pincer': new PincerPetal(),
  'bloodsacrifice': new BloodSacrificePetal(),
  'jobapplication': new JobApplicationPetal(),
  'nothing': new NothingPetal(),
  'pharcrown': new PharCrownPetal(),
  'beetleegg': new BeetleEggPetal(),
  'root': new RootPetal(),
  'dahlia': new DahliaPetal(),
  'yinyang': new YinYangPetal(),
  'cactusPetal': new CactusPetal(),
  'bur': new BurPetal(),
  'nazaramulet': new NazarAmuletPetal(),
  'lightbulb': new LightbulbPetal(),
  'holyrice': new DeadRicePetal(),
  'holycorn': new DeadCornPetal(),
  'holyleaf': new DeadLeafPetal(),
  'holywing': new DeadWingPetal(),
  'magnet': new MagnetPetal(),
  'pollen': new PollenPetal(),
  'faster': new FasterPetal(),
  'heavy': new HeavyPetal(),
}

export function petalStat(p, s, fb=null) { 
    let base = PETAL_TYPES[p.type];
    if (!base[s]) return fb;
    return base[s](p.rarity); 
}
