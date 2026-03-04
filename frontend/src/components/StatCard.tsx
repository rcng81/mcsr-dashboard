import { Trophy, Swords, Flame, Timer } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: "trophy" | "swords" | "flame" | "timer";
};

const iconMap: Record<NonNullable<Props["icon"]>, ReactNode> = {
  trophy: <Trophy className="h-4 w-4" />,
  swords: <Swords className="h-4 w-4" />,
  flame: <Flame className="h-4 w-4" />,
  timer: <Timer className="h-4 w-4" />
};

export function StatCard({ label, value, hint, icon }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
        {icon ? <span className="text-cyan">{iconMap[icon]}</span> : null}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
