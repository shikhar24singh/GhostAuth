package com.ghostauth.app;

final class LaunchSession {
    private long grantedAt = -1;
    private String packageName;
    private boolean externalOpening;

    synchronized void grant(String target, long now) { grant(target, now, false); }
    synchronized void grant(String target, long now, boolean external) { packageName = target; grantedAt = now; externalOpening = external; }
    synchronized void clear() { packageName = null; grantedAt = -1; externalOpening = false; }
    synchronized boolean returnsToProtectedApp(String target, long now) {
        return externalOpening && target != null && target.equals(packageName) && remaining(now) > 0;
    }
    synchronized long remaining(long now) {
        return PinSecurity.sessionValid(grantedAt, now) ? PinSecurity.SESSION_MILLIS - (now - grantedAt) : 0;
    }
    synchronized boolean consume(String target, long now) {
        boolean allowed = target != null && target.equals(packageName) && remaining(now) > 0;
        clear();
        return allowed;
    }
}
