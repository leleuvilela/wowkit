import {
    beforeEach,
    describe,
    expect,
    it,
    learnSpell,
    playAs,
    POWER,
    createWorld,
    type World,
    ARCANE_INTELLECT,
    MAGE,
    type SpellDefinition,
} from "@wowkit/test-kit";

describe("a mage in a party", () => {
    let world!: World;

    beforeEach(() => {
        world = createWorld(
            (state) => {
                playAs(state, MAGE);
                learnSpell(state, ARCANE_INTELLECT);
                state.auras.push({ name: ARCANE_INTELLECT.name, spellId: ARCANE_INTELLECT.id, expirationTime: 1000 + 1800 });
                state.bars[1] = ARCANE_INTELLECT.id;
                state.party = [
                    { name: "Bob", classToken: "WARRIOR", power: POWER.Rage, auras: [] },
                    { name: "Alice", classToken: "PRIEST", power: POWER.Mana, auras: [] },
                    { name: "Far", classToken: "DRUID", power: POWER.Mana, auras: [], isOutOfRange: true },
                ];
            },
            { styles: { missingBuff: { isMessageOn: true } } },
        );
    });

    it("is told to buff a member who uses mana", () => {
        expect(world.notice()).toContain("Arcane Intellect missing on: Alice");
    });

    it("is not told about a member who uses rage", () => {
        expect(world.notice()).not.toContain("Bob");
    });

    it("is not told about a member who is out of range", () => {
        expect(world.notice()).not.toContain("Far");
    });
});

const FROST_ARMOR: SpellDefinition = { id: 168, name: "Frost Armor", rank: 1, icon: 135843, isHelpful: true };
const FROST_ARMOR_3: SpellDefinition = { ...FROST_ARMOR, id: 7301, rank: 3 };
const ICE_ARMOR: SpellDefinition = { id: 7302, name: "Ice Armor", rank: 1, icon: 135843, isHelpful: true };
const ICE_ARMOR_3: SpellDefinition = { ...ICE_ARMOR, id: 10219, rank: 3 };

const INTELLECT_PT: SpellDefinition = { ...ARCANE_INTELLECT, name: "Inteligência Arcana", rank: 1 };
const INTELLECT_PT_RANKS: SpellDefinition[] = [1460, 1461, 10156, 10157].map((id, index) => ({
    ...ARCANE_INTELLECT,
    id,
    name: "Intelecto Arcano",
    rank: index + 2,
}));

/** The Portuguese client gives rank 1 and the higher ranks different names (issue #24). */
function createPortugueseMage(buff: SpellDefinition): World {
    return createWorld((state) => {
        playAs(state, MAGE);
        learnSpell(state, INTELLECT_PT);
        learnSpell(state, buff);
        state.bars[1] = buff.id;
        state.auras.push({ name: buff.name, spellId: buff.id, expirationTime: 1000 + 1800 });
    });
}

describe("a mage whose Arcane Intellect ranks have different Portuguese names", () => {
    for (const buff of INTELLECT_PT_RANKS) {
        it(`sees no missing-buff glow with rank ${buff.rank} on`, () => {
            expect(createPortugueseMage(buff).glowsOn(1)).toBe(0);
        });
    }

    it("sees the reminder return when the higher-rank buff is cancelled", () => {
        const world = createPortugueseMage(INTELLECT_PT_RANKS[0]!);
        world.state.auras = [];
        world.fire("UNIT_AURA", "player");
        world.advance(2);
        expect(world.glowsOn(1)).toBe(1);
    });

    it("remembers the higher rank when combat hides the player's auras", () => {
        const world = createPortugueseMage(INTELLECT_PT_RANKS[0]!);
        world.state.isInCombat = true;
        world.state.areAurasHidden = true;
        world.fire("PLAYER_REGEN_DISABLED");
        world.advance(35);
        expect(world.glowsOn(1)).toBe(0);
    });

    it("accepts a higher rank on a party member, and notices its removal", () => {
        const buff = INTELLECT_PT_RANKS[0]!;
        const world = createPortugueseMage(buff);
        world.state.party = [{ name: "Alice", classToken: "PRIEST", power: POWER.Mana, auras: [world.makeAura(buff.name, buff.id, 1800)] }];
        world.fire("GROUP_ROSTER_UPDATE");
        world.advance(2);
        expect(world.glowsOn(1)).toBe(0);
        world.state.party[0]!.auras = [];
        world.fire("UNIT_AURA", "party1");
        world.advance(2);
        expect(world.glowsOn(1)).toBe(1);
    });

    it("still recognizes a remapped aura ID by its localized higher-rank name", () => {
        const world = createPortugueseMage(INTELLECT_PT_RANKS[0]!);
        world.state.auras[0]!.spellId = 900001;
        world.fire("UNIT_AURA", "player");
        world.advance(2);
        expect(world.glowsOn(1)).toBe(0);
    });

    it("recognizes a listed rank ID even when the aura's name differs from the spellbook", () => {
        const world = createPortugueseMage(INTELLECT_PT_RANKS[0]!);
        world.state.auras[0]!.name = "Nome diferente na aura";
        world.fire("UNIT_AURA", "player");
        world.advance(2);
        expect(world.glowsOn(1)).toBe(0);
    });

    it("does not mistake an unrelated buff for Arcane Intellect", () => {
        const world = createPortugueseMage(INTELLECT_PT_RANKS[0]!);
        world.state.auras = [world.makeAura("Outro buff", 900002, 1800)];
        world.fire("UNIT_AURA", "player");
        world.advance(2);
        expect(world.glowsOn(1)).toBe(1);
    });

    it("remembers a higher rank cast while auras are hidden for its full buff duration", () => {
        const buff = INTELLECT_PT_RANKS[0]!;
        const world = createPortugueseMage(buff);
        world.state.auras = [];
        world.fire("UNIT_AURA", "player");
        world.advance(2);
        world.state.isInCombat = true;
        world.state.areAurasHidden = true;
        world.fire("PLAYER_REGEN_DISABLED");
        world.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "cast-guid", buff.id);
        world.advance(35);
        expect(world.glowsOn(1)).toBe(0);
    });
});

/** A mage who knows both armors (Ice Armor in its higher ranks), each on a bar, with the given armor on them. */
function createArmorWorld(armor: SpellDefinition | undefined): World {
    return createWorld((state) => {
        playAs(state, MAGE);
        for (const spell of [FROST_ARMOR, FROST_ARMOR_3, ICE_ARMOR, ICE_ARMOR_3]) learnSpell(state, spell);
        state.bars[1] = FROST_ARMOR_3.id;
        state.bars[2] = ICE_ARMOR_3.id;
        if (armor !== undefined) state.auras.push({ name: armor.name, spellId: armor.id, expirationTime: 1000 + 1800 });
    });
}

describe("a mage with Frost Armor and Ice Armor on the bars", () => {
    it("is told to put on one armor when none is on", () => {
        const world = createArmorWorld(undefined);
        expect(world.glowsOn(1) + world.glowsOn(2)).toBe(1);
    });

    it("sees no glow with Ice Armor on, whatever its rank", () => {
        const world = createArmorWorld(ICE_ARMOR_3);
        expect([world.glowsOn(1), world.glowsOn(2)]).toEqual([0, 0]);
    });

    it("sees no glow with Frost Armor on, whatever its rank", () => {
        const world = createArmorWorld(FROST_ARMOR_3);
        expect([world.glowsOn(1), world.glowsOn(2)]).toEqual([0, 0]);
    });
});
