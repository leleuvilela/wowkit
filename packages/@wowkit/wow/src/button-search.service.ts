// Finds the action buttons of bar addons the addon has no list of names for: every frame of the game is looked at, a few a
// frame so the game does not stutter, and what is an action button by its own say joins the bars, as a button of no numbered
// bar. It runs at each login, so a new bar addon just works; the buttons of the known bars are left to their list.
// A frame may answer with a secret value (a nameplate's visibility, in combat). Testing that boolean raises and stops the
// scan, so an unreadable answer counts as "not this".
import type { OnFirstLogin } from "@wowkit/core";
import type { ActionBarsService } from "./action-bars.service";
import { BARS, listAddonButtonNames } from "./bar-names";
import type { ButtonRegistryService } from "./button-registry.service";
import { attempt } from "./utils/protected-call.utils";
import { getReadable } from "./utils/secret-value.utils";

/** Frames looked at in one frame of the game. */
const FRAMES_PER_STEP = 500;
/** Sorts the buttons of no numbered bar after the bars. */
const NO_BAR = 99;
/** The stance bars (a warrior's stances, a paladin's auras) go together, as a bar of their own. */
const STANCE_BAR = 98;
const STANCE_PREFIXES = ["StanceButton", "BT4StanceButton", "DominosStanceButton", "ElvUI_StanceBarButton"];
const STANCE_BUTTONS = 10;

export interface ButtonSearchResult {
    /** Every action button that shows: of the known bars and found. */
    buttons: ActionButton[];
    /** Those that were found by searching. */
    found: ActionButton[];
    /** How many more there are that do not show now. */
    hiddenCount: number;
}

export class ButtonSearchService implements OnFirstLogin {
    private found: ActionButton[] = [];
    private knownNames: LuaSet<string> | undefined;
    /** In the order of the bars. */
    private readonly orderedNames: string[] = [];

    constructor(
        private readonly registry: ButtonRegistryService,
        private readonly actionBars: ActionBarsService,
    ) {}

    onFirstLogin(): void {
        this.findButtons(() => undefined);
    }

    /** Looks through every frame, then says what there is. */
    findButtons(whenDone: (this: void, result: ButtonSearchResult) => void): void {
        const found: ActionButton[] = [];
        let frame = EnumerateFrames();
        const findNextFrames = () => {
            for (let budget = FRAMES_PER_STEP; frame !== undefined && budget > 0; budget--) {
                if (this.isUnknownActionButton(frame)) found.push(frame as ActionButton);
                frame = EnumerateFrames(frame);
            }
            if (frame !== undefined) {
                C_Timer.After(0, findNextFrames);
                return;
            }
            this.addFound(found);
            whenDone({ buttons: this.listButtons(), found: this.found, hiddenCount: this.countHidden() });
        };
        findNextFrames();
    }

    private addFound(found: ActionButton[]): void {
        for (const button of found) {
            if (this.found.includes(button)) continue;
            this.found.push(button);
            this.registry.registerButton(button, undefined);
        }
        if (found.length > 0) this.actionBars.mapBars(true);
    }

    /** The buttons that show now, bar by bar: those of the known bars by their names, then those found. */
    listButtons(): ActionButton[] {
        const buttons: ActionButton[] = [];
        this.getKnownNames();
        for (const name of this.orderedNames) {
            const button = (_G as unknown as { [name: string]: ActionButton | undefined })[name];
            if (button !== undefined && this.isShown(button)) buttons.push(button);
        }
        for (const button of this.found) if (this.isShown(button)) buttons.push(button);
        return buttons;
    }

    /** The buttons that show now, one list for each bar (those of no numbered bar together, at the end). */
    listBars(): ActionButton[][] {
        const bars = new LuaMap<number, ActionButton[]>();
        for (const button of this.listButtons()) {
            const bar = this.isStanceButton(button) ? STANCE_BAR : (this.actionBars.getBarNumber(button) ?? NO_BAR);
            const list = bars.get(bar);
            if (list !== undefined) list.push(button);
            else bars.set(bar, [button]);
        }
        const numbers: number[] = [];
        for (const [bar] of bars) numbers.push(bar);
        numbers.sort((a, b) => a - b);
        return numbers.map((bar) => bars.get(bar)!);
    }

    private isStanceButton(button: ActionButton): boolean {
        const name = getReadable(attempt(() => button.GetName())) ?? "";
        return STANCE_PREFIXES.some((prefix) => string.sub(name, 1, prefix.length) === prefix);
    }

    private countHidden(): number {
        this.getKnownNames();
        let count = 0;
        for (const name of this.orderedNames) {
            const button = (_G as unknown as { [name: string]: ActionButton | undefined })[name];
            if (button !== undefined && !this.isShown(button)) count += 1;
        }
        for (const button of this.found) if (!this.isShown(button)) count += 1;
        return count;
    }

    /** Does it show, and say it is an action button, and is on no list? A frame that keeps its answers secret (Blizzard's aura buttons) is none. */
    private isUnknownActionButton(frame: Frame): boolean {
        if (getReadable(attempt(() => frame.IsForbidden())) !== false || !this.isShown(frame)) return false;
        if (getReadable(attempt(() => frame.IsObjectType("Button"))) !== true) return false;
        const name = getReadable(attempt(() => frame.GetName()));
        if ((name !== undefined && this.getKnownNames().has(name)) || this.registry.isRegistered(frame as ActionButton)) return false;
        return getReadable(attempt(() => (frame as ActionButton).GetAttribute("type"))) === "action";
    }

    /** Shown, as a plain boolean. A secret answer is not: testing it raises and stops the scan. */
    private isShown(frame: Frame): boolean {
        return getReadable(attempt(() => frame.IsVisible())) === true;
    }

    private getKnownNames(): LuaSet<string> {
        if (this.knownNames !== undefined) return this.knownNames;
        this.knownNames = new LuaSet<string>();
        for (const bar of BARS) for (let i = 1; i <= 12; i++) this.orderedNames.push(`${bar}Button${i}`);
        for (const name of listAddonButtonNames()) this.orderedNames.push(name);
        for (const prefix of STANCE_PREFIXES) for (let i = 1; i <= STANCE_BUTTONS; i++) this.orderedNames.push(`${prefix}${i}`);
        for (const name of this.orderedNames) this.knownNames.add(name);
        return this.knownNames;
    }
}
