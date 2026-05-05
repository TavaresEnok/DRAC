import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  subtext?: string;
  icon: LucideIcon;
  accent?: string; // e.g. 'chart-3', 'destructive', 'chart-2'
  alert?: boolean;
  index?: number;
}

export function MetricCard({
  label,
  value,
  subtitle,
  subtext,
  icon: Icon,
  accent = 'primary',
  alert,
  index = 0,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="ops-card relative overflow-hidden p-4 min-h-[118px] flex flex-col justify-between gap-3"
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `hsl(var(--${alert ? 'destructive' : accent}) / 0.55)` }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-ui">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center border"
          style={{
            background: `hsl(var(--${accent}) / 0.10)`,
            borderColor: `hsl(var(--${accent}) / 0.18)`,
          }}
        >
          <Icon
            className="w-3.5 h-3.5"
            style={{ color: `hsl(var(--${accent}))` }}
          />
        </div>
      </div>
      <div>
        <div
          className="text-[28px] leading-none font-semibold font-mono tabular-nums"
          style={{ color: alert ? `hsl(var(--destructive))` : `hsl(var(--foreground))` }}
        >
          {value}
        </div>
        {subtitle && (
          <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2">
            {subtitle}
          </div>
        )}
        {subtext && (
          <div className="text-[10px] text-[hsl(var(--muted-foreground)_/_0.72)] mt-1 font-mono">
            {subtext}
          </div>
        )}
      </div>
    </motion.div>
  );
}
