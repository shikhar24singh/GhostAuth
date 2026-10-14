# GhostAuth phone review

## 0.6.1 dark mode

Physical appearance review is pending. Install over the current app to preserve existing credentials, selections, privacy choices and history.

- [ ] In Settings, enable Dark mode. Confirm readable text, accents, inputs, app icons, dialogs and Activity in portrait and landscape; switch back to light.
- [ ] Enable dark again, force-close/reopen and reboot. Confirm the choice persists without changing PIN, fingerprint, selected apps or history.
- [ ] Open Presto externally. Confirm dark branded handoff/shield, fingerprint screen and PIN fallback; check status/navigation bar icons, system biometric prompt and launch background on this phone.
- [ ] Clear history and reset app/privacy preferences. Confirm appearance stays dark while each action retains its documented credential behavior.



## 0.6.0 persistent security history

Physical history review is pending. Install over 0.5.1 to retain credentials, selections and privacy choices. The 0.5.1 user-reported results below remain valid for that build; new history behavior has automated coverage only.

- [ ] With Security history enabled, enter a wrong PIN, then verify correctly. In Activity, confirm both outcomes, correct package/label, date/time and method.
- [ ] Repeat with wrong/correct fingerprint, cancellation/PIN fallback and Android biometric lockout. Confirm distinct outcomes and no credential or app content in details.
- [ ] Force-close/reopen GhostAuth and reboot the phone. Confirm entries survive and never allow an app to open without fresh verification.
- [ ] Turn Security history off and save. Confirm new attempts are not recorded across reload, existing entries remain, and re-enabling records future attempts only. If it was already disabled in 0.5.1, confirm upgrade keeps it off.
- [ ] In Activity, cancel Clear history once, then confirm deletion. Reload/reboot and confirm old entries do not return; PIN, fingerprint, selected apps and recording choice still work.
- [ ] Remove or rename a test app, or use two apps with the same label. Confirm retained labels/packages remain accurate; review portrait/landscape and older dates.
- [ ] Generate more than 100 checks where practical; confirm only the newest 100 remain. Reset preferences and confirm history remains while selections empty and default privacy choices return.



## 0.5.1 fingerprint-first update

The user reported all three proposed phone-review groups passed on 2026-10-13 ("done all these, it works fine"). These results were not independently observed; phone model and Android version were not provided.

- [x] Direct Presto opening automatically requests fingerprint; a match opens immediately and a wrong scan keeps it locked.
- [x] PIN fallback, cancellation, leaving/reopening Presto and screen locking.
- [x] Notification and Recents openings, including after swiping GhostAuth away.

The detailed checklist below includes additional scenarios not separately reported. Install over the previous APK to retain credentials and preferences.

- [x] Open Presto externally with fingerprint enabled, including after closing/swiping away GhostAuth. Confirm the GhostAuth mark, fingerprint reader/system prompt, and bottom-right **Use PIN instead** appear automatically, without choosing fingerprint first.
- [x] Present an enrolled fingerprint. Confirm Presto opens immediately without a success screen or another Open tap.
- [x] Present a wrong fingerprint. Confirm an error appears and Presto stays locked; retry with the correct finger.
- [ ] Choose **Use PIN instead** in the system prompt and on the GhostAuth screen. Confirm wrong PIN stays locked and correct PIN opens Presto immediately.
- [ ] Cancel fingerprint, retry, trigger Android biometric lockout, background the check and replace the requested app. Confirm cancellation, late results and old-package verification cannot open an app.
- [ ] Disable fingerprint or change Android enrollment. Confirm PIN becomes the initial option and saved PIN still works.
- [ ] Review sensor/prompt placement and PIN fallback in portrait, landscape and display cutouts; Android controls the system dialog.

The older sections below record the behaviors and reported results of those versions.

## 0.5.0 protection service update

Core external-opening, cancellation, re-entry and screen-lock groups passed in 0.5.1 according to the user on 2026-10-13. Additional detailed checks below remain unreported. Install over the previous APK; enable **Permissions → Protection service → Enable protection**, then enable **GhostAuth protection** in Android Accessibility. Confirm active status when returning.

- [ ] Open Presto directly while GhostAuth is closed/swiped away. Confirm the shield and verification appear; complete PIN or fingerprint verification and open the correct package.
- [ ] Repeat through a notification and Recents. Record any OEM launch restrictions, content flashes, notification previews, split-screen or PiP gaps.
- [ ] Wrong PIN, canceled fingerprint, Cancel, Back and Close app must not approve Presto. Home navigation and Android Settings must remain usable.
- [ ] Leave Presto for another app, return, and turn the screen off/on. Confirm it relocks; typing with the keyboard must not repeatedly relock it.
- [ ] Save different selected apps, then restart GhostAuth/service/device. Confirm scope persists but approvals do not.
- [ ] Disable in GhostAuth or Android Accessibility, interrupt/force-stop the service, then return. Confirm inactive/interrupted status and document that protection stops. Re-enable and confirm fresh verification.
- [ ] Reset preferences while service access remains enabled. Confirm native scope is empty and PIN/fingerprint remain enrolled across reload.


