import { Cloud } from "lucide-react";

export function Logo({ size = "md", showText = true }: { size?: "sm" | "md" | "lg"; showText?: boolean }) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const icon = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${box} grid place-items-center rounded-2xl bg-gradient-to-br from-cloud-400 via-cloud-500 to-violet-500 text-white shadow-lg shadow-cloud-600/30`}
      >
        <Cloud className={icon} strokeWidth={2.2} />
      </div>
      {showText && (
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight text-white">
            Nube<span className="text-cloud-400">.</span>
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Almacenamiento</p>
        </div>
      )}
    </div>
  );
}
