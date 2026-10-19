package com.ghostauth.app;

final class ResearchRetention {
    static final int LIMIT = 500, MAX_BYTES = 10 * 1024 * 1024;
    static final long MAX_AGE_MILLIS = 7L * 24 * 60 * 60 * 1000;
    static int firstRetainedIndex(int count) { return Math.max(0, count - LIMIT); }
    static boolean retain(long occurredAt, long now) {
        return occurredAt > 0 && occurredAt <= now && now - occurredAt < MAX_AGE_MILLIS;
    }
}
