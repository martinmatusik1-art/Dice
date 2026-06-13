import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.antigravity.dicepwa',
  appName: '3D Dice Simulator',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
