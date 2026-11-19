package com.ghostauth.app;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

final class ProtectionPolicy {
    static final long ARRIVAL_MILLIS = 5_000;
    private final String ownPackage;
    private Set<String> selected = new HashSet<>();
    private String approved;
    private long arrivingUntil;
    private boolean arrived;
    private String pending;
    private long request;

    ProtectionPolicy(String ownPackage) { this.ownPackage = ownPackage; }
    synchronized void select(Collection<String> packages) { selected = new HashSet<>(packages); clear(); }
    synchronized void clear() { approved = null; pending = null; arrivingUntil = 0; arrived = false; }
    synchronized boolean observe(String pkg, long now) {
        return observe(pkg, now, false);
    }
    synchronized boolean observe(String pkg, long now, boolean systemWindow) {
        if (approved != null) {
            if (systemWindow && now < arrivingUntil) return false;
            if (approved.equals(pkg) && (arrived || now < arrivingUntil)) { arrived = true; return false; }
            if (!arrived && ownPackage.equals(pkg) && now < arrivingUntil) return false;
            approved = null; arrived = false;
        }
        if (ownPackage.equals(pkg)) return false;
        if (!selected.contains(pkg)) { pending = null; return false; }
        if (!pkg.equals(pending)) { pending = pkg; request++; }
        return true;
    }
    synchronized boolean approveLaunch(String pkg, long now) {
        if (pending != null && !pending.equals(pkg)) return false;
        if (selected.contains(pkg)) { approved = pkg; arrivingUntil = now + ARRIVAL_MILLIS; arrived = false; }
        pending = null;
        return true;
    }
    synchronized String pending() { return pending; }
    synchronized long request() { return request; }
    synchronized boolean arriving(String pkg, long now) { return pkg != null && pkg.equals(approved) && !arrived && now < arrivingUntil; }
    synchronized boolean confirmed(String pkg) { return pkg != null && pkg.equals(approved) && arrived; }
    synchronized void revokeArrival(String pkg) {
        if (pkg != null && pkg.equals(approved) && !arrived) { approved = null; arrivingUntil = 0; }
    }
}
