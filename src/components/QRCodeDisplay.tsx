import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  colorDark?: string;
  colorLight?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  size = 200,
  className = '',
  colorDark = '#2D2D2D',
  colorLight = '#ffffff',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    // Render at high resolution (at least 320px or 4x size) so dense payloads have crisp modules
    // and finder pattern squares are mathematically sharp without sub-pixel anti-aliasing artifacts
    const renderWidth = Math.max(size * 4, 320);

    QRCode.toDataURL(
      value,
      {
        width: renderWidth,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: colorDark,
          light: colorLight,
        },
      },
      (err, url) => {
        if (!err && url && isMounted) {
          setDataUrl(url);
        }
      }
    );
    return () => {
      isMounted = false;
    };
  }, [value, size, colorDark, colorLight]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-[#F0EBE3] animate-pulse rounded-lg flex items-center justify-center text-xs text-[#6B6B6B] ${className}`}
      >
        Generating QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`QR Code for ${value}`}
      className={`object-contain ${className}`}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  );
};
