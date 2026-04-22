"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  Loader2,
  Orbit,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Send,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  User,
  Webhook,
  X,
  XCircle,
  Zap
} from "lucide-react";

import { backendRequest } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description?: string;
  owner: { login: string };
}

interface Project {
  id: string;
  name: string;
  slug: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  branch: string;
  activeDeploymentId?: string;
  webhookId?: number;
  framework?: string;
  rootDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  nodeVersion?: string;
  autoDeploy: boolean;
  deployHookSecret?: string;
  createdAt: string;
}

type DeploymentStatus =
  | "queued" | "building" | "running" | "switching"
  | "success" | "failed" | "stopped" | "cancelled";

interface Deployment {
  id: string;
  commitSha: string;
  commitMessage?: string;
  branch: string;
  status: DeploymentStatus;
  url: string;
  port?: number;
  containerId?: string;
  containerName?: string;
  errorMessage?: string;
  isPreview: boolean;
  prNumber?: number;
  prTitle?: string;
  rollbackFromDeploymentId?: string;
  triggeredBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface AIInsights {
  source: "gemini" | "rule-based";
  summary: string;
  recommendations: string[];
}

type ProjectTab = "deployments" | "logs" | "env" | "settings";

// ─── Constants ────────────────────────────────────────────────────────────────

const IN_PROGRESS = new Set<DeploymentStatus>(["queued", "building", "running", "switching"]);

const FRAMEWORKS = [
  { value: "", label: "Auto-detect" },
  { value: "nextjs", label: "Next.js" },
  { value: "react", label: "React (CRA / Vite)" },
  { value: "vite", label: "Vite" },
  { value: "vue", label: "Vue.js" },
  { value: "nuxt", label: "Nuxt" },
  { value: "svelte", label: "Svelte" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "gatsby", label: "Gatsby" },
  { value: "nestjs", label: "NestJS" },
  { value: "express", label: "Express.js" },
  { value: "fastify", label: "Fastify" },
  { value: "node", label: "Node.js (other)" },
  { value: "html", label: "Static HTML" }
];

const NODE_VERSIONS = ["18", "20", "21", "22"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(dateRaw: string): string {
  const diffMs = Date.now() - new Date(dateRaw).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: DeploymentStatus }) {
  if (IN_PROGRESS.has(status)) return <Loader2 className="h-3 w-3 animate-spin text-amber-500" />;
  const colors: Record<DeploymentStatus, string> = {
    success: "bg-emerald-500", failed: "bg-rose-500", stopped: "bg-slate-400",
    cancelled: "bg-slate-400", queued: "bg-slate-400", building: "bg-amber-500",
    running: "bg-cyan-500", switching: "bg-indigo-500"
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full flex-shrink-0", colors[status])} />;
}

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const styles: Record<DeploymentStatus, string> = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-rose-50 text-rose-700 border-rose-200",
    stopped: "bg-slate-100 text-slate-600 border-slate-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    queued: "bg-slate-100 text-slate-600 border-slate-200",
    building: "bg-amber-50 text-amber-700 border-amber-200",
    running: "bg-cyan-50 text-cyan-700 border-cyan-200",
    switching: "bg-indigo-50 text-indigo-700 border-indigo-200"
  };
  const labels: Record<DeploymentStatus, string> = {
    success: "Ready", failed: "Failed", stopped: "Stopped", cancelled: "Cancelled",
    queued: "Queued", building: "Building", running: "Running", switching: "Routing"
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[status])}>
      <StatusDot status={status} />
      {labels[status]}
    </span>
  );
}

// Log lines rendered inside dark terminal card — keep dark text here
function LogLine({ line }: { line: string }) {
  const lower = line.toLowerCase();
  const cls =
    lower.includes("error") || lower.includes("failed") || lower.includes("fatal")
      ? "text-red-400"
      : lower.includes("warn")
        ? "text-amber-400"
        : lower.includes("✅") || lower.includes("success") || lower.includes("completed")
          ? "text-emerald-400"
          : lower.includes("→") || lower.includes("info")
            ? "text-cyan-300"
            : "text-slate-300";
  return <div className={cn("py-0.5 font-mono text-xs break-all leading-relaxed", cls)}>{line}</div>;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function FieldInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100",
        className
      )}
    />
  );
}

function FieldSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100",
        className
      )}
    >
      {children}
    </select>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5">{children}</label>;
}

