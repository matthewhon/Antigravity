import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.barnabassoftware.pcmessaging',
  appName: 'Pastoral Care Messaging',
  webDir: 'dist',
  server: {
    // Use https:// scheme in the Android WebView so that Secure cookies and
    // SameSite restrictions behave correctly (avoids http://localhost pitfalls).
    androidScheme: 'https',
    hostname: 'pastoralcare.app',
  },
};

export default config;
