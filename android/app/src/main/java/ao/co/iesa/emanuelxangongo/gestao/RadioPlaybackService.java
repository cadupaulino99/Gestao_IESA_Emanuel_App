package ao.co.iesa.emanuelxangongo.gestao;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;

/**
 * v1.21 — Rádio em SEGUNDO PLANO com baixa latência.
 *
 * ExoPlayer (media3) com buffer curto em vez de MediaPlayer:
 *  - MediaPlayer em streams Icecast/AAC acumulava 15–30s de atraso;
 *  - aqui o buffer alvo fica entre ~1,5s e ~4s e cada play usa URL
 *    com cache-bust para ligar à borda «ao vivo» do mount.
 */
public class RadioPlaybackService extends Service {

    public static final String ACTION_PLAY = "ao.co.iesa.emanuelxangongo.gestao.radio.PLAY";
    public static final String ACTION_STOP = "ao.co.iesa.emanuelxangongo.gestao.radio.STOP";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";

    private static final int NOTIFICATION_ID = 9119;
    private static final String CHANNEL_ID = "radio_segundo_plano";

    /* Buffer curto: prioriza «ao vivo» sobre resiliência em redes muito fracas. */
    private static final int MIN_BUFFER_MS = 1500;
    private static final int MAX_BUFFER_MS = 4000;
    private static final int PLAYBACK_BUFFER_MS = 750;
    private static final int REBUFFER_MS = 1200;

    private static boolean playing;
    private static ExoPlayer player;
    private static float volume = 0.9f;

    private WifiManager.WifiLock wifiLock;
    private String title = "Rádio";
    private final Handler main = new Handler(Looper.getMainLooper());

    public static boolean isPlaying() {
        return playing;
    }

    public static void setPlayerVolume(float v) {
        volume = v;
        if (player != null) {
            player.setVolume(v);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Rádio em segundo plano",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Mantém a emissão a tocar com o ecrã apagado.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopEverything();
            stopSelf();
            return START_NOT_STICKY;
        }
        String url = intent == null ? null : intent.getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String t = intent.getStringExtra(EXTRA_TITLE);
        title = (t == null || t.isEmpty()) ? "Rádio" : t;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification("A ligar…", false),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification("A ligar…", false));
        }
        startPlayer(url);
        return START_NOT_STICKY;
    }

    private void startPlayer(final String baseUrl) {
        releasePlayer();
        playing = false;
        RadioServicePlugin.emitState(false, true);
        acquireWifiLock();

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        MIN_BUFFER_MS,
                        MAX_BUFFER_MS,
                        PLAYBACK_BUFFER_MS,
                        REBUFFER_MS)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();

        ExoPlayer mp = new ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setUsage(C.USAGE_MEDIA)
                                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                                .build(),
                        /* handleAudioFocus= */ true)
                .setHandleAudioBecomingNoisy(true)
                .build();
        player = mp;
        mp.setVolume(volume);

        mp.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY && mp.getPlayWhenReady()) {
                    playing = true;
                    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.notify(NOTIFICATION_ID, buildNotification("No ar", true));
                    }
                    RadioServicePlugin.emitState(true, false);
                } else if (state == Player.STATE_BUFFERING) {
                    RadioServicePlugin.emitState(playing, true);
                } else if (state == Player.STATE_ENDED) {
                    playing = false;
                    RadioServicePlugin.emitState(false, false);
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                playing = false;
                RadioServicePlugin.emitState(false, false);
                RadioServicePlugin.emitError("A emissão caiu. Abra a app e toque novamente.");
                stopEverything();
                stopSelf();
            }
        });

        /* Cache-bust: força ligação fresca à borda ao vivo (evita proxies/CDN
           a servirem um segmento já atrasado). */
        String liveUrl = baseUrl;
        String sep = baseUrl.contains("?") ? "&" : "?";
        liveUrl = baseUrl + sep + "_t=" + System.currentTimeMillis();

        mp.setMediaItem(MediaItem.fromUri(Uri.parse(liveUrl)));
        mp.prepare();
        mp.play();
    }

    private void acquireWifiLock() {
        if (wifiLock != null && wifiLock.isHeld()) return;
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "iesa-radio");
            wifiLock.setReferenceCounted(false);
            wifiLock.acquire();
        }
    }

    private void releaseWifiLock() {
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
        wifiLock = null;
    }

    private void releasePlayer() {
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {
                /* já estava libertado */
            }
            player = null;
        }
    }

    private Notification buildNotification(String text, boolean isPlaying) {
        Intent stopIntent = new Intent(this, RadioPlaybackService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 0, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 1, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }
        b.setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(openPi)
                .setOngoing(isPlaying)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(getApplicationContext(), android.R.drawable.ic_media_pause),
                        "Parar",
                        stopPi).build());
        return b.build();
    }

    private void stopEverything() {
        playing = false;
        releasePlayer();
        releaseWifiLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        stopEverything();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
