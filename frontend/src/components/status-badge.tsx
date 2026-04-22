import clsx from "clsx";

type DeploymentStatus =
  | "queued"
  | "building"
  | "running"
  | "switching"
  | "success"
  | "failed"
  | "stopped";

const statusClassMap: Record<DeploymentStatus, string> = {
  queued: "bg-slate-100 text-slate-700",
  building: "bg-blue-100 text-blue-700",
  running: "bg-cyan-100 text-cyan-800",
  switching: "bg-amber-100 text-amber-800",
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  stopped: "bg-zinc-100 text-zinc-700"
};

export function StatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        statusClassMap[status]
      )}
    >
      {status}
    </span>
  );
}
