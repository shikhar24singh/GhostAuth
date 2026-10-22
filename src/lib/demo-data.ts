import type { AuditEntry, DemoSession, DemoUser, ProtectedResource, RiskFactor, Role, Scenario } from './types.ts'

export const USERS: Record<Role, DemoUser> = {
  student: {
    id: 'demo-student',
    name: 'Alex Morgan',
    initials: 'AM',
    email: 'alex.morgan@ghostauth.example',
    role: 'student',
    title: 'Student',
    department: 'Computer Science · Final year',
  },
  faculty: {
    id: 'demo-faculty',
    name: 'Dr. Maya Chen',
    initials: 'MC',
    email: 'maya.chen@ghostauth.example',
    role: 'faculty',
    title: 'Faculty',
    department: 'Computer Science · Research faculty',
  },
  admin: {
    id: 'demo-admin',
    name: 'Jordan Lee',
    initials: 'JL',
    email: 'jordan.lee@ghostauth.example',
    role: 'admin',
    title: 'Administrator',
    department: 'Campus IT · Security operations',
  },
}

export const RESOURCES: ProtectedResource[] = [
  {
    id: 'course-materials',
    name: 'Course materials',
    description: 'Your lectures, assignments, and learning resources.',
    category: 'LEARNING',
    icon: 'book',
    allowedRoles: ['student', 'faculty', 'admin'],
    accessLabel: 'All campus roles',
    updated: 'Updated 12 min ago',
  },
  {
    id: 'academic-records',
    name: 'Academic records',
    description: 'Review grades, attendance, and academic progress.',
    category: 'ACADEMICS',
    icon: 'chart',
    allowedRoles: ['student', 'faculty', 'admin'],
    accessLabel: 'All campus roles',
    updated: 'Updated 1 hour ago',
  },
  {
    id: 'research-cloud',
    name: 'Research cloud',
    description: 'Shared datasets and a secure research workspace.',
    category: 'RESEARCH',
    icon: 'cloud',
    allowedRoles: ['faculty', 'admin'],
    accessLabel: 'Faculty & administrators',
    updated: 'Updated 32 min ago',
  },
  {
    id: 'admin-console',
    name: 'Admin console',
    description: 'Manage campus access policies and security controls.',
    category: 'ADMINISTRATION',
    icon: 'shield',
    allowedRoles: ['admin'],
    accessLabel: 'Administrators only',
    updated: 'Updated 5 min ago',
  },
]

export const SCENARIOS: Record<Scenario, { label: string; description: string; riskScore: number }> = {
  normal: {
    label: 'Normal activity',
    description: 'A recognized device and familiar activity keep this demo session at low risk.',
    riskScore: 12,
  },
  'new-device': {
    label: 'New device',
    description: 'An unfamiliar device triggers an extra verification step before access resumes.',
    riskScore: 48,
  },
  suspicious: {
    label: 'Suspicious activity',
    description: 'Unusual behavior and location signals cause access to be denied.',
    riskScore: 86,
  },
}

export const RISK_FACTORS: Record<Scenario, RiskFactor[]> = {
  normal: [
    { id: 'behavior', label: 'Behavioral pattern', value: 'Consistent', detail: 'Interaction rhythm matches the synthetic baseline.', level: 'low', score: 9 },
    { id: 'device', label: 'Device trust', value: 'Recognized', detail: 'This device is present in the demo trusted-device list.', level: 'low', score: 8 },
    { id: 'location', label: 'Location context', value: 'Expected', detail: 'Campus network and a familiar sign-in location.', level: 'low', score: 14 },
    { id: 'session', label: 'Session activity', value: 'Normal', detail: 'Request frequency is within the demo baseline.', level: 'low', score: 17 },
  ],
  'new-device': [
    { id: 'behavior', label: 'Behavioral pattern', value: 'Consistent', detail: 'Interaction rhythm still matches the synthetic baseline.', level: 'low', score: 18 },
    { id: 'device', label: 'Device trust', value: 'Unrecognized', detail: 'A simulated device fingerprint has not been seen before.', level: 'high', score: 78 },
    { id: 'location', label: 'Location context', value: 'Expected', detail: 'The new device is using the familiar campus network.', level: 'low', score: 16 },
    { id: 'session', label: 'Session activity', value: 'Verification needed', detail: 'Additional verification is required for the new device.', level: 'medium', score: 64 },
  ],
  suspicious: [
    { id: 'behavior', label: 'Behavioral pattern', value: 'Anomalous', detail: 'Synthetic interaction signals differ from the baseline.', level: 'high', score: 91 },
    { id: 'device', label: 'Device trust', value: 'Unrecognized', detail: 'The simulated device fingerprint changed during the session.', level: 'high', score: 82 },
    { id: 'location', label: 'Location context', value: 'Unusual', detail: 'A simulated distant location conflicts with recent activity.', level: 'high', score: 89 },
    { id: 'session', label: 'Session activity', value: 'Elevated', detail: 'A synthetic burst of protected-resource requests was detected.', level: 'high', score: 81 },
  ],
}

export const INITIAL_SESSIONS: DemoSession[] = [
  { id: 'session-current', device: 'MacBook Pro', browser: 'Chrome 129', platform: 'macOS', location: 'Campus network', ipAddress: '192.0.2.24', lastActive: 'Active now', status: 'active', riskScore: 12, isCurrent: true },
  { id: 'session-mobile', device: 'iPhone 15', browser: 'Safari', platform: 'iOS', location: 'Campus network', ipAddress: '192.0.2.41', lastActive: '18 min ago', status: 'active', riskScore: 8, isCurrent: false },
  { id: 'session-lab', device: 'Lab workstation', browser: 'Firefox', platform: 'Windows', location: 'Computer science lab', ipAddress: '198.51.100.12', lastActive: '2 hours ago', status: 'revoked', riskScore: 23, isCurrent: false },
]

export const INITIAL_AUDIT_LOGS: AuditEntry[] = [
  { id: 'event-initial-3', timestamp: '2026-10-08T09:42:00.000Z', action: 'Resource access granted', detail: 'Course materials opened from a recognized device.', actor: 'Alex Morgan', category: 'resource', severity: 'info', decision: 'allow' },
  { id: 'event-initial-2', timestamp: '2026-10-08T09:41:00.000Z', action: 'Policy evaluation passed', detail: 'Synthetic device, location, and behavior signals indicate low risk.', actor: 'Policy engine', category: 'policy', severity: 'info', decision: 'allow' },
  { id: 'event-initial-1', timestamp: '2026-10-08T09:40:00.000Z', action: 'Demo session started', detail: 'Student identity selected. No real authentication was performed.', actor: 'Alex Morgan', category: 'identity', severity: 'info', decision: 'allow' },
]
