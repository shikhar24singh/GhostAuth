package com.ghostauth.app;

import org.json.JSONException;
import org.json.JSONObject;

final class NativePayload extends JSONObject {
    @Override public NativePayload put(String key, Object value) {
        try { super.put(key, value); }
        catch (JSONException exception) { throw new IllegalArgumentException(key, exception); }
        return this;
    }

    @Override public NativePayload put(String key, boolean value) { return put(key, Boolean.valueOf(value)); }
    @Override public NativePayload put(String key, int value) { return put(key, Integer.valueOf(value)); }
    @Override public NativePayload put(String key, long value) { return put(key, Long.valueOf(value)); }
    @Override public NativePayload put(String key, double value) { return put(key, Double.valueOf(value)); }

    boolean getBoolean(String key, boolean fallback) { return optBoolean(key, fallback); }
    String getString(String key, String fallback) { return optString(key, fallback); }
}
