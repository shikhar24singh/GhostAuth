package com.ghostauth.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

final class ProtectionPreferences {
    static SharedPreferences store(Context context) { return context.getSharedPreferences("ghostauth_protection", Context.MODE_PRIVATE); }
    static boolean enabled(Context context) { return store(context).getBoolean("consent", false); }
    static Set<String> packages(Context context) { return new HashSet<>(store(context).getStringSet("packages", new HashSet<>())); }
}
