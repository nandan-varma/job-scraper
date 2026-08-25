import { cn } from "@/lib/utils";
import { companyGradient, initials } from "@/lib/format";

interface Props {
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = {
  sm: "size-8 rounded-lg text-xs",
  md: "size-10 rounded-xl text-sm",
  lg: "size-12 rounded-xl text-base",
  xl: "size-16 rounded-2xl text-xl",
} as const;

/** Deterministic gradient monogram avatar — no external logo requests. */
export function CompanyLogo({ name, className, size = "md" }: Props) {
  const [from, to] = companyGradient(name);
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-bold text-primary-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        SIZES[size],
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials(name)}
    </div>
  );
}
