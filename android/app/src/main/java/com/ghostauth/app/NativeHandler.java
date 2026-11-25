package com.ghostauth.app;

import android.content.Context;

abstract class NativeHandler {
    private final MainActivity activity;
    private final GhostChannels channels;

    NativeHandler(MainActivity activity, GhostChannels channels) {
        this.activity = activity;
        this.channels = channels;
    }

    final MainActivity getActivity() { return activity; }
    final Context getContext() { return activity; }
    final void notifyListeners(String name, NativePayload data) { channels.emit(name, data); }

    void load() {}
    protected void handleOnResume() {}
    protected void handleOnStop() {}
    protected void handleOnDestroy() {}
}
