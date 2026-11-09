# Why the code looks defensive: the game's quirks

Some code here looks more careful than it needs to be: protected calls, memory of what was seen,
delays, caches. Each of these exists because of something the Forever client (1.60.1) does. This
page lists them, so that nobody "simplifies" one away by accident.

The knowledge comes from the earlier Lua version of the addon and from the comments that were kept
in the code. When the client changes, a row here may stop being true.

| # | What the game does | What the code does about it | Where |
|---|---|---|---|
| 1 | **In combat it hides the auras on the player**: the list comes back empty, or its names and IDs are *secret*. "Not found" proves nothing then. | A buff that was seen or cast is remembered for as long as it lasts; "not found" only counts out of combat. | `addons/buff-reminder/src/character/buff-memory.service.ts`, `hasAura` in `addons/buff-reminder/src/character/buff-state.service.ts` |
| 2 | **Secret values**: some values may not be read, compared or calculated with, and doing it raises an error. | Every value from the game goes through a readability check first; the combat state itself is read with the one comparison that is allowed (against nil). | `isReadable`, `getReadable` in `packages/@wowkit/wow/src/utils/secret-value.utils.ts`; `isInCombat` in `packages/@wowkit/wow/src/player.service.ts` |
| 3 | **Other people's auras are hidden in combat**, and may be partly hidden out of it. | Party buffs are checked out of combat only; an aura the game hid counts as "unknown", never as "missing". | `reminders/party-buffs.service.ts`, `getUnitBuffState` in `packages/@wowkit/wow/src/auras.service.ts` |
| 4 | **The name and ID of a cast spell are hidden in combat.** | The name is read when the cast starts and used to find the spell again; a cast that stays unknown is treated carefully (see 8). | `packages/@wowkit/wow/src/spell-cast.service.ts` |
| 5 | **Spell IDs are remapped**: the ID in the buff list may not be the ID the player has. | Spells are resolved by ID, then by override, then by name through the spellbook index; aura matching uses names, which survive remapping. | `resolve` in `packages/@wowkit/wow/src/spells.service.ts`, `knowledge/buff-categories.constants.ts` |
| 6 | **`SPELLS_CHANGED` fires in storms** (quest turn-in, level-up). Rebuilding on it froze the client. | The event is not used. Learning a spell, talents and level-ups schedule a small, merged refresh instead. | `scheduleSpellRefresh` in `tick/refresh.service.ts` |
| 7 | **Walking the whole spellbook froze the client** on quest turn-in. | The index is built a few skill lines per frame and at most every 5 seconds; a newly learned rank is added to it directly. | `packages/@wowkit/wow/src/spell-book.service.ts` |
| 8 | **Weapon enchant reads lag behind casts** and are sometimes missing. | After a cast a "missing" reading is ignored for a few seconds; a reading must hold for 1.5 seconds before it is believed; three sources (aura, enchant, tooltip) are combined. | `reminders/weapon/weapon-reminder.service.ts`, `packages/@wowkit/wow/src/weapon-enchants.service.ts` |
| 9 | **Reading item tooltips for every action slot froze the client.** | Tooltips are never read while mapping the bars; the bars are mapped a few buttons per frame, and the weapon tooltip is cached for a second. | `packages/@wowkit/wow/src/action-bars.service.ts`, `packages/@wowkit/wow/src/weapon-enchants.service.ts` |
| 10 | **A druid form or warrior stance pages the main bar** (bear form uses slots 97-108), while the button still says slot 1-12. | The slot is read from the paged ID first; a form change makes the buffs and the bars be read again. | `getActionSlot` in `packages/@wowkit/wow/src/action-bars.service.ts`, `noteShapeshift` in `tick/refresh.service.ts` |
| 11 | **Events come in bursts.** | Every request to look again is merged with the ones around it and delayed a little. Aura events do not force a tick at all; the regular tick (every 0.5 seconds in combat, every second out of it) reads the auras again. | `tick/refresh.service.ts` |
| 12 | **Any call into the game can raise an error** on unusual input or state. | Calls are made in protected mode, and the addon carries on. | `attempt`, `tryCall` in `packages/@wowkit/wow/src/utils/protected-call.utils.ts` |
| 13 | **The game blocks some actions of addons**, and its popup does not say which. | `ADDON_ACTION_BLOCKED` / `ADDON_ACTION_FORBIDDEN` are printed in the chat (with the combat state), to be reported. | `noteBlockedAction` in `character/blocked-action.service.ts` |
| 14 | **A group version on you is a different spell** (Prayer of Fortitude is not Power Word: Fortitude). | Buffs that replace each other are one *buff category*, listed by spell ID and matched by name (the client's own, so it holds in any language). | `knowledge/buff-categories.constants.ts` |
| 15 | **Blizzard adds its own functions to Lua's `string`, `math` and `table`** (`string.trim`, `math.round`...). | The boundary check treats those as the game's, not as plain Lua. | `scripts/check-boundary.ts` |
| 16 | **The gamepad bars stay loaded outside gamepad mode**, hidden, and their slots (195 on) may still hold old spells (a druid's Rank 1 Wrath on its bear page). | Their buttons are mapped only while the gamepad bars are shown; the gamepad mode coming or going maps the bars again. | `listGamepadButtons` in `packages/@wowkit/wow/src/gamepad-buttons.ts`, `countAddonButtons` in `packages/@wowkit/wow/src/bar-refresh.service.ts` |
| 17 | **A frame's visibility can be a secret boolean** (a nameplate, in combat). `not frame:IsVisible()` raises "attempt to perform boolean test on a secret boolean value" and stops the scan of every frame. | An unreadable answer counts as not showing. The same goes for a secret name, type or attribute on that walk. | `isShown` in `packages/@wowkit/wow/src/button-search.service.ts` |

## Not the game's fault, but just as easy to break

- **The bundled Lua cannot resolve import cycles** (TypeScriptToLua uses `require`). Lower services
  announce news with an event on the `EventBus` (`@OnEvent`) instead of importing upper ones.
- **WoW's Lua is 5.1**: no `goto`, no integer division. The build targets Lua 5.1.
