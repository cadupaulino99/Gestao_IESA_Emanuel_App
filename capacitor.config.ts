import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ao.co.iesa.emanuelxangongo.gestao',
  appName: 'Gestão IESA Emanuel',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#F8FAFC',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#0F172A',
    },
    // Descomenta e preenche com o "Web client ID" do teu projeto Firebase
    // (necessário apenas para Google Sign-In na web; no Android o plugin usa
    //  o google-services.json). Ver docs/GUIA-FIREBASE.md, passo 6.
    // FirebaseAuth: {
    //   google: { webClientId: 'XXXX.apps.googleusercontent.com' },
    // },
  },
};

export default config;
