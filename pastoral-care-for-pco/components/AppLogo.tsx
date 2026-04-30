
import React from 'react';

export const AppLogo: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4A90E2" />
        <stop offset="100%" stopColor="#357ABD" />
      </linearGradient>
      <linearGradient id="yellow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F5A623" />
        <stop offset="100%" stopColor="#F8E71C" />
      </linearGradient>
    </defs>
    {/* Left Person */}
    <circle cx="35" cy="30" r="15" fill="url(#blue-grad)" />
    <path d="M15 70C15 50 35 45 50 45C35 45 35 60 35 80C35 80 15 80 15 70Z" fill="url(#blue-grad)" />
    
    {/* Right Person */}
    <circle cx="65" cy="30" r="15" fill="url(#yellow-grad)" />
    <path d="M85 70C85 50 65 45 50 45C65 45 65 60 65 80C65 80 85 80 85 70Z" fill="url(#yellow-grad)" />

    {/* Center Shield/Cross Container */}
    <path d="M50 40C40 50 40 75 50 85C60 75 60 50 50 40Z" fill="#357ABD" stroke="white" strokeWidth="4" />
    <path d="M50 48V77M40 60H60" stroke="white" strokeWidth="6" strokeLinecap="round" />
  </svg>
);
