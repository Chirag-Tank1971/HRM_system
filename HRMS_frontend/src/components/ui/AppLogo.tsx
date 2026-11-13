import React from 'react';

interface AppLogoProps {
  /** Tailwind size classes, e.g. "w-8 h-8". */
  className?: string;
  alt?: string;
}

/** Application logo (served from /public/logo.svg). */
export const AppLogo: React.FC<AppLogoProps> = ({
  className = 'w-8 h-8',
  alt = 'Arisotech HRMS',
}) => (
  <img
    src="/logo.svg"
    alt={alt}
    draggable={false}
    className={`${className} shrink-0 object-contain select-none`}
  />
);
