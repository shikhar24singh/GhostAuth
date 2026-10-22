package com.ghostauth.app;

final class LaunchSession {
    private long grantedAt = -1;
    private String packageName;

    synchronized void grant(String target, long now) { packageName = target; grantedAt = now; }
    synchronized void clear() { packageName = null; grantedAt = -1; }
    synchronized long remaining(long now) {
        return PinSecurity.sessionValid(grantedAt, now) ? PinSecurity.SESSION_MILLIS - (now - grantedAt) : 0;
    }
    synchronized boolean consume(String target, long now) {
        boolean allowed = target != null && target.equals(packageName) && remaining(now) > 0;
        clear();
        return allowed;
    }
}
