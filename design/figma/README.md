# GhostAuth Figma design

[Open Android screens](https://www.figma.com/design/TM015DhFupKb6VtwjUoUFo/GhostNet?node-id=10-1645)

Completed October 10, 2026 using the direct Figma connector.

- 24 editable Android screens (390 × 844).
- 103 prototype links and three starting points: setup, daily protection, verification.
- Shared components, color and spacing variables, typography styles, component review sheet, and brand reference.
- Exact palette: #F5F4F0, #191919, #2448D8, #D8D6CF.
- Original approved fingerprint logo. Arimo and Cousine are the available Figma equivalents for Arial and Courier New.

`completed-state.json` is the continuation ledger with verified page and node IDs. Screen clipping and vertical overlap checks returned no issues; home, PIN retry, welcome, components, and brand reference were visually inspected. Android permission/biometric actions and PIN entry are illustrative prototype transitions.

The builder files retain construction history. Final horizontal-layout and navigation-icon corrections were applied directly in Figma. Do not rerun construction against populated pages; inspect the recorded nodes and update them in place.

## Interaction completion

The prototype now includes 9 additional feedback/preview screens (33 total), persistent application and privacy selection, PIN entry/backspace/confirmation/verification, preset search filters, and explicit Android permission, fingerprint, recovery and app-handoff previews. The default demo PIN is `123456`; completing setup replaces it for that prototype session.

Read `interaction-state.json` and `interaction-validation.json` alongside the original ledger. The audit found no unlinked actionable controls or invalid destinations. Fourteen read-only checks of persisted reaction definitions passed; viewer playback was not automated. Informational rows no longer show misleading arrows. Active navigation tabs intentionally remain on their current screen.

Figma normalizes conditional blocks to an if/else pair. The final PIN logic uses separate ordered two-branch conditionals; these were corrected directly after `fix-interactions.js` ran. That file is construction history, not a script to rerun. `verify-interactions.js` reads the saved reactions without changing the file.

## Frontend implementation

All 33 screen definitions are implemented in `src/mobile/screens.ts`, with their interactions in `src/mobile/GhostAuthApp.tsx`. High-fidelity design contexts are retained in `context/`. The frontend uses the approved PNG mark, Lucide icons, the exact palette, and locally bundled Arimo and Cousine fonts.

The browser implementation replaces preset search transitions with live filtering and PIN prototype variables with real React state and numeric input. Android-specific actions remain explicitly labeled previews. See the root README for the runnable walkthrough and testing commands.

The Android UI review is recorded in `android-review.md` and `android-review-validation.json`. It includes phone-width and touch fixes plus the user's confirmation that the Wi-Fi preview loads and looks right on their Android phone.

App selection and privacy choices now persist between reloads and reopened tabs in the same browser origin. Settings includes a confirmed reset. `preferences-implementation.md` documents the storage scope and error handling; `preferences-validation.json` records the browser checks. The production build, all 20 state tests, the preference flows and the 165 mobile layout checks passed.