function FieldGroup({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="border-slate-200/90 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
      <CardHeader className="flex-row items-center justify-between pb-3 pt-5 px-5">
        <CardTitle className="text-sm font-semibold text-slate-800">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={cn("h-5 w-9 rounded-full transition-colors", checked ? "bg-indigo-600" : "bg-slate-200")} />
        <div className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
      </div>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

function PrimaryBtn({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(79,70,229,0.22)] hover:bg-indigo-500 transition disabled:opacity-60 disabled:cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-60",
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardClient() {
  const { data: session } = useSession();
  const token = session?.accessToken as string | undefined;
  const user = session?.user;

  const [repos, setRepos] = useState<Repository[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [envEdits, setEnvEdits] = useState<Array<{ key: string; value: string; hidden: boolean }>>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectTab>("deployments");
  const [viewingDeploymentId, setViewingDeploymentId] = useState("");

  // Create project
  const [showNewProject, setShowNewProject] = useState(false);
  const [newStep, setNewStep] = useState<1 | 2>(1);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("main");
  const [newFramework, setNewFramework] = useState("");
  const [newRootDir, setNewRootDir] = useState("");
  const [newInstallCmd, setNewInstallCmd] = useState("");
  const [newBuildCmd, setNewBuildCmd] = useState("");
  const [newStartCmd, setNewStartCmd] = useState("");
  const [newNodeVer, setNewNodeVer] = useState("20");
  const [newAutoDeploy, setNewAutoDeploy] = useState(true);
  const [repoSearch, setRepoSearch] = useState("");

  // Settings
  const [sName, setSName] = useState("");
  const [sBranch, setSBranch] = useState("");
  const [sFramework, setSFramework] = useState("");
  const [sRootDir, setSRootDir] = useState("");
  const [sInstallCmd, setSInstallCmd] = useState("");
  const [sBuildCmd, setSBuildCmd] = useState("");
  const [sStartCmd, setSStartCmd] = useState("");
  const [sNodeVer, setSNodeVer] = useState("20");
  const [sAutoDeploy, setSAutoDeploy] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hookSecret, setHookSecret] = useState<string | null>(null);
  const [showHookUrl, setShowHookUrl] = useState(false);

  const [busy, setBusy] = useState(false);
  const [sBusy, setSBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedProjectId), [projects, selectedProjectId]);
  const activeDeployment = useMemo(
    () => deployments.find((d) => d.id === selectedProject?.activeDeploymentId) ?? deployments.find((d) => d.status === "success"),
    [deployments, selectedProject]
  );
  const viewingDeployment = useMemo(
    () => deployments.find((d) => d.id === viewingDeploymentId) ?? deployments[0],
    [deployments, viewingDeploymentId]
  );
  const hasInProgress = deployments.some((d) => IN_PROGRESS.has(d.status));
  const filteredRepos = useMemo(
    () => repos.filter((r) => r.full_name.toLowerCase().includes(repoSearch.toLowerCase())),
    [repos, repoSearch]
  );
  const prodDeps = useMemo(() => deployments.filter((d) => !d.isPreview), [deployments]);
  const previewDeps = useMemo(() => deployments.filter((d) => d.isPreview), [deployments]);

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    if (!token) return;
    try { const r = await backendRequest<{ projects: Project[] }>("/api/projects", token); setProjects(r.projects ?? []); }
    catch { /* silent */ }
  }, [token]);

  const loadDeployments = useCallback(async (pid: string) => {
    if (!token || !pid) return;
    const r = await backendRequest<{ deployments: Deployment[] }>(`/api/projects/${pid}/deployments`, token);
    setDeployments(r.deployments ?? []);
  }, [token]);

  const loadLogs = useCallback(async (did: string) => {
    if (!token || !did) return;
    const r = await backendRequest<{ logs: string[] }>(`/api/deployments/${did}/logs`, token);
    setLogs(r.logs ?? []);
  }, [token]);

  const loadEnvVars = useCallback(async (pid: string) => {
    if (!token || !pid) return;
    const r = await backendRequest<{ variables: Record<string, string> }>(`/api/projects/${pid}/env`, token);
    setEnvEdits(Object.entries(r.variables ?? {}).map(([k, v]) => ({ key: k, value: v, hidden: true })));
  }, [token]);

  const loadRepos = useCallback(async () => {
    if (!token) return;
    try { const r = await backendRequest<{ repos: Repository[] }>("/api/repos", token); setRepos(r.repos ?? []); }
    catch { /* silent */ }
  }, [token]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => { if (token) void loadProjects(); }, [token, loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) { setDeployments([]); setLogs([]); return; }
    void loadDeployments(selectedProjectId);
    if (activeTab === "env") void loadEnvVars(selectedProjectId);
    if (activeTab === "logs" && viewingDeploymentId) void loadLogs(viewingDeploymentId);
  }, [selectedProjectId, activeTab]);

  useEffect(() => {
    if (!selectedProject) return;
    setSName(selectedProject.name);
    setSBranch(selectedProject.branch);
    setSFramework(selectedProject.framework ?? "");
    setSRootDir(selectedProject.rootDirectory ?? "");
    setSInstallCmd(selectedProject.installCommand ?? "");
    setSBuildCmd(selectedProject.buildCommand ?? "");
    setSStartCmd(selectedProject.startCommand ?? "");
    setSNodeVer(selectedProject.nodeVersion ?? "20");
    setSAutoDeploy(selectedProject.autoDeploy ?? true);
    setHookSecret(selectedProject.deployHookSecret ?? null);
    setConfirmDelete(false);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProjectId || !hasInProgress) return;
    const id = setInterval(() => void loadDeployments(selectedProjectId), 3000);
    return () => clearInterval(id);
  }, [selectedProjectId, hasInProgress, loadDeployments]);

  useEffect(() => {
    if (!viewingDeployment || !IN_PROGRESS.has(viewingDeployment.status) || activeTab !== "logs") return;
    const id = setInterval(() => void loadLogs(viewingDeployment.id), 2000);
    return () => clearInterval(id);
  }, [viewingDeployment, activeTab, loadLogs]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  useEffect(() => { if (viewingDeploymentId && activeTab === "logs") void loadLogs(viewingDeploymentId); }, [viewingDeploymentId]);

  // ── Flash helper ─────────────────────────────────────────────────────────

  function showFlash(msg: string) { setFlash(msg); setTimeout(() => setFlash(""), 3000); }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedRepo) return;
    setBusy(true); setError("");
    try {
      const r = await backendRequest<{ project: Project }>("/api/projects", token, {
        method: "POST",
        body: JSON.stringify({
          repoUrl: selectedRepo.html_url, repoOwner: selectedRepo.owner.login,
          repoName: selectedRepo.name, branch: newBranch || selectedRepo.default_branch,
          projectName: newName || selectedRepo.name,
          framework: newFramework || undefined, rootDirectory: newRootDir || undefined,
          installCommand: newInstallCmd || undefined, buildCommand: newBuildCmd || undefined,
          startCommand: newStartCmd || undefined, nodeVersion: newNodeVer,
          autoDeploy: newAutoDeploy, setupWebhook: true
        })
      });
      setProjects((p) => [r.project, ...p]);
      setSelectedProjectId(r.project.id);
      setActiveTab("deployments");
      setShowNewProject(false);
      resetForm();
      await backendRequest(`/api/projects/${r.project.id}/deploy`, token, { method: "POST", body: JSON.stringify({}) });
      await loadDeployments(r.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally { setBusy(false); }
  }

  function resetForm() {
    setSelectedRepo(null); setNewName(""); setNewBranch("main"); setNewFramework(""); setNewRootDir("");
    setNewInstallCmd(""); setNewBuildCmd(""); setNewStartCmd(""); setNewNodeVer("20"); setNewAutoDeploy(true);
    setRepoSearch(""); setNewStep(1);
  }

  async function handleDeploy() {
    if (!token || !selectedProjectId) return;
    setBusy(true); setError("");
    try {
      await backendRequest(`/api/projects/${selectedProjectId}/deploy`, token, { method: "POST", body: JSON.stringify({}) });
      await loadDeployments(selectedProjectId);
      showFlash("Deployment triggered");
    } catch (err) { setError(err instanceof Error ? err.message : "Deploy failed"); }
    finally { setBusy(false); }
  }

  async function handleRollback() {
    if (!token || !selectedProjectId) return;
    setBusy(true); setError("");
    try {
      await backendRequest(`/api/projects/${selectedProjectId}/rollback`, token, { method: "POST", body: JSON.stringify({}) });
      await loadDeployments(selectedProjectId);
      showFlash("Rollback queued");
    } catch (err) { setError(err instanceof Error ? err.message : "Rollback failed"); }
    finally { setBusy(false); }
  }

  async function handleCancel(depId: string) {
    if (!token) return;
    try {
      await backendRequest(`/api/deployments/${depId}/cancel`, token, { method: "POST", body: JSON.stringify({}) });
      await loadDeployments(selectedProjectId);
      showFlash("Cancellation requested");
    } catch (err) { setError(err instanceof Error ? err.message : "Cancel failed"); }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedProjectId) return;
    setSBusy(true); setError("");
    try {
      const r = await backendRequest<{ project: Project }>(`/api/projects/${selectedProjectId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: sName, branch: sBranch,
          framework: sFramework || null, rootDirectory: sRootDir || null,
          installCommand: sInstallCmd || null, buildCommand: sBuildCmd || null,
          startCommand: sStartCmd || null, nodeVersion: sNodeVer, autoDeploy: sAutoDeploy
        })
      });
      setProjects((p) => p.map((x) => (x.id === r.project.id ? r.project : x)));
      showFlash("Settings saved");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setSBusy(false); }
  }

  async function handleDeleteProject() {
    if (!token || !selectedProjectId) return;
    setSBusy(true);
    try {
      await backendRequest(`/api/projects/${selectedProjectId}`, token, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== selectedProjectId));
      setSelectedProjectId(""); setDeployments([]); showFlash("Project deleted");
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
    finally { setSBusy(false); }
  }

  async function handleRefreshWebhook() {
    if (!token || !selectedProjectId) return;
    setSBusy(true);
    try {
      const r = await backendRequest<{ project: Project; webhookUrl: string }>(`/api/projects/${selectedProjectId}/refresh-webhook`, token, { method: "POST" });
      setProjects((p) => p.map((x) => (x.id === r.project.id ? r.project : x)));
      showFlash(`Webhook updated → ${r.webhookUrl}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Webhook refresh failed"); }
    finally { setSBusy(false); }
  }

  async function handleRotateHook() {
    if (!token || !selectedProjectId) return;
    setSBusy(true);
    try {
      const r = await backendRequest<{ project: Project; deployHookSecret: string }>(`/api/projects/${selectedProjectId}/deploy-hook/rotate`, token, { method: "POST" });
      setHookSecret(r.deployHookSecret); setShowHookUrl(true);
      setProjects((p) => p.map((x) => (x.id === r.project.id ? r.project : x)));
      showFlash("Deploy hook rotated");
    } catch (err) { setError(err instanceof Error ? err.message : "Hook rotation failed"); }
    finally { setSBusy(false); }
  }

  async function handleSaveEnv() {
    if (!token || !selectedProjectId) return;
    setBusy(true);
    try {
      const variables: Record<string, string> = {};
      for (const { key, value } of envEdits) { if (key.trim()) variables[key.trim()] = value; }
      await backendRequest(`/api/projects/${selectedProjectId}/env`, token, { method: "PUT", body: JSON.stringify({ variables }) });
      showFlash("Environment variables saved");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4005").replace(/\/$/, "");
  function getHookUrl(pid: string, secret: string) { return `${backendUrl}/api/deploy-hook/${pid}/${secret}`; }

  // ─────────────────────────────────────────────────────────────────────────
  // NEW PROJECT MODAL
  // ─────────────────────────────────────────────────────────────────────────

  if (showNewProject) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.18)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
                <Rocket className="h-4 w-4 text-indigo-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-800">New Project</h2>
            </div>
            <button onClick={() => { setShowNewProject(false); resetForm(); }} className="text-slate-400 hover:text-slate-700 transition">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Steps */}
          <div className="flex border-b border-slate-200">
            {["Import Repository", "Configure Build"].map((label, i) => (
              <button key={label} onClick={() => { if (selectedRepo) setNewStep((i + 1) as 1 | 2); }}
                className={cn("flex-1 py-2.5 text-xs font-semibold tracking-wide transition", newStep === i + 1 ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500 hover:text-slate-700")}>
                {i + 1}. {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateProject}>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {newStep === 1 ? (
                <div className="space-y-4">
                  <FieldGroup label="Search repositories">
                    <FieldInput placeholder="Search repos..." value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)}
                      onFocus={() => { if (repos.length === 0) void loadRepos(); }} />
                  </FieldGroup>

                  {repos.length === 0 && (
                    <div className="flex justify-center py-4">
                      <button type="button" onClick={() => void loadRepos()} className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 transition">
                        <RefreshCw className="h-4 w-4" /> Load repositories
                      </button>
                    </div>
                  )}

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredRepos.map((repo) => (
                      <label key={repo.id}
                        className={cn("flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition",
                          selectedRepo?.id === repo.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50")}>
                        <input type="radio" className="sr-only" checked={selectedRepo?.id === repo.id}
                          onChange={() => { setSelectedRepo(repo); setNewName(repo.name); setNewBranch(repo.default_branch); }} />
                        <GitBranch className={cn("h-4 w-4 flex-shrink-0", selectedRepo?.id === repo.id ? "text-indigo-500" : "text-slate-400")} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{repo.full_name}</div>
                          {repo.description && <div className="text-xs text-slate-500 truncate">{repo.description}</div>}
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{repo.default_branch}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Project name"><FieldInput value={newName} onChange={(e) => setNewName(e.target.value)} required /></FieldGroup>
                    <FieldGroup label="Branch"><FieldInput value={newBranch} onChange={(e) => setNewBranch(e.target.value)} required /></FieldGroup>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Framework">
                      <FieldSelect value={newFramework} onChange={(e) => setNewFramework(e.target.value)}>
                        {FRAMEWORKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </FieldSelect>
                    </FieldGroup>
                    <FieldGroup label="Node version">
                      <FieldSelect value={newNodeVer} onChange={(e) => setNewNodeVer(e.target.value)}>
                        {NODE_VERSIONS.map((v) => <option key={v} value={v}>Node {v}</option>)}
                      </FieldSelect>
                    </FieldGroup>
                  </div>
                  <FieldGroup label="Root directory" hint="Monorepo subdirectory, e.g. apps/web. Leave blank for repo root.">
                    <FieldInput placeholder="/" value={newRootDir} onChange={(e) => setNewRootDir(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Install command" hint="Overrides auto-detected install step">
                    <FieldInput placeholder="npm ci" value={newInstallCmd} onChange={(e) => setNewInstallCmd(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Build command" hint="Overrides auto-detected build command">
                    <FieldInput placeholder="npm run build" value={newBuildCmd} onChange={(e) => setNewBuildCmd(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Start command" hint="Overrides auto-detected start command">
                    <FieldInput placeholder="npm start" value={newStartCmd} onChange={(e) => setNewStartCmd(e.target.value)} />
                  </FieldGroup>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div>
                      <div className="text-sm font-medium text-slate-800">Auto-deploy on push</div>
                      <div className="text-xs text-slate-500">Deploy automatically when code is pushed</div>
                    </div>
                    <Toggle checked={newAutoDeploy} onChange={setNewAutoDeploy} />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mx-6 mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              {newStep === 1 ? (
                <>
                  <p className="text-xs text-slate-500">{repos.length} repositories loaded</p>
                  <PrimaryBtn type="button" disabled={!selectedRepo} onClick={() => setNewStep(2)}>Continue →</PrimaryBtn>
                </>
              ) : (
                <>
                  <GhostBtn type="button" onClick={() => setNewStep(1)}>← Back</GhostBtn>
                  <PrimaryBtn type="submit" disabled={busy || !newName}>
                    {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Deploying…</> : <><Rocket className="h-4 w-4" /> Deploy Project</>}
                  </PrimaryBtn>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROJECT DETAIL
  // ─────────────────────────────────────────────────────────────────────────

  if (selectedProjectId && selectedProject) {
    const tabs: { id: ProjectTab; label: string; icon: React.ElementType }[] = [
      { id: "deployments", label: "Deployments", icon: Rocket },
      { id: "logs", label: "Logs", icon: Terminal },
      { id: "env", label: "Env Vars", icon: Shield },
      { id: "settings", label: "Settings", icon: Settings }
    ];

    return (
      <div className="min-h-screen bg-[#f4f5f7] text-slate-900">
        {/* Top nav — matches landing page header */}
        <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-6 px-5 md:px-6">
            <div className="flex items-center gap-2.5">
              <span className="text-base font-semibold tracking-tight text-slate-800">onawie.io</span>
            </div>
            <span className="text-slate-300">/</span>
            <button onClick={() => { setSelectedProjectId(""); setDeployments([]); setLogs([]); }}
              className="text-sm text-slate-500 hover:text-slate-800 transition">All projects</button>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-800">{selectedProject.name}</span>

            <div className="ml-auto flex items-center gap-3">
              {activeDeployment?.port && (
                <a href={`http://localhost:${activeDeployment.port}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  localhost:{activeDeployment.port}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <PrimaryBtn onClick={handleDeploy} disabled={busy} className="h-8 px-3 text-xs">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Deploy
              </PrimaryBtn>
              <GhostBtn onClick={handleRollback} disabled={busy} className="h-8 px-3 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Rollback
              </GhostBtn>
            </div>
          </div>
        </header>

        {/* Tab bar */}
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-[1180px] px-5 md:px-6">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id}
                onClick={() => {
                  setActiveTab(id);
                  if (id === "env") void loadEnvVars(selectedProjectId);
                  if (id === "logs" && viewingDeploymentId) void loadLogs(viewingDeploymentId);
                }}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition",
                  activeTab === id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
                )}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="mx-auto w-full max-w-[1180px] px-5 py-7 md:px-6 space-y-5">
          {flash && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />{flash}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError("")}><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* ── DEPLOYMENTS ── */}
          {activeTab === "deployments" && (
            <div className="space-y-5">
              <SectionCard title="Production Deployments"
                action={<button onClick={() => void loadDeployments(selectedProjectId)} className="text-slate-400 hover:text-slate-700 transition"><RefreshCw className="h-4 w-4" /></button>}>
                {prodDeps.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No production deployments yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {prodDeps.map((dep) => (
                      <div key={dep.id}
                        className={cn("flex items-center gap-4 py-3.5 cursor-pointer transition rounded-lg px-2 -mx-2",
                          dep.id === selectedProject.activeDeploymentId ? "bg-indigo-50/60" : "hover:bg-slate-50")}
                        onClick={() => { setViewingDeploymentId(dep.id); setActiveTab("logs"); void loadLogs(dep.id); }}>
                        <StatusDot status={dep.status} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{dep.commitSha.slice(0, 7)}</span>
                            {dep.commitMessage && <span className="text-sm text-slate-800 truncate max-w-xs">{dep.commitMessage}</span>}
                            {dep.rollbackFromDeploymentId && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">rollback</Badge>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                            <span>{formatRelativeTime(dep.createdAt)}</span>
                            {dep.triggeredBy && <span>by {dep.triggeredBy}</span>}
                            {dep.status !== "queued" && dep.updatedAt !== dep.createdAt && <span>{formatDuration(dep.createdAt, dep.updatedAt)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={dep.status} />
                          {IN_PROGRESS.has(dep.status) && (
                            <button onClick={(e) => { e.stopPropagation(); void handleCancel(dep.id); }}
                              className="rounded-full p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition" title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {previewDeps.length > 0 && (
                <SectionCard title="Preview Deployments (Pull Requests)">
                  <div className="divide-y divide-slate-100">
                    {previewDeps.map((dep) => (
                      <div key={dep.id}
                        className="flex items-center gap-4 py-3.5 cursor-pointer hover:bg-slate-50 transition rounded-lg px-2 -mx-2"
                        onClick={() => { setViewingDeploymentId(dep.id); setActiveTab("logs"); void loadLogs(dep.id); }}>
                        <StatusDot status={dep.status} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-xs">PR #{dep.prNumber}</Badge>
                            {dep.prTitle && <span className="text-sm text-slate-800 truncate max-w-xs">{dep.prTitle}</span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                            <span className="font-mono">{dep.commitSha.slice(0, 7)}</span>
                            <span>{dep.branch}</span>
                            <span>{formatRelativeTime(dep.createdAt)}</span>
                          </div>
                        </div>
                        <StatusBadge status={dep.status} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* AI Insights */}
              <SectionCard title="AI Insights"
                action={
                  <button onClick={() => {
                    setInsightsLoading(true);
                    backendRequest<AIInsights>(`/api/projects/${selectedProjectId}/ai-insights`, token!)
                      .then(setInsights).catch((e) => setInsights({ source: "rule-based", summary: e.message, recommendations: [] }))
                      .finally(() => setInsightsLoading(false));
                  }} disabled={insightsLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition">
                    {insightsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {insightsLoading ? "Analyzing…" : "Analyze"}
                  </button>
                }>
                {insights ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-slate-600">{insights.summary}</p>
                    {insights.recommendations.length > 0 && (
                      <ul className="space-y-2">
                        {insights.recommendations.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />{r}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-slate-400">Powered by {insights.source}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Click "Analyze" to get AI-powered insights about your deployments.</p>
                )}
              </SectionCard>
            </div>
          )}

          {/* ── LOGS ── */}
          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-slate-600">Viewing:</span>
                <FieldSelect value={viewingDeploymentId || deployments[0]?.id || ""}
                  onChange={(e) => { setViewingDeploymentId(e.target.value); void loadLogs(e.target.value); }}
                  className="w-auto text-xs">
                  {deployments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.commitSha.slice(0, 7)} — {d.isPreview ? `PR #${d.prNumber}` : d.branch} — {d.status} — {formatRelativeTime(d.createdAt)}
                    </option>
                  ))}
                </FieldSelect>
                <GhostBtn onClick={() => { const id = viewingDeploymentId || deployments[0]?.id; if (id) void loadLogs(id); }} className="h-8 px-3 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" />
                </GhostBtn>
                {viewingDeployment && IN_PROGRESS.has(viewingDeployment.status) && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Live — auto-refreshing
                  </span>
                )}
              </div>

              {/* Terminal block — keep dark like landing page code card */}
              <div className="overflow-hidden rounded-2xl border border-slate-900/10 bg-[#10161f] shadow-[0_20px_38px_rgba(2,8,23,0.28)]">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="ml-2 text-xs text-slate-400">{selectedProject.name} — build & runtime logs</span>
                    {viewingDeployment && <StatusBadge status={viewingDeployment.status} />}
                  </div>
                  <CopyButton text={logs.join("\n")} label="Copy" />
                </div>
                <div className="h-[480px] overflow-y-auto p-5">
                  {logs.length === 0
                    ? <p className="text-xs text-slate-500">No logs available. Select a deployment above.</p>
                    : logs.map((line, i) => <LogLine key={i} line={line} />)
                  }
                  <div ref={logsEndRef} />
                </div>
              </div>

              {viewingDeployment?.errorMessage && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-4 w-4 text-rose-600" />
                    <span className="text-sm font-semibold text-rose-700">Deployment Error</span>
                  </div>
                  <p className="text-sm text-rose-600 font-mono">{viewingDeployment.errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* ── ENV VARS ── */}
          {activeTab === "env" && (
            <SectionCard title="Environment Variables"
              action={<PrimaryBtn onClick={handleSaveEnv} disabled={busy} className="h-8 px-4 text-xs">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</PrimaryBtn>}>
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Variables are injected at runtime. Re-deploy after saving.</p>
                <div className="space-y-2.5">
                  {envEdits.map((env, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <FieldInput placeholder="KEY" value={env.key}
                        onChange={(e) => setEnvEdits((p) => p.map((v, i) => i === idx ? { ...v, key: e.target.value } : v))}
                        className="w-44 font-mono text-xs" />
                      <div className="relative flex-1">
                        <FieldInput placeholder="value" type={env.hidden ? "password" : "text"} value={env.value}
                          onChange={(e) => setEnvEdits((p) => p.map((v, i) => i === idx ? { ...v, value: e.target.value } : v))}
                          className="font-mono text-xs pr-8" />
                        <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          onClick={() => setEnvEdits((p) => p.map((v, i) => i === idx ? { ...v, hidden: !v.hidden } : v))}>
                          {env.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <button onClick={() => setEnvEdits((p) => p.filter((_, i) => i !== idx))}
                        className="text-slate-300 hover:text-rose-500 transition"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <GhostBtn type="button" onClick={() => setEnvEdits((p) => [...p, { key: "", value: "", hidden: false }])} className="h-8 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add variable
                </GhostBtn>
              </div>
            </SectionCard>
          )}

          {/* ── SETTINGS ── */}
          {activeTab === "settings" && (
            <div className="space-y-5">
              <form onSubmit={handleSaveSettings} className="space-y-5">
                <SectionCard title="General">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FieldGroup label="Project name"><FieldInput value={sName} onChange={(e) => setSName(e.target.value)} required /></FieldGroup>
                      <FieldGroup label="Production branch"><FieldInput value={sBranch} onChange={(e) => setSBranch(e.target.value)} required /></FieldGroup>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div>
                        <div className="text-sm font-medium text-slate-800">Auto-deploy on push</div>
                        <div className="text-xs text-slate-500">Deploy automatically when code is pushed to the production branch</div>
                      </div>
                      <Toggle checked={sAutoDeploy} onChange={setSAutoDeploy} />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Build & Output Settings">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FieldGroup label="Framework preset">
                        <FieldSelect value={sFramework} onChange={(e) => setSFramework(e.target.value)}>
                          {FRAMEWORKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </FieldSelect>
                      </FieldGroup>
                      <FieldGroup label="Node.js version">
                        <FieldSelect value={sNodeVer} onChange={(e) => setSNodeVer(e.target.value)}>
                          {NODE_VERSIONS.map((v) => <option key={v} value={v}>Node {v}</option>)}
                        </FieldSelect>
                      </FieldGroup>
                    </div>
                    <FieldGroup label="Root directory" hint="For monorepos. e.g. apps/web">
                      <FieldInput placeholder="/" value={sRootDir} onChange={(e) => setSRootDir(e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="Install command" hint="Overrides auto-detected install step">
                      <FieldInput placeholder="npm ci" value={sInstallCmd} onChange={(e) => setSInstallCmd(e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="Build command" hint="Overrides auto-detected build command">
                      <FieldInput placeholder="npm run build" value={sBuildCmd} onChange={(e) => setSBuildCmd(e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="Start command" hint="Overrides auto-detected start command">
                      <FieldInput placeholder="npm start" value={sStartCmd} onChange={(e) => setSStartCmd(e.target.value)} />
                    </FieldGroup>
                  </div>
                </SectionCard>

                <div className="flex justify-end">
                  <PrimaryBtn type="submit" disabled={sBusy} className="px-6">
                    {sBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Settings"}
                  </PrimaryBtn>
                </div>
              </form>

              {/* Git Integration */}
              <SectionCard title="Git Integration">
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">GitHub Webhook</div>
                      <div className="text-xs text-slate-500">{selectedProject.webhookId ? `Active — Webhook ID ${selectedProject.webhookId}` : "Not configured"}</div>
                    </div>
                    <GhostBtn onClick={handleRefreshWebhook} disabled={sBusy} className="h-8 px-3 text-xs">
                      <Webhook className="h-3.5 w-3.5" />{selectedProject.webhookId ? "Re-register" : "Setup Webhook"}
                    </GhostBtn>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">Deploy Hook</div>
                        <div className="text-xs text-slate-500">Trigger a deploy via HTTP POST to a secret URL</div>
                      </div>
                      <GhostBtn onClick={handleRotateHook} disabled={sBusy} className="h-8 px-3 text-xs">
                        <Zap className="h-3.5 w-3.5" />{hookSecret ? "Rotate" : "Create Hook"}
                      </GhostBtn>
                    </div>
                    {hookSecret && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Deploy Hook URL</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setShowHookUrl((v) => !v)} className="text-slate-400 hover:text-slate-700 transition">
                              {showHookUrl ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <CopyButton text={getHookUrl(selectedProject.id, hookSecret)} label="Copy" />
                          </div>
                        </div>
                        <p className="font-mono text-xs text-slate-600 break-all">
                          {showHookUrl ? getHookUrl(selectedProject.id, hookSecret) : `${backendUrl}/api/deploy-hook/${selectedProject.id}/••••••••`}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">POST to this URL from CI/CD or any external service.</p>
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

              {/* Danger Zone */}
              <Card className="border-rose-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
                <CardHeader className="pb-3 pt-5 px-5">
                  <CardTitle className="text-sm font-semibold text-rose-700">Danger Zone</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {!confirmDelete ? (
                    <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <div>
                        <div className="text-sm font-medium text-slate-800">Delete project</div>
                        <div className="text-xs text-slate-500">Permanently delete this project, all deployments, and stop all containers.</div>
                      </div>
                      <button onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-semibold">This cannot be undone.</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Deletes <strong>{selectedProject.name}</strong>, all {deployments.length} deployment records, and stops all containers.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={handleDeleteProject} disabled={sBusy}
                          className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 transition disabled:opacity-60">
                          {sBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, delete project"}
                        </button>
                        <GhostBtn onClick={() => setConfirmDelete(false)} className="text-xs">Cancel</GhostBtn>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROJECT LIST
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900">
      {/* Header — exactly matches landing page */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-5 md:px-6">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold tracking-tight text-slate-800">onawie.io</span>
            <nav className="hidden items-center gap-6 md:flex">
              {["Projects", "Deployments", "Usage", "Settings"].map((item, i) => (
                <span key={item}
                  className={cn("text-sm font-medium transition", i === 0 ? "text-indigo-600 underline decoration-2 underline-offset-[18px]" : "text-slate-500 hover:text-slate-800 cursor-pointer")}>
                  {item}
                </span>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button className="grid h-8 w-8 place-content-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
              <Bell className="h-4 w-4" />
            </button>
            <Avatar className="h-8 w-8 border border-slate-200">
              {user?.image
                ? <img src={user.image} alt={user.name ?? ""} className="h-8 w-8 rounded-full" />
                : <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">{user?.name?.slice(0, 2).toUpperCase() ?? "U"}</AvatarFallback>
              }
            </Avatar>
            <button onClick={() => signOut()} className="text-xs text-slate-500 hover:text-slate-800 transition">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-5 py-10 md:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h1>
            <p className="mt-1 text-sm text-slate-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
          <PrimaryBtn onClick={() => { setShowNewProject(true); void loadRepos(); }}>
            <Plus className="h-4 w-4" /> New Project
          </PrimaryBtn>
        </div>

        {flash && (
          <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />{flash}
          </div>
        )}

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
              <Rocket className="h-7 w-7 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">No projects yet</h2>
            <p className="text-sm text-slate-500 mb-7 max-w-xs">Import a GitHub repository to deploy your first project on onawie.io.</p>
            <PrimaryBtn onClick={() => { setShowNewProject(true); void loadRepos(); }}>
              <Plus className="h-4 w-4" /> New Project
            </PrimaryBtn>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} token={token!}
                onClick={() => { setSelectedProjectId(project.id); setActiveTab("deployments"); void loadDeployments(project.id); }} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, token, onClick }: { project: Project; token: string; onClick: () => void }) {
  const [latestDep, setLatestDep] = useState<Deployment | null>(null);
  const frameworkLabel = FRAMEWORKS.find((f) => f.value === (project.framework ?? ""))?.label ?? "Auto-detect";

  useEffect(() => {
    if (!token) return;
    backendRequest<{ deployments: Deployment[] }>(`/api/projects/${project.id}/deployments`, token)
      .then((r) => setLatestDep(r.deployments[0] ?? null))
      .catch(() => {});
  }, [project.id, token]);

  return (
    <button onClick={onClick}
      className="group text-left rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_28px_rgba(15,23,42,0.10)] hover:border-indigo-200 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
            <Orbit className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition">{project.name}</div>
            <div className="text-xs text-slate-500">{project.repoOwner}/{project.repoName}</div>
          </div>
        </div>
        {latestDep ? <StatusBadge status={latestDep.status} /> : <span className="text-xs text-slate-400">No deploys</span>}
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> {project.branch}</span>
        {project.framework && <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 font-normal">{frameworkLabel}</Badge>}
        {!project.autoDeploy && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 font-normal">auto-deploy off</Badge>}
      </div>

      {latestDep && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {latestDep.commitMessage
            ? <span className="block truncate">{latestDep.commitMessage}</span>
            : <span className="font-mono">{latestDep.commitSha.slice(0, 7)}</span>}
          <span className="text-slate-400 ml-1">{formatRelativeTime(latestDep.createdAt)}</span>
        </div>
      )}
    </button>
  );
}
