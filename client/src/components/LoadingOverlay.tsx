import { Loader2 } from "lucide-react";

type Props = {
  show: boolean;
  label?: string;
};

/**
 * Full-area overlay spinner.
 * Place inside a `relative` container.
 */
export default function LoadingOverlay({ show, label }: Props) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>{label ?? "Calculating..."}</span>
      </div>
    </div>
  );
}
