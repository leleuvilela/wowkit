// Remembers the buffs on the player while the client hides them. In combat the client may return no
// auras at all, or auras whose name and ID are secret, so a buff seen or cast a moment ago counts
// as up until its usual duration runs out.

import { type AuraEntry, type ClockService, type SpellsService, hasKnownExpiry, buildNameKey } from "@wowkit/wow";
import type { BuffKnowledgeService } from "../knowledge/buff-knowledge.service";

/** A shapeshift form (Cat Form, Travel Form...): no end, only changes with a shapeshift. */
const FORM_SECONDS = 1800;
/** After a cast, a missing aura is not believed for this long (it may not have arrived yet). */
const CAST_SETTLE = 1;
/** After a shapeshift, the form cast this recently is the new one. */
const FORM_CAST_SETTLE = 1.5;

export class BuffMemoryService {
    /** Aura key -> the clock time when the memory runs out. */
    private readonly heldNames = new LuaMap<string, number>();
    /** Category key -> the clock time when the memory runs out. */
    private readonly heldCategories = new LuaMap<string, number>();
    /** Aura or category key -> the clock time of the player's cast. */
    private readonly castAt = new LuaMap<string, number>();

    constructor(
        private readonly spells: SpellsService,
        private readonly clock: ClockService,
        private readonly knowledge: BuffKnowledgeService,
    ) {}

    isEmpty(): boolean {
        return this.heldNames.isEmpty() && this.heldCategories.isEmpty();
    }

    /**
     * The buff was seen (with `remain` seconds left; undefined when unknown) or cast. A sighting
     * renews the memory: an aspect seen every few seconds never runs out.
     */
    remember(spellId: number | undefined, auraName: string | undefined, remain: number | undefined, isFromCast: boolean): void {
        const name = auraName ?? (spellId !== undefined ? this.spells.getSpellLabel(spellId) : undefined);
        if (name === undefined || name === "") return;
        const key = buildNameKey(name);
        const category = this.knowledge.findCategory(name, spellId);
        const seconds = category?.seconds ?? (this.knowledge.isFormKey(key) ? FORM_SECONDS : this.knowledge.getSeconds(spellId, name));
        const now = this.clock.getCurrentTime();
        const expires = this.findExpiry(key, now, seconds, remain, isFromCast);
        if (expires !== undefined) {
            this.heldNames.set(key, expires);
            if (category) this.heldCategories.set(category.key, expires);
        }
        if (isFromCast) {
            this.castAt.set(key, now);
            if (category) this.castAt.set(category.key, now);
        }
    }

    /** Is the buff (or a member of its category) remembered as up, with more than `lead` seconds left? */
    isRemembered(spellId: number, lead = 0): boolean {
        const name = this.spells.getSpellLabel(spellId);
        if (name === undefined || name === "") return false;
        const now = this.clock.getCurrentTime() + lead;
        if (now < (this.heldNames.get(buildNameKey(name)) ?? 0)) return true;
        const category = this.knowledge.findCategory(name, spellId);
        return category !== undefined && now < (this.heldCategories.get(category.key) ?? 0);
    }

    /** The buff was looked for and is gone. `categoriesSeen`: categories still up in the same scan. */
    release(spellId: number, categoriesSeen: LuaMap<string, AuraEntry> | undefined): void {
        const name = this.spells.getSpellLabel(spellId);
        if (name === undefined || name === "") return;
        const key = buildNameKey(name);
        const now = this.clock.getCurrentTime();
        if (now - (this.castAt.get(key) ?? -10) < CAST_SETTLE) return;
        this.heldNames.delete(key);
        const category = this.knowledge.findCategory(name, spellId);
        if (category && !categoriesSeen?.has(category.key) && now - (this.castAt.get(category.key) ?? -10) >= CAST_SETTLE) {
            this.heldCategories.delete(category.key);
        }
    }

    /** The buff ended before its time, as the game showed (its charges used up): it is not remembered any more. */
    forget(spellId: number): void {
        const name = this.spells.getSpellLabel(spellId);
        if (name === undefined || name === "") return;
        this.heldNames.delete(buildNameKey(name));
        this.castAt.delete(buildNameKey(name));
    }

    /**
     * A shapeshift happened: the remembered form is out of date (in combat the aura cannot be read
     * again). A form cast a moment ago is the new one and is kept.
     */
    forgetForms(): void {
        const now = this.clock.getCurrentTime();
        for (const [key] of this.heldNames) {
            if (this.knowledge.isFormKey(key) && now - (this.castAt.get(key) ?? -10) >= FORM_CAST_SETTLE) this.heldNames.delete(key);
        }
    }

    /**
     * When the memory of a buff runs out: at its known end, or after its usual duration when it was
     * cast, was seen without an end, or is not remembered any more. Undefined: keep what is held.
     */
    private findExpiry(key: string, now: number, seconds: number, remain: number | undefined, isFromCast: boolean): number | undefined {
        if (remain !== undefined && hasKnownExpiry(remain)) return now + remain;
        const isRenewal = isFromCast || remain !== undefined || (this.heldNames.get(key) ?? 0) <= now;
        return isRenewal ? now + seconds : undefined;
    }
}
