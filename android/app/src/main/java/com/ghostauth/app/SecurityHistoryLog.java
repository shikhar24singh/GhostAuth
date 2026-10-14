package com.ghostauth.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** History is evidence of an attempt, never an authentication or launch approval. */
final class SecurityHistoryLog {
    static final int LIMIT = 100;
    static final long MAX_ID = 9_007_199_254_740_991L;
    static final class Entry {
        final long id, occurredAt;
        final String packageName, label, method, outcome;
        Entry(long id, long occurredAt, String packageName, String label, String method, String outcome) {
            if (id < 1 || id > MAX_ID || occurredAt < 1 || occurredAt > 8_640_000_000_000_000L
                || packageName == null || packageName.length() > 255
                || !packageName.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
                || label == null || label.trim().isEmpty() || label.length() > 160
                || !("PIN".equals(method) || "fingerprint".equals(method))
                || !("verified".equals(outcome) || "failed".equals(outcome) || "canceled".equals(outcome)
                    || "locked-out".equals(outcome) || "unavailable".equals(outcome)))
                throw new IllegalArgumentException("Invalid history entry");
            this.id = id; this.occurredAt = occurredAt; this.packageName = packageName;
            this.label = label; this.method = method; this.outcome = outcome;
        }
    }
    final boolean configured, enabled;
    final long nextId;
    final List<Entry> entries;
    SecurityHistoryLog() { this(false, false, 1, Collections.emptyList()); }
    SecurityHistoryLog(boolean configured, boolean enabled, long nextId, List<Entry> entries) {
        if ((!configured && enabled) || nextId < 1 || nextId > MAX_ID || entries.size() > LIMIT)
            throw new IllegalArgumentException("Invalid history state");
        long previous = nextId;
        for (Entry entry : entries) {
            if (entry.id >= previous) throw new IllegalArgumentException("Invalid history order");
            previous = entry.id;
        }
        this.configured = configured; this.enabled = enabled; this.nextId = nextId;
        this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
    }
    SecurityHistoryLog configure(boolean enabled) { return new SecurityHistoryLog(true, enabled, nextId, entries); }
    SecurityHistoryLog clear() { return new SecurityHistoryLog(configured, enabled, nextId, Collections.emptyList()); }
    SecurityHistoryLog append(long occurredAt, String pkg, String label, String method, String outcome) {
        if (!configured || !enabled) return this;
        if (nextId == MAX_ID) throw new IllegalStateException("History identifier exhausted");
        List<Entry> next = new ArrayList<>();
        next.add(new Entry(nextId, occurredAt, pkg, label, method, outcome));
        next.addAll(entries.subList(0, Math.min(entries.size(), LIMIT - 1)));
        return new SecurityHistoryLog(true, true, nextId + 1, next);
    }
}
