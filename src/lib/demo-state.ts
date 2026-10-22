import { INITIAL_AUDIT_LOGS, INITIAL_SESSIONS, RESOURCES, RISK_FACTORS, SCENARIOS, USERS } from './demo-data.ts'
import type { AuditEntry, Decision, DemoState, ProtectedResource, ResourceAccess, Role, Scenario } from './types.ts'

const DEMO_CLOCK_START = Date.parse('2026-10-08T09:43:00.000Z')

function recordEvent(state: DemoState, event: Omit<AuditEntry, 'id' | 'timestamp'>, message: string): DemoState {
  const sequence = state.sequence + 1
  return {
    ...state,
    sequence,
    lastEvent: message,
    auditLogs: [
      { ...event, id: `event-${sequence}`, timestamp: new Date(DEMO_CLOCK_START + sequence * 60_000).toISOString() },
      ...state.auditLogs,
    ].slice(0, 100),
  }
}

export function createDemoState(role: Role = 'student'): DemoState {
  return {
    role,
    scenario: 'normal',
    riskScore: SCENARIOS.normal.riskScore,
    decision: 'allow',
    mfaVerified: false,
    riskFactors: RISK_FACTORS.normal.map((factor) => ({ ...factor })),
    sessions: INITIAL_SESSIONS.map((session) => ({ ...session })),
    auditLogs: INITIAL_AUDIT_LOGS.map((event) => ({
      ...event,
      actor: event.actor === 'Alex Morgan' ? USERS[role].name : event.actor,
      detail: event.id === 'event-initial-1' ? `${USERS[role].title} identity selected. No real authentication was performed.` : event.detail,
    })),
    resourceAccess: null,
    lastEvent: 'Demo workspace ready.',
    sequence: 0,
  }
}

export function simulateScenario(state: DemoState, scenario: Scenario): DemoState {
  const riskScore = SCENARIOS[scenario].riskScore
  const currentRevoked = state.sessions.some((session) => session.isCurrent && session.status === 'revoked')
  const decision: Decision = currentRevoked || scenario === 'suspicious' ? 'deny' : scenario === 'new-device' ? 'challenge' : 'allow'
  const next: DemoState = {
    ...state,
    scenario,
    riskScore,
    decision,
    mfaVerified: false,
    riskFactors: RISK_FACTORS[scenario].map((factor) => ({ ...factor })),
    resourceAccess: null,
    sessions: state.sessions.map((session) => session.isCurrent ? {
      ...session,
      riskScore,
      status: session.status === 'revoked' ? 'revoked' : decision === 'allow' ? 'active' : decision === 'challenge' ? 'challenged' : 'blocked',
      lastActive: 'Active now',
    } : session),
  }
  const message = currentRevoked
    ? `${SCENARIOS[scenario].label} simulated. The current session remains revoked; reset the demo to start again.`
    : scenario === 'normal'
      ? 'Normal activity simulated. Access is allowed for your role.'
      : scenario === 'new-device'
        ? 'New device simulated. Complete demo verification to continue.'
        : 'Suspicious activity simulated. Protected access is blocked.'
  return recordEvent(next, {
    action: scenario === 'normal' ? 'Low-risk activity detected' : scenario === 'new-device' ? 'Step-up verification required' : 'High-risk activity blocked',
    detail: `${SCENARIOS[scenario].description}${currentRevoked ? ' Current session remains revoked.' : ''}`,
    actor: 'Policy engine',
    category: 'policy',
    severity: decision === 'allow' ? 'info' : decision === 'challenge' ? 'warning' : 'critical',
    decision,
  }, message)
}

