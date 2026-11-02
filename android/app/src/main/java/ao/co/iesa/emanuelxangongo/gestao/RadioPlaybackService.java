package ao.co.iesa.emanuelxangongo.gestao;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * v1.20.0 — Rádio em SEGUNDO PLANO.
 *
 * Serviço foreground (tipo mediaPlayback) com MediaPlayer + MediaSession:
 *  - a emissão continua a tocar com o ecrã apagado / app em segundo plano;
 *  - a notificação de media e o ecrã de bloqueio ganham controlo «Parar»;
 *  - WakeLock (CPU) via MediaPlayer.setWakeMode + WifiLock para o stream não
 *    morrer com o ecrã off.
 *
 * Só usa classes do framework (android.media / android.app) — zero dependências
 * novas no gradle. minSdk 24.
 */
public class RadioPlaybackService extends Service {

    public static final String ACTION_PLAY = "ao.co.iesa.emanuelxangongo.gestao.radio.PLAY";
    public static final String ACTION_STOP = "ao.co.iesa.emanuelxangongo.gestao.radio.STOP";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";

    private static final int NOTIFICATION_ID = 9119;
    private static final String CHANNEL_ID = "radio_segundo_plano";

    private static boolean playing;
    private static MediaPlayer player;
    private static float volume = 0.9f;

    private MediaSession session;
    private WifiManager.WifiLock wifiLock;
    private String title = "Rádio";

    public static boolean isPlaying() {
        return playing;
    }

    /** Chamado pelo plugin (setVolume) mesmo antes de o serviço existir. */
    public static void setPlayerVolume(float v) {
        volume = v;
        if (player != null) {
            player.setVolume(v, v);
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
        session = new MediaSession(this, "iesa-radio");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPause() {
                stopEverything();
                stopSelf();
            }

            @Override
            public void onStop() {
                stopEverything();
                stopSelf();
            }

            @Override
            public void onPlay() {
                /* emissão ao vivo: retomar = novo play() pelo plugin */
            }
        });
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
        // startForeground IMEDIATO (regra do Android para startForegroundService)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification("A ligar…", false),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification("A ligar…", false));
        }
        startPlayer(url);
        return START_NOT_STICKY;
    }

    private void startPlayer(final String url) {
        releasePlayer();
        playing = false;
        RadioServicePlugin.emitState(false, true);
        final MediaPlayer mp = new MediaPlayer();
        player = mp;
        mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
        // setWakeMode exige (Context, int) — a sobrecarga de 1 argumento não existe
        mp.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
        mp.setVolume(volume, volume);
        mp.setOnPreparedListener(m -> {
            m.start();
            playing = true;
            if (session != null) {
                session.setActive(true);
                session.setMetadata(new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                        .build());
                updatePlaybackState(true);
            }
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification("No ar", true));
            }
            RadioServicePlugin.emitState(true, false);
        });
        mp.setOnErrorListener((m, what, extra) -> {
            playing = false;
            RadioServicePlugin.emitState(false, false);
            RadioServicePlugin.emitError("A emissão caiu. Abra a app e toque novamente.");
            stopEverything();
            stopSelf();
            return true;
        });
        acquireWifiLock();
        try {
            mp.setDataSource(url);
            mp.prepareAsync();
        } catch (Exception e) {
            playing = false;
            RadioServicePlugin.emitState(false, false);
            RadioServicePlugin.emitError("Não foi possível ligar à emissão.");
            stopEverything();
            stopSelf();
        }
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
                player.reset();
                player.release();
            } catch (Exception ignored) {
                /* já estava libertado */
            }
            player = null;
        }
    }

    private void updatePlaybackState(boolean isPlaying) {
        if (session == null) return;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_STOP)
                .setState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_STOPPED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
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
        b.setStyle(new Notification.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0));
        return b.build();
    }

    private void stopEverything() {
        playing = false;
        releasePlayer();
        releaseWifiLock();
        if (session != null) {
            updatePlaybackState(false);
            session.setActive(false);
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        stopEverything();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
