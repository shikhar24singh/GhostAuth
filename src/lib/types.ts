export type Role = 'student' | 'faculty' | 'admin'
export type Scenario = 'normal' | 'new-device' | 'suspicious'
export type Decision = 'allow' | 'challenge' | 'deny'
export type RiskLevel = 'low' | 'medium' | 'high'
export type SessionStatus = 'active' | 'challenged' | 'blocked' | 'revoked'

export interface DemoUser {
  id: string
  name: string
  initials: string
  email: string
  role: Role
  title: string
  department: string
}

export interface ProtectedResource {
  id: string
  name: string
  description: string
  category: string
  icon: 'book' | 'chart' | 'cloud' | 'shield'
  allowedRoles: Role[]
  accessLabel: string
  updated: string
}

export interface RiskFactor {
  id: string
  label: string
  value: string
  detail: string
  level: RiskLevel
  score: number
}

export interface DemoSession {
  id: string
  device: string
  browser: string
  platform: string
  location: string
  ipAddress: string
  lastActive: string
  status: SessionStatus
  riskScore: number
  isCurrent: boolean
}

export interface AuditEntry {
  id: string
  timestamp: string
  action: string
  detail: string
  actor: string
  category: 'identity' | 'policy' | 'session' | 'resource'
  severity: 'info' | 'warning' | 'critical'
  decision: Decision
}

export interface ResourceAccess {
  resourceId: string
  decision: Decision
  reason: string
}

export interface DemoState {
  role: Role
  scenario: Scenario
  riskScore: number
  decision: Decision
  mfaVerified: boolean
  riskFactors: RiskFactor[]
  sessions: DemoSession[]
  auditLogs: AuditEntry[]
  resourceAccess: ResourceAccess | null
  lastEvent: string
  sequence: number
}
