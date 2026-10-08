import test from 'node:test'
import assert from 'node:assert/strict'
import { RESOURCES } from '../src/lib/demo-data.ts'
import { createDemoState, getResourceDecision, requestResource, revokeSession, simulateScenario, switchRole, verifyMfa } from '../src/lib/demo-state.ts'

const courses = RESOURCES.find((resource) => resource.id === 'course-materials')!
const research = RESOURCES.find((resource) => resource.id === 'research-cloud')!
const admin = RESOURCES.find((resource) => resource.id === 'admin-console')!

test('role policy limits protected resources even in a low-risk session', () => {
  const student = createDemoState('student')
  assert.equal(getResourceDecision(student, courses).decision, 'allow')
  assert.equal(getResourceDecision(student, research).decision, 'deny')
  assert.equal(getResourceDecision(student, admin).decision, 'deny')
  assert.equal(getResourceDecision(createDemoState('faculty'), research).decision, 'allow')
  assert.equal(getResourceDecision(createDemoState('faculty'), admin).decision, 'deny')
  assert.equal(getResourceDecision(createDemoState('admin'), admin).decision, 'allow')
})

test('step-up verification restores allowed resources without bypassing role restrictions', () => {
  const challenged = simulateScenario(createDemoState(), 'new-device')
  assert.equal(getResourceDecision(challenged, courses).decision, 'challenge')
  const verified = verifyMfa(challenged)
  assert.equal(verified.mfaVerified, true)
  assert.equal(getResourceDecision(verified, courses).decision, 'allow')
  assert.equal(getResourceDecision(verified, admin).decision, 'deny')
  assert.equal(verified.auditLogs[0].action, 'Demo verification completed')
})

test('high-risk access cannot be restored by verification or a role switch', () => {
  const blocked = simulateScenario(createDemoState('student'), 'suspicious')
  assert.equal(verifyMfa(blocked), blocked)
  const elevatedRole = switchRole(blocked, 'admin')
  assert.equal(getResourceDecision(elevatedRole, admin).decision, 'deny')
  assert.equal(elevatedRole.sessions.find((session) => session.isCurrent)?.status, 'blocked')
})

test('a revoked current session stays denied after scenario changes and verification', () => {
  const revoked = revokeSession(createDemoState('admin'), 'session-current')
  const normal = simulateScenario(revoked, 'normal')
  const newDevice = simulateScenario(normal, 'new-device')
  assert.equal(getResourceDecision(normal, courses).decision, 'deny')
  assert.equal(getResourceDecision(verifyMfa(newDevice), admin).decision, 'deny')
  assert.equal(newDevice.sessions.find((session) => session.isCurrent)?.status, 'revoked')
  assert.equal(revokeSession(revoked, 'session-current'), revoked)
})

test('revoking a remote session preserves current access and survives scenario changes', () => {
  const revoked = revokeSession(createDemoState(), 'session-mobile')
  const changed = simulateScenario(revoked, 'new-device')
  assert.equal(getResourceDecision(revoked, courses).decision, 'allow')
  assert.equal(changed.sessions.find((session) => session.id === 'session-mobile')?.status, 'revoked')
})

test('resource requests create a decision record and append deterministic audit events', () => {
  const initial = createDemoState()
  const denied = requestResource(initial, 'admin-console')
  const allowed = requestResource(denied, 'course-materials')
  assert.equal(denied.resourceAccess?.decision, 'deny')
  assert.equal(allowed.resourceAccess?.decision, 'allow')
  assert.equal(allowed.auditLogs.length, initial.auditLogs.length + 2)
  assert.equal(allowed.auditLogs[0].decision, 'allow')
  assert.ok(allowed.auditLogs[0].timestamp > allowed.auditLogs[1].timestamp)
  assert.notEqual(allowed.auditLogs[0].id, allowed.auditLogs[1].id)
  assert.deepEqual(requestResource(initial, 'admin-console'), denied)
})

test('state transitions preserve their inputs and fresh demos have independent data', () => {
  const initial = createDemoState()
  const snapshot = structuredClone(initial)
  const changed = simulateScenario(initial, 'new-device')
  verifyMfa(changed)
  revokeSession(initial, 'session-mobile')
  requestResource(initial, 'course-materials')
  switchRole(initial, 'admin')
  assert.deepEqual(initial, snapshot)
  const fresh = createDemoState()
  fresh.sessions[0].status = 'revoked'
  fresh.riskFactors[0].score = 100
  fresh.auditLogs[0].action = 'Changed locally'
  assert.deepEqual(createDemoState(), snapshot)
})

test('unknown resources and sessions do not create misleading audit records', () => {
  const initial = createDemoState()
  assert.equal(requestResource(initial, 'missing'), initial)
  assert.equal(revokeSession(initial, 'missing'), initial)
})
