'use client';

import { motion } from 'framer-motion';
import { Film, Clock, Scissors, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface CompletionSummaryProps {
  sourceDurationMs: number;
  outputDurationMs: number;
  editCount: number;
  processingTimeMs: number;
  signalCounts?: Record<string, number>;
  onDismiss: () => void;
  onOpenStudio: () => void;
  onExport: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export function CompletionSummary({
  sourceDurationMs,
  outputDurationMs,
  editCount,
  processingTimeMs,
  signalCounts,
  onDismiss,
  onOpenStudio,
  onExport,
}: CompletionSummaryProps) {
  const timeCutMs = Math.max(0, sourceDurationMs - outputDurationMs);
  const percentShorter = sourceDurationMs > 0
    ? Math.round((timeCutMs / sourceDurationMs) * 100)
    : 0;

  const stats = [
    {
      icon: Film,
      label: 'Final Duration',
      value: formatTime(outputDurationMs),
      color: '#F5A623',
    },
    {
      icon: Clock,
      label: 'Time Saved',
      value: formatTime(timeCutMs),
      sub: percentShorter > 0 ? `${percentShorter}% shorter` : undefined,
      color: '#1A9E8F',
    },
    {
      icon: Scissors,
      label: 'AI Edits',
      value: String(editCount),
      color: '#F5A623',
    },
    {
      icon: Zap,
      label: 'Processing Time',
      value: formatTime(processingTimeMs),
      color: '#D4A54A',
    },
  ];

  const hasSignals = signalCounts && Object.keys(signalCounts).length > 0;

  return (
    <motion.div
      className="glass-card rounded-2xl p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-[#22C55E] animate-glow-pulse" />
          <span className="text-sm font-medium" style={{ color: '#22C55E' }}>Processing Complete</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Your video is ready</h2>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            variants={itemVariants}
            className="glass-subtle rounded-xl p-4 text-center"
          >
            <stat.icon className="h-5 w-5 mx-auto mb-2" style={{ color: stat.color }} />
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{stat.label}</p>
            {stat.sub && (
              <p className="text-xs mt-0.5 font-medium" style={{ color: stat.color }}>{stat.sub}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Signal breakdown */}
      {hasSignals && (
        <motion.details variants={itemVariants} className="mb-8">
          <summary className="text-sm font-medium cursor-pointer" style={{ color: 'var(--color-muted)' }}>
            Signal Breakdown
          </summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(signalCounts!).map(([type, count]) => (
              <Badge key={type} variant="outline">
                {type.replace(/_/g, ' ').toLowerCase()}: {count}
              </Badge>
            ))}
          </div>
        </motion.details>
      )}

      {/* Actions */}
      <motion.div variants={itemVariants} className="flex items-center justify-center gap-3">
        <Button onClick={onOpenStudio} className="gap-2">
          Enter Studio
        </Button>
        <Button variant="outline" onClick={onExport} className="gap-2">
          Export Video
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          View Details
        </Button>
      </motion.div>
    </motion.div>
  );
}
