import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  water: 'M16 3C13 8 6 15 6 21a10 10 0 0 0 20 0C26 15 19 8 16 3Zm-5 17c0 4 2 6 5 6',
  fire: 'M17 2c2 8-5 10-3 16 3-1 5-4 5-7 5 4 8 8 7 13-1 5-5 7-10 7S5 27 6 21c1-5 5-7 5-13 2 2 3 4 3 6',
  earth: 'm3 17 13-8 13 8-13 8L3 17Zm0 6 13 8 13-8M16 9V3m-5 4 5-4 5 4',
  steam: 'M7 27h18M9 21c-7-6 7-7 0-14m7 14c-7-6 7-7 0-17m7 17c-7-6 7-7 0-14',
  lava: 'm3 28 8-20 5 7 5-7 8 20H3Zm9-18 4 12 5-12M7 26h18',
  mud: 'M3 23c5-4 8 4 13 0s8 4 13 0M3 28c5-4 8 4 13 0s8 4 13 0M8 15l8-9 8 9M12 15h8',
  mist: 'M3 12h18M9 18h20M3 24h18M25 12h4M3 18h2M25 24h4',
  rock: 'm4 23 6-16 14 2 5 14-11 6L4 23Zm6-16 8 12 6-10M4 23l14-4 0 10',
  spring:
    'M4 24c5 6 19 6 24 0M5 20c4-5 18-5 22 0M10 13c-4-4 4-4 0-8m6 8c-4-4 4-4 0-10m6 10c-4-4 4-4 0-8',
  cloud: 'M9 25a7 7 0 1 1 0-14c3-11 18-8 17 3a6 6 0 0 1-1 11H9Z',
  storm: 'M8 20a6 6 0 1 1 1-12c4-8 15-4 15 3a5 5 0 0 1 1 9M17 17l-6 8h6l-3 6 10-10h-7l3-4',
  crystal: 'm6 11 10-8 10 8-3 15-7 5-7-5-3-15Zm0 0h20M16 3l-4 8 4 20 4-20-4-8',
  ash: 'M4 28h24M7 23l9-8 9 8M16 10V7M8 12 6 9m18 3 2-3M14 3h4',
  pot: 'M9 4h14l-2 8c13 14 6 19-5 19S-2 26 11 12L9 4Zm1 8h12M8 22h16',
  swamp: 'M3 27c5-4 8 4 13 0s8 4 13 0M9 22V8m0 6-5-4m5 8 5-4M23 22V4m0 7 5-4m-5 11-5-4',
  leaf: 'M5 27C3 11 11 4 28 4c0 17-7 25-23 23Zm0 0L22 10m-9 9v-6m0 6h6',
  rain: 'M8 19a6 6 0 1 1 1-12c4-8 15-4 15 3a5 5 0 0 1 0 9H8Zm0 5-2 5m10-5-2 5m10-5-2 5',
  forest: 'm2 23 7-12 7 12H2Zm12-3 8-16 8 16H14ZM9 23v6m13-9v9M4 30h24',
  life: 'M16 28C-3 17 2 4 10 6c3 0 5 2 6 5 1-3 3-5 6-5 8-2 13 11-6 22Zm-8-10h5l3-5 3 9 3-4h5',
  ocean: 'M2 12c5-7 9 7 14 0s9 7 14 0M2 20c5-7 9 7 14 0s9 7 14 0M2 28c5-7 9 7 14 0s9 7 14 0',
  mountain: 'm2 27 10-19 6 10 4-7 8 16H2Zm6-11 4 3 4-3m3 2 3 3 3-3',
  spark: 'm16 3 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z',
  book: 'M3 5c5-2 9-1 13 2 4-3 8-4 13-2v22c-5-2-9-1-13 2-4-3-8-4-13-2V5Zm13 2v22',
  sound: 'M4 12h6l8-7v22l-8-7H4v-8Zm19-3c5 4 5 10 0 14m3-18c8 6 8 16 0 22',
  mute: 'M4 12h6l8-7v22l-8-7H4v-8Zm19 0 7 8m0-8-7 8',
  back: 'm19 7-9 9 9 9',
  close: 'm8 8 16 16M24 8 8 24',
  rest: 'M7 17a10 10 0 1 0 3-9M3 6v9h9M16 11v6l4 3',
  arrow: 'M5 16h22m-8-8 8 8-8 8',
  help: 'M12 12a5 5 0 1 1 7 4c-3 1-3 3-3 5m0 5v1M16 2a14 14 0 1 0 0 28 14 14 0 0 0 0-28',
};
export function Icon({
  name,
  size = 24,
  className = '',
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.spark} />
    </svg>
  );
}
export function Furnace({
  compact = false,
  working = false,
  elements = [],
}: {
  compact?: boolean;
  working?: boolean;
  elements?: string[];
}) {
  const fire = elements.some((token) =>
    ['F', 'blaze', 'lava', 'scorch', 'boiling', 'earthfire'].includes(token),
  );
  const water = elements.some((token) =>
    ['W', 'steam', 'mist', 'cloud', 'spring', 'swamp', 'thundercloud'].includes(token),
  );
  const earth = elements.some((token) =>
    ['E', 'rock', 'silt', 'mud', 'soil', 'ash', 'obsidian'].includes(token),
  );
  return (
    <div
      className={`furnace ${compact ? 'compact' : ''} ${working ? 'is-working' : ''} ${fire ? 'has-fire' : ''} ${water ? 'has-water' : ''} ${earth ? 'has-earth' : ''}`}
      aria-hidden="true"
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit orbit-three" />
      <span className="orbit-mark mark-water">
        <Icon name="water" size={22} />
      </span>
      <span className="orbit-mark mark-fire">
        <Icon name="fire" size={22} />
      </span>
      <span className="orbit-mark mark-earth">
        <Icon name="earth" size={22} />
      </span>
      <svg
        className="forge-art"
        viewBox="0 0 200 200"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <linearGradient
            id="bronze"
            x1="40"
            y1="50"
            x2="160"
            y2="160"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#eed9a6" />
            <stop offset=".45" stopColor="#927851" />
            <stop offset="1" stopColor="#d2ba83" />
          </linearGradient>
          <radialGradient id="ember">
            <stop stopColor="#f4b567" stopOpacity=".3" />
            <stop offset="1" stopColor="#b37240" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
            <stop stopColor="#e57536" />
            <stop offset=".55" stopColor="#ffc77c" />
            <stop offset="1" stopColor="#fff0c1" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="110" r="65" fill="url(#ember)" stroke="none" />
        {working && (
          <g className="forge-flames" fill="url(#flame)" stroke="none">
            <path d="M65 166c-15-15 4-21 0-34 20 14 10 20 18 30-5 8-12 9-18 4Z" />
            <path d="M86 171c-18-19 10-29 5-50 26 25 3 30 19 46-5 12-16 13-24 4Z" />
            <path d="M112 170c-13-16 9-24 6-39 22 17 1 25 13 33-2 10-12 14-19 6Z" />
            <path d="M137 165c-13-12 3-18 4-29 16 18 7 21 7 27-3 5-8 6-11 2Z" />
          </g>
        )}
        <g stroke="url(#bronze)" strokeWidth="2.4">
          <path d="M60 80c-16-17-28-3-22 12 4 9 15 9 25 6m77-18c16-17 28-3 22 12-4 9-15 9-25 6" />
          <path d="M59 72h82l-6 53c-2 18-15 28-35 28s-33-10-35-28l-6-53Z" fill="#202a25" />
          <path d="M54 66h92v7H54zm10-8h72l10 8H54l10-8Zm8-1c3-11 53-11 56 0M91 47V37h18v10M74 149l-6 21 14-15m44-6 6 21-14-15M70 83h60M68 132h64" />
          <path d="M78 95v24m44-24v24m-33-11 11-14 11 14-11 16-11-16Z" />
          <path d="M97 102h6m-3 0v12" strokeWidth="1.5" />
        </g>
        <path
          className="idle-steam"
          d="M93 31c-10-12 13-10 4-24m10 25c-7-9 9-9 5-18"
          stroke="#bca576"
          strokeWidth="1.1"
          opacity=".6"
        />
        {working && (
          <g
            className="forge-plumes"
            stroke={water ? '#c6e4df' : '#e9cfaa'}
            strokeWidth="6"
            opacity=".7"
          >
            <path d="M80 60c-23-21 22-22 2-43" />
            <path d="M100 55c-25-22 23-28 0-50" />
            <path d="M120 60c-19-18 20-25 3-43" />
          </g>
        )}
      </svg>
      {working && (
        <div className="forge-particles">
          {Array.from({ length: 18 }, (_, i) => (
            <i
              key={i}
              className={
                water && i % 3 === 0
                  ? 'vapor-particle'
                  : earth && i % 4 === 0
                    ? 'earth-particle'
                    : 'ember-particle'
              }
              style={
                {
                  '--i': i,
                  '--drift': `${(i % 2 ? 1 : -1) * (18 + i * 3)}px`,
                  '--delay': `${-(i % 7) * 0.18}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <i className="mote mote-one" />
      <i className="mote mote-two" />
      <i className="mote mote-three" />
    </div>
  );
}
