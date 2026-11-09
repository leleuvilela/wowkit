// What the addon knows about buffs that the game does not say: which buffs count for each other
// (the buff categories), which are shapeshift forms, and how long a buff lasts. The names come from the client by
// spell ID, so they hold in every language.

import type { ClassBuffsService } from "../reminders/class-buffs.service";
import { OnEvent } from "@wowkit/core";
import { type SpellsService, buildNameKey } from "@wowkit/wow";
import { Druid } from "@wowkit/wow-data";
import { BUFF_CATEGORIES, type BuffCategory } from "./buff-categories.constants";

/** The shapeshift forms: they have no end, and change only with a shapeshift. */
const FORMS = [Druid.BearForm, Druid.DireBearForm, Druid.CatForm, Druid.TravelForm, Druid.AquaticForm, Druid.Moonkin];

export class BuffKnowledgeService {
    /** Aura key (the name in the client's language) -> its category; built from the spell IDs when first asked. */
    private categoryByName: LuaMap<string, BuffCategory> | undefined;
    /** Listed spell IDs -> their category, independent of the client's translation. */
    private readonly categoryById = new LuaMap<number, BuffCategory>();
    /** The aura keys of the shapeshift forms, in the client's language. */
    private formKeys: LuaSet<string> | undefined;

    constructor(
        private readonly classBuffs: ClassBuffsService,
        private readonly spells: SpellsService,
    ) {
        for (const category of BUFF_CATEGORIES) {
            for (const spellId of category.members) this.categoryById.set(spellId, category);
        }
    }

    @OnEvent("spells.invalidated")
    forgetNames(): void {
        this.categoryByName = undefined;
        this.formKeys = undefined;
    }

    /** The category a buff belongs to: a listed ID first, then its name in the client's language. */
    findCategory(name: string | undefined, spellId?: number): BuffCategory | undefined {
        const category = spellId !== undefined ? this.categoryById.get(spellId) : undefined;
        if (category !== undefined) return category;
        if (name === undefined || name === "") return undefined;
        return this.getCategoryNames().get(buildNameKey(name));
    }

    /** Is this aura key (buildNameKey of a name) a shapeshift form? */
    isFormKey(key: string): boolean {
        if (!this.formKeys) {
            this.formKeys = new LuaSet();
            for (const spellId of FORMS) {
                for (const name of this.listNames(spellId)) this.formKeys.add(buildNameKey(name));
            }
        }
        return this.formKeys.has(key);
    }

    /** How long a seen or cast buff lasts (seconds), for buffs outside the categories. */
    getSeconds(spellId: number | undefined, name: string): number {
        return this.classBuffs.getBuffSeconds(spellId, name);
    }

    private getCategoryNames(): LuaMap<string, BuffCategory> {
        if (this.categoryByName) return this.categoryByName;
        const names = new LuaMap<string, BuffCategory>();
        for (const category of BUFF_CATEGORIES) {
            for (const spellId of category.members) {
                for (const name of this.listNames(spellId)) names.set(buildNameKey(name), category);
            }
        }
        this.categoryByName = names;
        return names;
    }

    /** The client's name of a spell, and the English hint for an ID the client does not name. */
    private listNames(spellId: number): string[] {
        const names: string[] = [];
        const clientName = this.spells.getSpellName(spellId);
        const hintName = this.spells.getHintName(spellId);
        if (clientName !== undefined && clientName !== "") names.push(clientName);
        if (hintName !== undefined && hintName !== "") names.push(hintName);
        return names;
    }
}
