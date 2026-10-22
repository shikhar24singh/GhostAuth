package com.ghostauth.app;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

final class ProtectionPolicy {
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
        if (approved != null) {
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
        if (selected.contains(pkg)) { approved = pkg; arrivingUntil = now + 5_000; arrived = false; }
        pending = null;
        return true;
    }
    synchronized String pending() { return pending; }
    synchronized long request() { return request; }
}
