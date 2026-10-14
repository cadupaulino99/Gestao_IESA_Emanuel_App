import { useState, useEffect } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  browser: string;
  os: string;
  isPortrait: boolean;
}

export function useDevice(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    browser: 'unknown',
    os: 'unknown',
    isPortrait: true,
  });

  useEffect(() => {
    function handleResize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      const isMobile = width < 768;
      const isTablet = width >= 768 && width < 1024;
      const isDesktop = width >= 1024;
      const isPortrait = height > width;

      const ua = navigator.userAgent;
      let browser = 'unknown';
      if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
      else if (ua.indexOf('SamsungBrowser') > -1) browser = 'Samsung Internet';
      else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
      else if (ua.indexOf('Trident') > -1) browser = 'Internet Explorer';
      else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg') > -1) browser = 'Edge';
      else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
      else if (ua.indexOf('Safari') > -1) browser = 'Safari';

      let os = 'unknown';
      if (ua.indexOf('Win') > -1) os = 'Windows';
      else if (ua.indexOf('Mac') > -1) os = 'MacOS';
      else if (ua.indexOf('X11') > -1) os = 'UNIX';
      else if (ua.indexOf('Linux') > -1) os = 'Linux';
      if (ua.indexOf('Android') > -1) os = 'Android';
      if (ua.indexOf('like Mac') > -1) os = 'iOS';

      setDeviceInfo({
        isMobile,
        isTablet,
        isDesktop,
        browser,
        os,
        isPortrait
      });
    }

    handleResize(); // Initialization
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return deviceInfo;
}
