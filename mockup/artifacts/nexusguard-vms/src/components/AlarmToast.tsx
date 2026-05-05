import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bell, X } from 'lucide-react';

interface AlarmToastProps {
  open: boolean;
  onClose: () => void;
}

export function AlarmToast({ open, onClose }: AlarmToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="fixed top-4 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-[hsl(354_52%_52%_/_0.35)] bg-[hsl(220_22%_8%)] shadow-2xl overflow-hidden"
        >
          <div className="h-1 w-full bg-[hsl(354,52%,52%)]" />
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-[hsl(354_52%_52%_/_0.12)] border border-[hsl(354_52%_52%_/_0.22)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-[hsl(354,52%,65%)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[hsl(354_52%_52%_/_0.3)] bg-[hsl(354_52%_52%_/_0.08)] text-[hsl(354,52%,70%)] font-bold tracking-wide">
                    P1
                  </span>
                  <span className="text-[11px] font-semibold text-foreground">Critical alarm detected</span>
                </div>
                <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  A high-priority event was generated from the live security feed and requires immediate attention.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                    <Bell className="w-3 h-3 text-[hsl(354,52%,65%)]" />
                    Real-time notification
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
                aria-label="Close alarm toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
