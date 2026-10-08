# GhostNet frontend

A React + TypeScript frontend for a final-year project exploring adaptive Zero Trust access in learning networks. The prototype demonstrates role-based resource access, risk scenarios, verification, session revocation, and an audit trail.

**This is a frontend demonstration.** Identities, device details, locations, risk scores, and events are synthetic. There is no backend, real authentication, MFA provider, device telemetry, behavioral model, or dataset integration. The prototype produces no research measurements or security guarantees.

## Run locally

Use **Node.js 24 LTS** and npm. Node 24 supports both the Vite toolchain and the native TypeScript stripping used by the test command.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173`. No environment variables or API credentials are required.

```sh
npm test           # Demo policy and state-transition tests
npm run build     # TypeScript checks and production build in dist/
npm run preview   # Serve the built frontend locally
```

The tests cover role restrictions, verification, blocked and revoked sessions, audit events, and immutable state updates. They do not exercise the browser UI or prove backend security.

## Try the demo

The app initially opens the **administrator overview** so the interface can be explored immediately. To see the sign-in screen, use **Sign out of demo** beside the sidebar profile. On small screens, open navigation first. Select a role, choose **Fill demo details**, then submit the form. The form only validates email format and password length; it does not authenticate an account. Do not enter real credentials.

Use the role selector below the sidebar profile to compare resource availability:

| Resource | Student | Faculty | Administrator |
| --- | --- | --- | --- |
| Course materials | Available | Available | Available |
| Academic records | Available | Available | Available |
| Research cloud | Restricted | Available | Available |
| Admin console | Restricted | Restricted | Available |

These permissions also depend on the current demo session:

| Scenario | Simulated behavior |
| --- | --- |
| Normal activity | Risk score 12; permitted resources open as previews. |
| New device | Risk score 48; permitted resources require extra verification. Use code **123456**. Successful verification lowers the demo score to 24 and restores access allowed by the role. |
| Suspicious activity | Risk score 86; protected resources are blocked. Switching roles or attempting verification does not bypass the block. Select Normal activity or reset to leave this scenario. |

In **Active sessions**, revoking a remote session leaves the current session unchanged. Revoking the current session blocks protected resources and stays revoked across role and scenario changes. **Reset demo** starts a fresh session for the selected role and clears accumulated demo events. Signing in again also starts fresh.

All state lives in React memory. Reloading restores the initial administrator demo; the current URL hash can preserve the selected page. Audit dates and times are deterministic sample data, displayed in IST, rather than live activity.

## Pages

Navigation uses URL hashes, with browser back/forward support:

| Hash | View |
| --- | --- |
| `#overview` | Access summary, risk factors, sessions, and recent events |
| `#resources` | Resource previews and access decisions |
| `#sessions` | Synthetic devices and session revocation |
| `#audit` | Searchable events, filtered by allowed/challenged/denied decisions |

Sign-in, verification, access-restriction details, and revocation confirmation are UI states rather than separate routes. Unknown hashes fall back to the overview.

## Code map

```text
src/
  main.tsx                    React entry point
  App.tsx                     App shell, page views, navigation, and action handlers
  styles.css                  Responsive workspace styles
  components/
    AuthScreen.tsx            Demo sign-in form and role selection
    AuthScreen.css            Sign-in styles
    Modal.tsx                 Shared dialog with keyboard/focus handling
  lib/
    types.ts                  Domain types for roles, resources, sessions, and events
    demo-data.ts              Synthetic users, resources, signals, and initial records
    demo-state.ts             Pure policy and state-transition functions
tests/
  demo-state.test.ts          Node test-runner coverage for demo behavior
```

## Next integration steps

The existing separation between UI, data, and pure transitions provides clear places to connect a backend:

1. Replace the `signedIn` flag and `AuthScreen` callback in `App.tsx` with server-backed sign-in, sign-out, session restoration, and expiry handling. The server must derive roles from the authenticated identity; the demo role selector is not an authorization mechanism.
2. Replace `createDemoState` and `demo-data.ts` fixtures with API responses for the current user, resources, sessions, and audit events. Add loading, empty, and request-error states.
3. Replace `requestResource` and `getResourceDecision` at resource-action boundaries with server policy decisions and protected content requests. Every protected backend endpoint must enforce authorization, even if the frontend hides or disables an action.
4. Replace `verifyMfa` and the fixed code with a backend challenge lifecycle and a real verification provider. Replace `revokeSession` with server-side revocation, then refresh affected session and access state.
5. Supply risk factors and decisions from the planned analysis service. Connect periodic refresh or server events so updated risk and revoked/expired sessions update the interface. Decide which application signals can actually be collected before connecting the paper's datasets or training a model.
6. Persist audit events on the server with authoritative timestamps. Keep the current synthetic scenarios as an explicit development/demo mode for presentations and regression checks.

`src/lib/types.ts` is a starting point for response shapes, not a finalized API contract. Frontend checks and this demo's tests must never become the only access controls.
