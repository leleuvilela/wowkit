// Is a buff up on the player or on a party member? Put together from the auras the game shows (AurasService of
// @wowkit/wow), the buff categories (any aspect counts for an aspect, a group version for the single buff) and the
// memory that fills in while the client hides the player's auras in combat.
import {
    type AuraEntry,
    type AuraRead,
    type AurasService,
    type PlayerService,
    type SpellsService,
    isReadable,
    buildNameKey,
    hasKnownExpiry,
} from "@wowkit/wow";
import { Warrior } from "@wowkit/wow-data";
import type { BuffCategory } from "../knowledge/buff-categories.constants";
import type { BuffKnowledgeService } from "../knowledge/buff-knowledge.service";
import type { BuffMemoryService } from "./buff-memory.service";

export interface BuffRead extends AuraRead {
    /** The buff categories seen in the scan (category key -> aura). */
    categories?: LuaMap<string, AuraEntry>;
}

export type UnitBuffState = "has" | "missing" | "unknown";

/** Shield Block ends after this many blocks (its stacks on Forever), or when its time is up. */
const SHIELD_BLOCK_CHARGES = 2;

export class BuffStateService {
    /** The blocks Shield Block has left since it was cast; 0 when it is not up. */
    private shieldBlockCharges = 0;

    constructor(
        private readonly auras: AurasService,
        private readonly spells: SpellsService,
        private readonly player: PlayerService,
        private readonly memory: BuffMemoryService,
        private readonly knowledge: BuffKnowledgeService,
    ) {}

    wipeAuraScans(): void {
        this.auras.wipeAuraScans();
    }

    wipeAuraScan(unit: string | undefined): void {
        this.auras.wipeAuraScan(unit);
    }

    /** What the game shows of a buff on the player, without the memory: asked directly, then looked for in the list. */
    findAura(spellId: number | undefined): BuffRead {
        if (spellId === undefined) return { isFound: false, remain: 0, isUnreadable: false };
        return this.auras.readPlayerAura(spellId) ?? this.readFromScan(spellId);
    }

    /**
     * Is the buff on the player, counting the remembered state while the client hides auras? `lead`: a buff with no more
     * than this many seconds left counts as gone already, so its reminder comes in time to cast it again.
     */
    hasAura(spellId: number, lead = 0): boolean {
        const read = this.findAura(spellId);
        if (read.isFound) {
            this.memory.remember(spellId, undefined, read.remain, false);
            return lead === 0 || !hasKnownExpiry(read.remain) || read.remain > lead;
        }
        // The client hides auras in combat (none at all, or some whose name and ID are secret): a buff we saw or cast is
        // trusted until it runs out. A list it shows in full is believed, in combat too: a buff the player cancelled is gone.
        if (read.isUnreadable) return this.memory.isRemembered(spellId, lead);
        this.memory.release(spellId, read.categories);
        return false;
    }

    /** The auras of the buff's name on the player (their IDs may differ); undefined while the client hides auras. */
    findAuras(spellId: number): AuraEntry[] | undefined {
        const scan = this.auras.scanAuras("player");
        if (scan.isUnreadable || scan.auras.some((aura) => aura.isHidden || aura.name === undefined)) return undefined;
        if (scan.auras.length === 0 && this.isEmptyListSuspicious()) return undefined;
        const wantKey = buildNameKey(this.getBuffName(spellId) ?? "");
        return scan.auras.filter((aura) => buildNameKey(aura.name!) === wantKey);
    }

    /** The player cast a spell: if it is a buff on the player, it is up now. */
    noteSelfBuff(spellId: number | undefined): void {
        if (spellId === undefined || !isReadable(spellId)) return;
        this.memory.remember(spellId, undefined, undefined, true);
        if (this.spells.getSpellName(spellId) === this.spells.getSpellName(Warrior.ShieldBlock))
            this.shieldBlockCharges = SHIELD_BLOCK_CHARGES;
    }

    /** The player blocked: a charge of Shield Block is used, and with the last one it is gone, before its time. */
    noteBlock(): void {
        if (this.shieldBlockCharges === 0) return;
        this.shieldBlockCharges -= 1;
        if (this.shieldBlockCharges === 0) this.memory.forget(Warrior.ShieldBlock);
    }

    /** A shapeshift happened. */
    noteFormChange(): void {
        this.memory.forgetForms();
        this.auras.wipeAuraScans();
    }

