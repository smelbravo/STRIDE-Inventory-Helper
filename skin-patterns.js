// Case Hardened tables adapted from CS:Restored Inventory Helper. MIT, copyright 2026 smel.
(() => {
    const CH_WEAPON_RULES = [
        { key: 'ak47', re: /ak-47/ },
        { key: 'mac10', re: /mac-10/ },
        { key: 'fiveseven', re: /five-seve[nn]/ },
        { key: 'm9', re: /m9 bayonet/ },
        { key: 'karambit', re: /karambit/ },
        { key: 'butterfly', re: /butterfly/ },
        { key: 'skeleton', re: /skeleton/ },
        { key: 'talon', re: /talon/ },
        { key: 'stiletto', re: /stiletto/ },
        { key: 'ursus', re: /ursus/ },
        { key: 'nomad', re: /nomad/ },
        { key: 'paracord', re: /paracord/ },
        { key: 'survival', re: /survival/ },
        { key: 'navaja', re: /navaja/ },
        { key: 'falchion', re: /falchion/ },
        { key: 'huntsman', re: /huntsman/ },
        { key: 'bowie', re: /bowie/ },
        { key: 'flip', re: /flip knife/ },
        { key: 'gut', re: /gut knife/ },
        { key: 'classic', re: /classic knife/ },
        { key: 'kukri', re: /kukri/ },
        { key: 'shadow', re: /shadow daggers/ },
        { key: 'bayonet', re: /bayonet/ },
    ];

    function buildTierMap(rank1, tier1, tier2, tier3) {
        const out = new Map();
        const put = (seeds, tier) => {
            for (const s of seeds) {
                if (!out.has(s)) out.set(s, tier);
            }
        };
        put(rank1 || [], 0);
        put(tier1 || [], 1);
        put(tier2 || [], 2);
        put(tier3 || [], 3);
        return out;
    }

    /** #1 / co-#1 blue gem seeds per weapon (SteamAnalyst + BlueGemLab consensus). */
    const CH_BLUE_RANK1 = {
        ak47: [661],
        karambit: [387],
        m9: [601],
        butterfly: [494],
        bayonet: [555, 592, 670],
        talon: [146, 442],
        skeleton: [387, 601],
        flip: [670],
        bowie: [182],
        huntsman: [618],
        falchion: [494, 991],
        gut: [567],
        shadow: [56],
        navaja: [398, 407, 838],
        nomad: [888],
        stiletto: [182, 398],
        ursus: [916, 365],
        paracord: [398],
        survival: [403],
        classic: [387, 670],
        kukri: [371, 494],
        fiveseven: [278, 690],
        mac10: [],
    };

    /** Notable gold-dominant seeds (#1 / top gold where documented). */
    const CH_GOLD_RANK1 = {
        flip: [731],
        bowie: [],
        shadow: [],
    };

    const CH_BLUE_TIERS = {
        ak47: buildTierMap(
            CH_BLUE_RANK1.ak47,
            [151, 168, 179, 321, 387, 555, 592, 670, 760, 809, 955],
            [4, 13, 28, 32, 65, 74, 82, 92, 103, 122, 139, 147, 172, 189, 205, 228, 256, 323, 341, 426, 430, 442, 463, 479, 512, 525, 526, 532, 541, 571, 578, 605, 617, 627, 695, 698, 708, 713, 750, 752, 791, 828, 844, 868, 887, 888, 892, 903, 905, 922, 950, 969, 978, 996],
            [34, 81, 112, 278, 310, 312, 363, 381, 413, 428, 429, 450, 519, 557, 586, 610, 647, 685, 689, 690, 733, 754, 770, 819, 823, 856, 862, 872, 878, 935, 1000],
        ),
        karambit: buildTierMap(
            CH_BLUE_RANK1.karambit,
            [],
            [905, 698, 670, 130, 375, 664, 828, 74, 282, 453, 868, 377, 891, 798, 341, 541, 713, 661, 494, 4, 182, 823, 273, 838, 917, 82, 721, 510, 809, 470, 179],
            [262, 322, 30, 256, 139, 782, 989, 888, 11, 844, 92, 919, 112, 770, 330, 463, 306, 34, 429, 965, 811, 522, 803, 20, 575, 638, 914, 580, 236, 310, 916, 515, 631, 407, 371, 841, 555, 711, 632, 398, 598, 420, 283, 856, 202],
        ),
        m9: buildTierMap(
            CH_BLUE_RANK1.m9,
            [58, 107, 150, 239, 253, 349, 354, 403, 406, 417, 449, 503, 517, 523, 550, 585, 634, 675, 897, 946],
            [],
            [],
        ),
        fiveseven: buildTierMap(
            CH_BLUE_RANK1.fiveseven,
            [189, 363, 689, 868, 872],
            [],
            [],
        ),
        mac10: buildTierMap(
            [],
            [667, 114, 406, 95],
            [19, 22, 80, 199, 239, 251, 295, 313, 349, 503, 748, 807, 890, 944],
            [],
        ),
        butterfly: buildTierMap(CH_BLUE_RANK1.butterfly, [], [], []),
        bayonet: buildTierMap(CH_BLUE_RANK1.bayonet, [], [], []),
        talon: buildTierMap(CH_BLUE_RANK1.talon, [], [], []),
        skeleton: buildTierMap(CH_BLUE_RANK1.skeleton, [], [], []),
        flip: buildTierMap(CH_BLUE_RANK1.flip, [], [], []),
        bowie: buildTierMap(CH_BLUE_RANK1.bowie, [], [], []),
        huntsman: buildTierMap(CH_BLUE_RANK1.huntsman, [], [], []),
        falchion: buildTierMap(CH_BLUE_RANK1.falchion, [], [], []),
        gut: buildTierMap(CH_BLUE_RANK1.gut, [], [], []),
        shadow: buildTierMap(CH_BLUE_RANK1.shadow, [], [], []),
        navaja: buildTierMap(CH_BLUE_RANK1.navaja, [], [], []),
        nomad: buildTierMap(CH_BLUE_RANK1.nomad, [], [], []),
        stiletto: buildTierMap(CH_BLUE_RANK1.stiletto, [], [], []),
        ursus: buildTierMap(CH_BLUE_RANK1.ursus, [], [], []),
        paracord: buildTierMap(CH_BLUE_RANK1.paracord, [], [], []),
        survival: buildTierMap(CH_BLUE_RANK1.survival, [], [], []),
        classic: buildTierMap(CH_BLUE_RANK1.classic, [], [], []),
        kukri: buildTierMap(CH_BLUE_RANK1.kukri, [], [], []),
    };

    const CH_GOLD_TIERS = {
        flip: buildTierMap(CH_GOLD_RANK1.flip, [], [], []),
    };

    function caseHardenedWeaponKey(name) {
        const n = (name || '').toLowerCase();
        if (!n.includes('case hardened')) return null;
        for (const rule of CH_WEAPON_RULES) {
            if (rule.re.test(n)) return rule.key;
        }
        return null;
    }

    function tierBadge(tier, gemKind) {
        const isGold = gemKind === 'gold';
        if (tier === 0) {
            return {
                type: isGold ? 'ch-gold' : 'ch',
                tier: 0,
                gemKind,
                label: isGold ? '#1 Gold Gem' : '#1 Blue Gem',
                short: '#1',
                css: isGold ? 'csrx-pattern-gold0' : 'csrx-pattern-ch0',
            };
        }
        return {
            type: isGold ? 'ch-gold' : 'ch',
            tier,
            gemKind,
            label: isGold ? `Tier ${tier} Gold` : `Tier ${tier} Blue`,
            short: isGold ? `G${tier}` : `T${tier}`,
            css: isGold ? `csrx-pattern-gold${tier}` : `csrx-pattern-ch${tier}`,
        };
    }

    function lookupChTier(maps, key, seed) {
        if (!key || seed == null) return null;
        const map = maps[key];
        if (!map) return null;
        const tier = map.get(seed);
        return tier == null ? null : tier;
    }

    function resolveCaseHardenedTier(name, seed) {
        if (seed == null) return null;
        const key = caseHardenedWeaponKey(name);
        if (!key) return null;

        const blueTier = lookupChTier(CH_BLUE_TIERS, key, seed);
        if (blueTier != null) return tierBadge(blueTier, 'blue');

        const goldTier = lookupChTier(CH_GOLD_TIERS, key, seed);
        if (goldTier != null) return tierBadge(goldTier, 'gold');

        return null;
    }

    globalThis.strideCaseHardenedTier = resolveCaseHardenedTier;
    const doppler = ['Ruby', 'Sapphire', 'Black Pearl', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
    const gamma = ['Emerald', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
    globalThis.strideDopplerPhase = (name, finish) => {
        if (!/\bdoppler\b/i.test(name)) return null;
        const isGamma = /\bgamma doppler\b/i.test(name);
        const phases = isGamma ? gamma : doppler;
        const explicit = phases.find(phase => new RegExp(`\\b${phase}\\b`, 'i').test(name));
        return explicit ?? phases[Number(finish) - (isGamma ? 568 : 415)] ?? null;
    };
})();
