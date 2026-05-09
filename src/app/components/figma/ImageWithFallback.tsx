import React, { useState } from 'react';

type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallback?: React.ReactNode;
};

export function ImageWithFallback({ fallback, src, alt, className, ...props }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={className}
        role="img"
        aria-label={alt}
        style={{
          background: 'linear-gradient(135deg, rgba(16,16,18,1) 0%, rgba(28,29,31,1) 45%, rgba(76,29,149,0.35) 100%)',
        }}
      >
        {fallback ?? null}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      {...props}
    />
  );
}