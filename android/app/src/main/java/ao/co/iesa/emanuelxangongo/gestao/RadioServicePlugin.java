package ao.co.iesa.emanuelxangongo.gestao;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

/**
 * v1.20.0 — ponte JS ↔ {@link RadioPlaybackService}.
 *
 * Métodos: play({url,title}), stop(), setVolume({value}), getState().
 * Eventos: «radioState» {playing,loading} e «radioError» {message}.
 */
@CapacitorPlugin(name = "RadioService")
public class RadioServicePlugin extends Plugin {

    private static WeakReference<RadioServicePlugin> ref;

    @Override
    public void load() {
        ref = new WeakReference<>(this);
    }

    static void emitState(boolean playing, boolean loading) {
        RadioServicePlugin p = ref == null ? null : ref.get();
        if (p == null) return;
        JSObject e = new JSObject();
        e.put("playing", playing);
        e.put("loading", loading);
        p.notifyListeners("radioState", e);
    }

    static void emitError(String message) {
        RadioServicePlugin p = ref == null ? null : ref.get();
        if (p == null) return;
        JSObject e = new JSObject();
        e.put("message", message);
        p.notifyListeners("radioError", e);
    }

    private void send(Intent i) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(i);
        } else {
            getContext().startService(i);
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url é obrigatório");
            return;
        }
        Intent i = new Intent(getContext(), RadioPlaybackService.class);
        i.setAction(RadioPlaybackService.ACTION_PLAY);
        i.putExtra(RadioPlaybackService.EXTRA_URL, url);
        i.putExtra(RadioPlaybackService.EXTRA_TITLE, call.getString("title", "Rádio"));
        send(i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent i = new Intent(getContext(), RadioPlaybackService.class);
        i.setAction(RadioPlaybackService.ACTION_STOP);
        send(i);
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Float v = call.getFloat("value");
        RadioPlaybackService.setPlayerVolume(v == null ? 1f : v);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject r = new JSObject();
        r.put("playing", RadioPlaybackService.isPlaying());
        call.resolve(r);
    }
}
