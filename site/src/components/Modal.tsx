import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useBackHandler } from "../lib/backstack";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: Props) {
  useBackHandler(() => {
    if (!open) return false;
    onClose();
    return true;
  }, 3);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink-950/80 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${SIZES[size]} animate-scale-in rounded-t-2xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-2xl`}
      >
        {(title || subtitle) && (
          <header className="flex items-start gap-3 border-b border-white/[0.07] px-5 py-4">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-base font-semibold text-white">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
            </div>
            <button className="icon-btn h-8 w-8" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </header>
        )}
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}
