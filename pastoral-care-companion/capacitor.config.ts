import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pastoralcarecompanion',
  appName: 'Pastoral Care Companion',
  webDir: 'dist',
  server: {
    // Use https:// scheme in Android WebView for security policies and SameSite cookies
    androidScheme: 'https',
    hostname: 'pastoralcarecompanion.app',
  },
};

export default config;
