package com.ghostauth.app;

import io.flutter.plugin.common.BinaryMessenger;
import io.flutter.plugin.common.EventChannel;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class GhostChannels {
    private final MethodChannel methods;
    private final EventChannel events;
    private final ExecutorService catalogWorker = Executors.newSingleThreadExecutor();
    private final GhostAuthPlugin auth;
    private final GhostDevicePlugin device;
    private final GhostHistoryPlugin history;
    private final GhostAppearancePlugin appearance;
    private final GhostResearchPlugin research;
    private final LegacyPreferences preferences;
    private EventChannel.EventSink listener;

    GhostChannels(MainActivity activity, BinaryMessenger messenger) {
        auth = new GhostAuthPlugin(activity, this);
        device = new GhostDevicePlugin(activity, this);
        history = new GhostHistoryPlugin(activity, this);
        appearance = new GhostAppearancePlugin(activity, this);
        research = new GhostResearchPlugin(activity, this);
        preferences = new LegacyPreferences(activity);
        device.load();
        history.load();
        research.load();
        methods = new MethodChannel(messenger, "ghostauth/methods");
        methods.setMethodCallHandler(this::handle);
        events = new EventChannel(messenger, "ghostauth/events");
        events.setStreamHandler(new EventChannel.StreamHandler() {
            @Override public void onListen(Object arguments, EventChannel.EventSink sink) { listener = sink; }
            @Override public void onCancel(Object arguments) { listener = null; }
        });
    }

    private void handle(MethodCall method, MethodChannel.Result reply) {
        if (method.arguments != null && !(method.arguments instanceof Map)) {
            reply.error("INVALID_ARGUMENTS", "Expected named arguments.", null);
            return;
        }
        NativeCall call = new NativeCall(method, reply);
        switch (method.method) {
            case "auth.getStatus": auth.getStatus(call); break;
            case "auth.lock": auth.lock(call); break;
            case "auth.enrollPin": auth.enrollPin(call); break;
            case "auth.changePin": auth.changePin(call); break;
            case "auth.verifyPin": auth.verifyPin(call); break;
            case "auth.verifyBiometric": auth.verifyBiometric(call); break;
            case "auth.enableBiometric": auth.enableBiometric(call); break;
            case "auth.disableBiometric": auth.disableBiometric(call); break;
            case "auth.launchApp": auth.launchApp(call); break;
            case "device.getSnapshot": catalogWorker.execute(() -> device.getSnapshot(call)); break;
            case "device.configureProtection": catalogWorker.execute(() -> device.configureProtection(call)); break;
            case "device.openSettings": device.openSettings(call); break;
            case "device.cancelProtection": device.cancelProtection(call); break;
            case "history.getSnapshot": history.getSnapshot(call); break;
            case "history.configureRecording": history.configureRecording(call); break;
            case "history.clearHistory": history.clearHistory(call); break;
            case "research.getSnapshot": research.getSnapshot(call); break;
            case "research.configure": research.configure(call); break;
            case "research.clearData": research.clearData(call); break;
            case "research.openDiagnostic": research.openDiagnostic(call); break;
            case "research.closeDiagnostic": research.closeDiagnostic(call); break;
            case "research.getDiagnostic": research.getDiagnostic(call); break;
            case "research.startDiagnostic": research.startDiagnostic(call); break;
            case "research.stopDiagnostic": research.stopDiagnostic(call); break;
            case "research.clearDiagnostic": research.clearDiagnostic(call); break;
            case "research.copyDiagnostic": research.copyDiagnostic(call); break;
            case "appearance.getTheme": appearance.getTheme(call); break;
            case "appearance.setTheme": appearance.setTheme(call); break;
            case "preferences.get": preferences.read(call); break;
            case "preferences.setBehavior": preferences.setBehavior(call); break;
            default: reply.notImplemented();
        }
    }

    void emit(String name, NativePayload data) {
        NativeCall.onMain(() -> {
            if (listener != null) listener.success(NativeCall.encode(data.put("type", name)));
        });
    }

    void resume() { auth.handleOnResume(); }
    void stop() { auth.handleOnStop(); }

    void close() {
        methods.setMethodCallHandler(null);
        events.setStreamHandler(null);
        listener = null;
        auth.handleOnDestroy();
        device.handleOnDestroy();
        history.handleOnDestroy();
        research.handleOnDestroy();
        preferences.close();
        catalogWorker.shutdown();
    }
}
