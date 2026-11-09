// Buff categories: any member counts for the whole category. Some are exclusive (one aspect, one
// armor), others pair a buff with its group version (Prayer of Fortitude counts as Fortitude).
// The members are spell IDs; their names are read from the client, so the categories hold in every language. They are
// matched by ID when listed, then by localized name: the client often hides the aura ID in combat.
import { Hunter as H, Mage as M, Paladin as P, Priest as Pr, Druid as D, Warlock as L, Tracking } from "@wowkit/wow-data";

export interface BuffCategory {
    key: string;
    /** The spells whose buffs count for each other; list ranks explicitly when their localized names differ. */
    members: number[];
    /** How long a seen or cast member counts as up while auras are hidden. */
    seconds: number;
}

export const BUFF_CATEGORIES: BuffCategory[] = [
    {
        key: "blessing",
        members: [
            P.BlessingMight,
            P.BlessingKings,
            P.BlessingWisdom,
            P.BlessingSalvation,
            P.BlessingLight,
            ...P.GreaterBlessingMight,
            ...P.GreaterBlessingKings,
            ...P.GreaterBlessingWisdom,
            ...P.GreaterBlessingSalvation,
            ...P.GreaterBlessingLight,
        ],
        seconds: 300,
    },
    {
        key: "palaura",
        members: [
            P.DevotionAura,
            P.RetributionAura,
            P.ConcentrationAura,
            P.SanctityAura,
            P.FireResistAura,
            P.FrostResistAura,
            P.ShadowResistAura,
        ],
        seconds: 1800,
    },
    {
        key: "missingSeal",
        members: [
            P.SealOfRighteousness,
            P.SealOfCommand,
            P.SealOfTheCrusader,
            P.SealOfWisdom,
            P.SealOfLight,
            P.SealOfJustice,
            P.SealOfFury,
        ],
        seconds: 30,
    },
    // Only one tracking is on at a time; it lasts until another one is put on
    { key: "missingTracking", members: Object.values(Tracking), seconds: 1800 },
    { key: "aspect", members: [H.AspectHawk, H.AspectMonkey, H.AspectWild, H.AspectCheetah, H.AspectPack, H.AspectBeast], seconds: 1800 },
    { key: "magearmor", members: [M.MageArmor, M.IceArmor, M.FrostArmor], seconds: 1800 },
    { key: "lockarmor", members: [L.DemonArmor, L.DemonSkin], seconds: 1800 },
    // A buff and its group version
    { key: "fortitude", members: [Pr.PowerWordFortitude, ...Pr.PrayerOfFortitude], seconds: 1800 },
    { key: "spirit", members: [Pr.DivineSpirit, ...Pr.PrayerOfSpirit], seconds: 1800 },
    { key: "shadowprotection", members: [Pr.ShadowProtection, ...Pr.PrayerOfShadowProtection], seconds: 600 },
    { key: "wild", members: [D.MarkOfTheWild, ...D.GiftOfTheWild], seconds: 1800 },
    { key: "intellect", members: [...M.ArcaneIntellectRanks, ...M.ArcaneBrilliance], seconds: 1800 },
];
