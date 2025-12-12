import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.c36grid.app',
  appName: 'C-36 Grid',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;