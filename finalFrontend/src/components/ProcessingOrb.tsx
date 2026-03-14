'use client';

import { motion } from 'framer-motion';

interface ProcessingOrbProps {
  progress?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { px: 48, ring: 20, stroke: 2 },
  md: { px: 96, ring: 40, stroke: 3 },
  lg: { px: 160, ring: 68, stroke: 4 },
};

export function ProcessingOrb({ progress, label, size = 'md' }: ProcessingOrbProps) {
  const { px, ring, stroke } = SIZES[size];
  const circumference = 2 * Math.PI * ring;
  const dashOffset = progress != null ? circumference * (1 - progress / 100) : circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: px, height: px }}>
        {/* Background glow */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(245,166,35,0.2) 0%, rgba(245,166,35,0) 70%)',
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 0.8, 0.6],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Core orb */}
        <motion.div
          className="absolute rounded-full"
          style={{
            inset: px * 0.18,
            background: 'radial-gradient(circle at 40% 38%, #FBC96B 0%, #F5A623 40%, #D4870A 80%)',
            backdropFilter: 'blur(10px)',
          }}
          animate={{
            scale: [1, 1.04, 1],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Inner shimmer */}
        <motion.div
          className="absolute rounded-full overflow-hidden"
          style={{
            inset: px * 0.18,
          }}
          animate={{
            rotate: [0, 360],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 40%, rgba(255,255,255,0.1) 60%, transparent 100%)',
            }}
          />
        </motion.div>

        {/* Glass highlight */}
        <div
          className="absolute rounded-full"
          style={{
            top: px * 0.22,
            left: px * 0.24,
            width: px * 0.3,
            height: px * 0.2,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)',
            transform: 'rotate(-15deg)',
          }}
        />

        {/* Progress ring */}
        {progress != null && (
          <svg
            className="absolute inset-0"
            width={px}
            height={px}
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Background ring */}
            <circle
              cx={px / 2}
              cy={px / 2}
              r={ring}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={stroke}
            />
            {/* Progress ring */}
            <motion.circle
              cx={px / 2}
              cy={px / 2}
              r={ring}
              fill="none"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
        )}

        {/* Center percentage (lg only) */}
        {size === 'lg' && progress != null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-lg font-bold drop-shadow-sm">
              {Math.round(progress)}%
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      {label && size !== 'sm' && (
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
          {label}
        </p>
      )}
    </div>
  );
}
