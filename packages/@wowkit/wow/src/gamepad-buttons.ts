// The action buttons of the gamepad bars Forever draws in gamepad mode, in place of the usual ones: action buttons under
// names of their own ("GamepadMainActionBarFramePageUnitLeft...ActionButton1"), found among the frame's children.
// Outside gamepad mode the client keeps the frame, hidden, its buttons on slots of their own (195 on) that may still hold
// the spells of long ago (a druid's Rank 1 Wrath on its bear page): those buttons are not on the player's screen.

import { attempt } from "./utils/protected-call.utils";
import { getReadable } from "./utils/secret-value.utils";

const GAMEPAD_BAR = "GamepadMainActionBarFrame";
/** How deep the buttons of the gamepad bars sit under their frame, at most. */
const GAMEPAD_DEPTH = 6;

/** Is the frame of the gamepad bars on the screen: is the player in gamepad mode? */
export function isGamepadBarShown(): boolean {
    const root = (_G as unknown as { [name: string]: Frame | undefined })[GAMEPAD_BAR];
    return root !== undefined && getReadable(attempt(() => root.IsVisible())) === true;
}

/** Every child of the gamepad bars' frame, at any depth, that shows an action slot; none outside gamepad mode. */
export function listGamepadButtons(): ActionButton[] {
    const found: ActionButton[] = [];
    if (!isGamepadBarShown()) return found;
    const addButtonsUnder = (frame: Frame, depth: number) => {
        if (depth > GAMEPAD_DEPTH) return;
        for (const child of [...frame.GetChildren()]) {
            // An action button shows a slot; the class button a spell (`action` 0 and a `spellID`)
            if (type((child as { action?: unknown }).action) === "number") found.push(child as unknown as ActionButton);
            else addButtonsUnder(child, depth + 1);
        }
    };
    addButtonsUnder((_G as unknown as { [name: string]: Frame })[GAMEPAD_BAR]!, 0);
    return found;
}