export function verifyMfa(state: DemoState): DemoState {
  if (state.decision !== 'challenge' || state.sessions.some((session) => session.isCurrent && session.status === 'revoked')) return state
  const next: DemoState = {
    ...state,
    decision: 'allow',
    mfaVerified: true,
    riskScore: 24,
    resourceAccess: null,
    riskFactors: state.riskFactors.map((factor) => factor.id === 'device' || factor.id === 'session'
      ? { ...factor, value: factor.id === 'device' ? 'Verified for demo' : 'Step-up complete', detail: 'The simulated verification step has been completed.', level: 'low', score: 24 }
      : { ...factor }),
    sessions: state.sessions.map((session) => session.isCurrent ? { ...session, status: 'active', riskScore: 24 } : session),
  }
  return recordEvent(next, {
    action: 'Demo verification completed',
    detail: 'The simulated step-up challenge passed. Role restrictions still apply.',
    actor: USERS[state.role].name,
    category: 'identity',
    severity: 'info',
    decision: 'allow',
  }, 'Demo verification complete. Access restored for your role.')
}

export function revokeSession(state: DemoState, sessionId: string): DemoState {
  const target = state.sessions.find((session) => session.id === sessionId)
  if (!target || target.status === 'revoked') return state
  const next: DemoState = {
    ...state,
    decision: target.isCurrent ? 'deny' : state.decision,
    mfaVerified: target.isCurrent ? false : state.mfaVerified,
    resourceAccess: null,
    sessions: state.sessions.map((session) => session.id === sessionId ? { ...session, status: 'revoked', lastActive: 'Revoked just now' } : session),
  }
  return recordEvent(next, {
    action: 'Session revoked',
    detail: `${target.device} demo session was revoked.${target.isCurrent ? ' Protected access is now blocked.' : ''}`,
    actor: USERS[state.role].name,
    category: 'session',
    severity: 'warning',
    decision: 'deny',
  }, `${target.device} session revoked.${target.isCurrent ? ' Reset the demo to start a new session.' : ''}`)
}

export function switchRole(state: DemoState, role: Role): DemoState {
  if (state.role === role) return state
  return recordEvent({ ...state, role, resourceAccess: null }, {
    action: 'Demo role changed',
    detail: `${USERS[role].title} preview selected. Existing risk signals and session restrictions are retained.`,
    actor: USERS[role].name,
    category: 'identity',
    severity: 'info',
    decision: state.decision,
  }, `Previewing the ${USERS[role].title.toLowerCase()} workspace.`)
}

export function getResourceDecision(state: DemoState, resource: ProtectedResource): ResourceAccess {
  if (!resource.allowedRoles.includes(state.role)) return {
    resourceId: resource.id,
    decision: 'deny',
    reason: `${resource.name} is available to ${resource.accessLabel.toLowerCase()}.`,
  }
  if (state.sessions.some((session) => session.isCurrent && session.status === 'revoked')) return {
    resourceId: resource.id,
    decision: 'deny',
    reason: 'Your demo session has been revoked. Reset the demo to start a new session.',
  }
  if (state.decision === 'deny') return {
    resourceId: resource.id,
    decision: 'deny',
    reason: 'High-risk activity was detected. The demo policy is blocking protected resources.',
  }
  if (state.decision === 'challenge') return {
    resourceId: resource.id,
    decision: 'challenge',
    reason: 'Complete the demo verification challenge before opening this resource.',
  }
  return {
    resourceId: resource.id,
    decision: 'allow',
    reason: 'Your demo role and current risk signals satisfy this resource policy.',
  }
}

export function requestResource(state: DemoState, resourceId: string): DemoState {
  const resource = RESOURCES.find((item) => item.id === resourceId)
  if (!resource) return state
  const access = getResourceDecision(state, resource)
  return recordEvent({ ...state, resourceAccess: access }, {
    action: access.decision === 'allow' ? 'Resource access granted' : access.decision === 'challenge' ? 'Resource verification required' : 'Resource access denied',
    detail: `${resource.name}: ${access.reason}`,
    actor: USERS[state.role].name,
    category: 'resource',
    severity: access.decision === 'allow' ? 'info' : 'warning',
    decision: access.decision,
  }, access.decision === 'allow' ? `${resource.name} demo opened.` : access.reason)
}
