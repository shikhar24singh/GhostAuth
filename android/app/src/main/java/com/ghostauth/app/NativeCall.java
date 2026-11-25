package com.ghostauth.app;

import android.os.Handler;
import android.os.Looper;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeCall {
    private static final AtomicLong NEXT_ID = new AtomicLong();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private final String id = Long.toString(NEXT_ID.incrementAndGet());
    private final AtomicBoolean finished = new AtomicBoolean();
    private final MethodCall call;
    private final MethodChannel.Result result;

    NativeCall(MethodCall call, MethodChannel.Result result) {
        this.call = call;
        this.result = result;
    }

    String getCallbackId() { return id; }
    String getString(String key) { return getString(key, null); }
    String getString(String key, String fallback) {
        Object value = call.argument(key);
        return value instanceof String ? (String) value : fallback;
    }

    Boolean getBoolean(String key) {
        Object value = call.argument(key);
        return value instanceof Boolean ? (Boolean) value : null;
    }

    Long getLong(String key) {
        Object value = call.argument(key);
        return value instanceof Long || value instanceof Integer ? ((Number) value).longValue() : null;
    }

    JSONArray getArray(String key) {
        Object value = call.argument(key);
        return value instanceof List<?> ? new JSONArray((List<?>) value) : null;
    }

    void resolve() { resolve(null); }
    void resolve(NativePayload payload) { finish(() -> result.success(encode(payload))); }
    void reject(String message, String code) { finish(() -> result.error(code, message, null)); }

    private void finish(Runnable callback) {
        if (finished.compareAndSet(false, true)) onMain(callback);
    }

    static void onMain(Runnable work) {
        if (Looper.myLooper() == Looper.getMainLooper()) work.run(); else MAIN.post(work);
    }

    static Object encode(Object value) {
        if (value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) {
            JSONObject json = (JSONObject) value;
            Map<String, Object> map = new LinkedHashMap<>();
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                map.put(key, encode(json.opt(key)));
            }
            return map;
        }
        if (value instanceof JSONArray) {
            JSONArray json = (JSONArray) value;
            List<Object> array = new ArrayList<>(json.length());
            for (int i = 0; i < json.length(); i++) array.add(encode(json.opt(i)));
            return array;
        }
        return value;
    }
}
