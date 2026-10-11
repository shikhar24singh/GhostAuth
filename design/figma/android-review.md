# Android frontend review

Reviewed October 10, 2026. The user selected Android and confirmed that the Wi-Fi preview **loads and looks right** on their phone. Device model, OS and browser versions were not supplied; this confirmation is a visual smoke review.

## Changes from the review

- Expanded small links, the search field and the dialog close control to at least 48 CSS pixels.
- Filled the phone viewport in portrait and landscape; retained the 390px desktop review frame.
- Compacted headings and header spacing in landscape so an app row is visible before scrolling.
- Made screen content scroll separately from the header and bottom navigation so navigation cannot cover actions or the last activity row.
- Reset content scrolling when navigating to a new screen.
- Added space for display cutouts and the bottom system area, and made dialogs scroll within short viewports.
- Used `inputmode="none"` for the custom PIN keypad to avoid requesting a second software keyboard. Hardware typing remains supported.
- Added a PIN alternative to fingerprint verification and corrected the recovery label when fingerprint is not enrolled.

## Verification

`tests/mobile-browser.cjs` runs the existing frontend flows and `tests/android-review.cjs` adds a Chromium mobile touch review. The review covers all 33 route definitions at 320×568, 360×640, 390×844, 412×915 and 844×390 (165 layout checks).

Additional checks cover minimum touch-target dimensions, dialog fit and dismissal, searching in a reduced-height viewport, PIN keypad taps and browser Back, permission restoration, navigation during long activity scrolling, and simulated top/bottom display insets.

Automated emulation does not reproduce a real Android software keyboard, TalkBack, system permission sheets or native biometric hardware. Android integration remains a later step.

The saved report is `android-review-validation.json`; screenshots are generated under the ignored `tmp/mobile-qa/` directory.

## References used for the fixes

- [Android touch-target guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views): applied as a 48 CSS pixel target in this browser interface.
- [MDN inputmode reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode): `none` is intended for a page that provides its own keyboard control.
- [Chromium keyboard viewport behavior](https://developer.chrome.com/blog/viewport-resize-behavior/): the viewport metadata requests resizing content when search opens the software keyboard.