    /**
     * Does another unit (a party member) have the buff, or another buff of its category (Prayer of
     * Fortitude for Fortitude)? `isOwnOnly`: only an aura the player cast counts. "unknown" when the client hid
     * the auras: there is no memory for other units, so a hidden aura never counts as missing.
     */
    getUnitBuffState(unit: UnitToken, spellId: number, isOwnOnly: boolean): UnitBuffState {
        const wantName = this.getBuffName(spellId);
        if (wantName === undefined) return "unknown";
        const wantKey = buildNameKey(wantName);
        const wantCategory = this.knowledge.findCategory(wantName, spellId);
        const scan = this.auras.scanAuras(unit);
        let isUnreadable = scan.isUnreadable;
        for (const aura of scan.auras) {
            const verdict = this.judgeUnitAura(aura, wantKey, wantCategory, isOwnOnly);
            if (verdict === "has") return "has";
            if (verdict === "hidden") isUnreadable = true;
        }
        return isUnreadable ? "unknown" : "missing";
    }

    /**
     * Which of these buffs the player put on another unit: the key of the first whose spells (the buff, its group
     * version) name an aura the player cast on it; undefined for none, or while the client hides the auras.
     */
    findOwnUnitBuff(unit: UnitToken, buffs: [key: number, spellIds: number[]][]): number | undefined {
        for (const aura of this.auras.scanAuras(unit).auras) {
            if (aura.isHidden || aura.name === undefined || aura.caster !== "player") continue;
            const auraKey = buildNameKey(aura.name);
            for (const [key, spellIds] of buffs) {
                if (
                    spellIds.some((id) => this.getBuffName(id) === aura.name || buildNameKey(this.spells.getHintName(id) ?? "") === auraKey)
                )
                    return key;
            }
        }
        return undefined;
    }

    /** What one aura of another unit says about the wanted buff: it is the buff, it hides what it is, or it is another one. */
    private judgeUnitAura(
        aura: AuraEntry,
        wantKey: string,
        wantCategory: BuffCategory | undefined,
        isOwnOnly: boolean,
    ): "has" | "hidden" | "other" {
        if (aura.isHidden || aura.name === undefined) return "hidden";
        const isWanted =
            buildNameKey(aura.name) === wantKey ||
            (wantCategory !== undefined && this.knowledge.findCategory(aura.name, aura.spellId) === wantCategory);
        if (!isWanted) return "other";
        if (!isOwnOnly || aura.caster === "player") return "has";
        return aura.caster === "hidden" ? "hidden" : "other";
    }

    /** The name the client gives the buff (the rank the player knows first). */
    private getBuffName(spellId: number): string | undefined {
        return this.spells.getSpellName(this.spells.resolve(spellId) ?? spellId) ?? this.spells.getSpellLabel(spellId);
    }

    /** Looks for the buff in the list of the player's auras: by name, by ID, then by its buff category. */
    private readFromScan(spellId: number): BuffRead {
        const resolved = this.spells.resolve(spellId);
        const wantName = this.getBuffName(spellId);
        const scan = this.auras.scanAuras("player");
        // No auras at all in combat while buffs are remembered, or an aura whose name is secret: the client hides them, and
        // the buff may be one of them
        const hasHiddenAura = scan.auras.some((aura) => aura.isHidden || aura.name === undefined);
        const isUnreadable = scan.isUnreadable || hasHiddenAura || (scan.auras.length === 0 && this.isEmptyListSuspicious());
        const { names, ids, categories } = this.indexAuras(scan.auras);
        const wantCategory = this.knowledge.findCategory(wantName, spellId);
        const aura =
            (wantName !== undefined ? names.get(buildNameKey(wantName)) : undefined) ??
            (resolved !== undefined ? ids.get(resolved) : undefined) ??
            ids.get(spellId) ??
            (wantCategory ? categories.get(wantCategory.key) : undefined);
        if (aura) return { isFound: true, remain: aura.remain, isUnreadable: false, categories };
        return { isFound: false, remain: 0, isUnreadable, categories };
    }

    /** The readable auras by name key, by ID, and by buff category. */
    private indexAuras(auras: AuraEntry[]): {
        names: LuaMap<string, AuraEntry>;
        ids: LuaMap<number, AuraEntry>;
        categories: LuaMap<string, AuraEntry>;
    } {
        const names = new LuaMap<string, AuraEntry>();
        const ids = new LuaMap<number, AuraEntry>();
        const categories = new LuaMap<string, AuraEntry>();
        for (const aura of auras) {
            if (aura.isHidden) continue;
            if (aura.spellId !== undefined) ids.set(aura.spellId, aura);
            if (aura.name === undefined) continue;
            names.set(buildNameKey(aura.name), aura);
            const category = this.knowledge.findCategory(aura.name, aura.spellId);
            if (category) categories.set(category.key, aura);
        }
        return { names, ids, categories };
    }

    /**
     * No auras at all in combat while we remember some: the client hides them rather than the player having none. Out of
     * combat it shows them, with a target too: an empty list is no aura (a cancelled one).
     */
    private isEmptyListSuspicious(): boolean {
        return !this.memory.isEmpty() && this.player.isInCombat();
    }
}
