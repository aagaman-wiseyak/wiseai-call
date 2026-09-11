import React from 'react';
import { PhoneCall } from 'lucide-react';

interface WiseBrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

export const WiseBrandLogo: React.FC<WiseBrandLogoProps> = ({
  size = 'md',
  showTagline: _showTagline = false,
  className = '',
}) => {
  const dimensions = {
    sm: { box: 30, icon: 15, text: '14px' },
    md: { box: 34, icon: 17, text: '16px' },
    lg: { box: 40, icon: 20, text: '18px' },
  }[size];

  return (
    <div
      className={`wise-brand-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        userSelect: 'none',
      }}
    >
      {/* Generic Clean Phone Logo in Brand Cyan */}
      <div
        className="wise-phone-box"
        style={{
          width: dimensions.box,
          height: dimensions.box,
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #4AADDE 0%, #3B9ECF 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          flexShrink: 0,
          boxShadow: '0 2px 6px rgba(74, 173, 222, 0.28)',
        }}
      >
        <PhoneCall size={dimensions.icon} strokeWidth={2.2} />
      </div>

      {/* Clean Brand Title: Wiseai call */}
      <span
        style={{
          fontSize: dimensions.text,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: '#202224',
          whiteSpace: 'nowrap',
          lineHeight: 1.1,
        }}
      >
        Wiseai call
      </span>
    </div>
  );
};
