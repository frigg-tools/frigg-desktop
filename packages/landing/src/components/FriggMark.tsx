import { useId } from 'react';
import type { SVGProps } from 'react';

export default function FriggMark(props: SVGProps<SVGSVGElement>) {
  const gradientId = `frigg-mark-${useId().replace(/:/g, '')}`;

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={gradientId} x1="14" y1="14" x2="50" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="0.52" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path
        d="M45 14H29C21.82 14 16 19.82 16 27v23"
        stroke={`url(#${gradientId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 30h27"
        stroke={`url(#${gradientId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="14" r="5.5" fill={`url(#${gradientId})`} />
      <circle cx="47" cy="30" r="5.5" fill={`url(#${gradientId})`} />
      <circle cx="16" cy="53" r="5.5" fill={`url(#${gradientId})`} />
    </svg>
  );
}