## 0.4.0 verified launch update

Install the APK over the previous build; retain existing selections, privacy choices and native credentials. These new checks are pending physical review.

- [ ] While offline, verify a selected app with PIN, then tap Open. Confirm Android opens that exact package, including apps sharing a label. Returning to GhostAuth must require fresh verification.
- [ ] Repeat with fingerprint. Cancel the prompt and enter a wrong PIN; neither may launch an app.
- [ ] Verify, then wait at least 30 seconds or background/force-close GhostAuth before opening. Confirm fresh verification is required. Repeated taps must not reuse approval.
- [ ] Verify a test app, then uninstall or disable it before tapping Open. Confirm safe failure, refreshed selection and cleared verification.
- [ ] Open a selected app directly through the launcher, notifications and Recents. Confirm the interface accurately describes these openings as unrestricted in this build.


## 0.3.1 icon update

The completed review below applies to 0.3.0. The 0.3.1 APK adds actual app icons and keeps existing app selections, privacy choices and native credentials.

- [ ] Confirm Android app icons match the installed apps in both app selection and the home list, including adaptive icons, while offline.
- [ ] Confirm icons remain correctly associated when searching by label/package or displaying apps with the same label. Review portrait and landscape layouts.

## 0.3.0 review results

Status: all four summary review groups passed, as reported by the user on 2026-10-12: catalog/preferences, usage access/notifications/Settings return, PIN persistence/reboot lockout, and biometric prompt/enrollment invalidation. Phone model and Android/API version were not provided. Checked items below reflect those reports; unmarked additional scenarios have not been explicitly reported. Automated bridge checks do not exercise the Android Settings app, PackageManager, Keystore or biometric sensor.

Install `artifacts/GhostAuth-debug.apk` over the existing preview to keep native credentials. Record phone model, Android/API version, build version and outcomes below. Fresh installs require creating a PIN; upgrades retain an enrolled native PIN but require selecting real apps once.

## Catalog and preferences

- [x] Open offline. Confirm the app list matches launchable apps in the current Android profile, contains no duplicate packages, and excludes GhostAuth. Browser sample apps must not appear as fallback entries.
- [x] Search by label and package name. Select an app, save, force-close and reopen. Confirm the same package is selected, including when two apps share a label.
- [x] Change selection without saving and reload. Confirm unsaved changes are discarded.
- [x] When upgrading from 0.2.0, confirm saved privacy choices and native credentials are retained while app selection starts empty. After an explicit reset, confirm default privacy choices persist across reload.
- [x] Uninstall a selected test app, return to GhostAuth and refresh. Confirm it disappears and cannot retain a verified state.
- [x] Reset preferences. Confirm selections become empty and the enrolled PIN and biometric settings remain intact.

## Permissions and lifecycle

- [x] From Permissions, open usage access. Grant it in Android Settings and return. Confirm the status becomes enabled without simulating a grant.
- [x] Revoke usage access and return. Confirm the status changes and displayed identity approval clears. Repeat with notifications; review notification settings on API 24–25 and API 33+ where available. This report applies to the tested phone; coverage of other Android versions was not provided.
- Cancel Settings navigation or leave access denied. Confirm app selection and local PIN/biometric checks still work.
- Confirm protection service reports **Not implemented in this build**, offers no enable action, and home never says protection is active.
- Confirm granting both permissions does not block other apps, read usage history or send protection alerts.
- Review portrait, landscape, long app lists, Back navigation and return from Settings on the phone's Android skin.

## Native authentication

- [x] Verify the enrolled PIN after force-close/reopen and reboot. Confirm no default `123456` PIN is accepted unless explicitly chosen.
- [x] Enter five wrong PINs, restart the app and reboot. Confirm lockout persists; resetting preferences must not remove it.
- Change the PIN using the existing PIN. Verify the old PIN fails and the new one succeeds.
- [x] Enable biometrics using the PIN and Android prompt. Verify cancel, success, disable and PIN fallback.
- [x] Change Android biometric enrollment. Confirm GhostAuth requires enabling biometrics again using the PIN.
- Background GhostAuth during a prompt; return after a late callback. Confirm approval cannot be restored. Verify approval expires after 30 seconds, reload and restart.

| Device / Android version | Check | Result / observations |
| --- | --- | --- |
| Not provided | Catalog and preferences: all six checks above | Passed — user-reported on 2026-10-12 |
| Not provided | Usage access / notifications / Settings return | Passed — user-reported on 2026-10-12 |
| Not provided | PIN persistence and reboot lockout | Passed — user-reported on 2026-10-12 |
| Not provided | Biometric prompt and enrollment invalidation | Passed — user-reported on 2026-10-12 |
