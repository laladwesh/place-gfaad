import { getServerSession } from "next-auth";
import {
  Activity,
  Bell,
  CheckCircle2,
  GitBranch,
  Leaf,
  Rocket,
  Send,
  Shield
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = ["Projects", "Deployments", "Usage", "Settings"];

const features = [
  {
    title: "Instant Rollbacks",
    description:
      "Broken build? Revert your entire production environment to any previous state in one click.",
    icon: Rocket,
    badgeClass: "bg-indigo-100 text-indigo-700"
  },
  {
    title: "Deep Observability",
    description:
      "Real-time metrics, logs, and distributed tracing are built-in from day one. No plugins required.",
    icon: Activity,
    badgeClass: "bg-orange-100 text-orange-700"
  },
  {
    title: "Military-Grade Security",
    description:
      "SOC2 Type II, GDPR, and HIPAA compliant. Automated secrets management and encrypted networking.",
    icon: Shield,
    badgeClass: "bg-violet-100 text-violet-700"
  }
];

const footerColumns = [
  {
    title: "Product",
    links: ["Features", "Integrations", "Pricing", "Changelog"]
  },
  {
    title: "Resources",
    links: ["Documentation", "API Reference", "Guides", "Community"]
  },
  {
    title: "Legal",
    links: ["Privacy Policy", "Terms of Service", "Cookie Policy", "Security"]
  }
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-5 md:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-800">
              onawie.io
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              {navItems.map((item, index) => (
                <Link
                  key={item}
                  href="#"
                  className={cn(
                    "text-sm font-medium text-slate-500 transition hover:text-slate-800",
                    index === 0 && "text-indigo-600 underline decoration-2 underline-offset-[18px]"
                  )}
                >
                  {item}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid h-8 w-8 place-content-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
            <Avatar className="h-8 w-8 border border-slate-200">
              <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
                NP
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-12 md:px-6 md:pt-20">
        <div className="grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="pr-0 lg:pr-6">
            <Badge className="mb-6 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700 hover:bg-indigo-100">
              Now In Public Beta
            </Badge>

            <h1 className="text-balance text-5xl font-bold leading-[0.95] tracking-tight text-slate-900 sm:text-6xl">
              Deploy at the
              <span className="title-accent mt-2 block">speed of light.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
              The next-generation platform for hyperscale deployments. Orchestrate
              clusters, monitor latency, and scale globally in milliseconds.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-11 rounded-xl bg-indigo-600 px-6 font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.28)] hover:bg-indigo-500"
              >
                <Link href="/api/auth/signin/github">
                  <GitBranch className="mr-2 h-4 w-4" />
                  Continue with GitHub
                </Link>
              </Button>

              <Button
                variant="secondary"
                size="lg"
                className="h-11 rounded-xl bg-slate-200 px-6 font-semibold text-slate-700 hover:bg-slate-300"
              >
                View Demo
              </Button>
            </div>

            <div className="mt-9 flex items-center gap-3">
              <div className="flex -space-x-2">
                {[
                  { initials: "AK", color: "bg-cyan-500" },
                  { initials: "TR", color: "bg-violet-500" },
                  { initials: "SJ", color: "bg-emerald-500" }
                ].map((member) => (
                  <Avatar key={member.initials} className="h-8 w-8 border-2 border-white">
                    <AvatarFallback className={cn("text-[10px] font-semibold text-white", member.color)}>
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <p className="text-sm font-medium text-slate-600">
                Joined by 10k+ developers worldwide
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_0.44fr]">
            <Card className="overflow-hidden border-slate-900/10 bg-[#0c1f33] p-0 shadow-[0_28px_55px_rgba(15,23,42,0.24)] sm:col-start-1 sm:row-start-1">
              <CardContent className="h-[280px] p-3 sm:h-[285px]">
                <div className="h-full rounded-2xl border border-cyan-100/10 bg-[#071624] p-4">
                  <div className="rounded-md border border-cyan-100/10 bg-[#0f2a43] px-3 py-1.5 text-[11px] text-cyan-100/90">
                    Global deployments
                  </div>
                  <div className="hero-chart-grid relative mt-4 h-[210px] overflow-hidden rounded-xl border border-cyan-100/10 bg-[#0b2032]">
                    <svg
                      viewBox="0 0 360 160"
                      className="absolute inset-0 h-full w-full"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#2dd4bf" />
                          <stop offset="50%" stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#818cf8" />
                        </linearGradient>
                      </defs>
                      <polyline
                        fill="none"
                        stroke="url(#lineGradient)"
                        strokeWidth="3"
                        points="0,88 44,82 92,104 136,74 188,92 232,60 278,74 324,54 360,68"
                      />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-[0_16px_32px_rgba(15,23,42,0.09)] sm:col-start-2 sm:row-start-1">
              <CardContent className="grid h-[112px] place-content-center p-4 text-center">
                <div className="mx-auto mb-2 grid h-6 w-6 place-content-center rounded-full bg-indigo-100 text-indigo-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <p className="text-3xl font-bold leading-none tracking-tight text-slate-900">99.9%</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Uptime
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-900/10 bg-[#10161f] shadow-[0_20px_38px_rgba(2,8,23,0.32)] sm:col-start-1 sm:row-start-2">
              <CardContent className="h-[178px] p-4 font-mono text-sm leading-6 text-slate-300">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <p className="text-indigo-300">nexus deploy --prod</p>
                <p>{">"} Analyzing cluster health...</p>
                <p className="text-emerald-400">{">"} Success! Deployed to 12 regions.</p>
                <p>{">"} Latency: 14ms global avg.</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-none bg-gradient-to-b from-[#0f9d93] to-[#0c7f77] shadow-[0_20px_42px_rgba(15,118,110,0.28)] sm:col-start-2 sm:row-start-2">
              <CardContent className="grid h-[178px] place-content-center p-3">
                <div className="absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 bg-white/5" />
                <div className="grid h-24 w-24 place-content-center rounded-full border border-teal-200/30 bg-teal-50/90 shadow-inner shadow-teal-300/40">
                  <Leaf className="h-10 w-10 text-teal-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1180px] px-5 py-10 md:px-6 md:py-16">
        <div className="relative rounded-3xl px-0 pb-4 pt-12 text-center">
          <div className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-5 rounded-full border border-slate-200 bg-white px-5 py-2 shadow-sm">
            <div className="text-center text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              System Nominal
            </div>
            <div className="text-center text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Active Clusters
              <p className="mt-0.5 text-sm font-bold text-indigo-600">2,482</p>
            </div>
            <div className="text-center text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Avg Latency
              <p className="mt-0.5 text-sm font-bold text-rose-500">14.2ms</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold tracking-tight text-slate-900">
            Engineered for Reliability
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Stop worrying about infrastructure. onawie.io handles the heavy lifting so
            you can focus on building.
          </p>

          <div className="mt-11 grid gap-5 text-left md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="border-slate-200/90 bg-white/80 shadow-[0_14px_28px_rgba(15,23,42,0.05)]"
                >
                  <CardHeader className="pb-3">
                    <div className={cn("mb-4 inline-flex h-8 w-8 items-center justify-center rounded-md", feature.badgeClass)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-xl leading-tight">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-7 text-slate-600">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1180px] px-5 pb-24 pt-14 md:px-6">
        <Card className="overflow-hidden rounded-[24px] border-none bg-gradient-to-r from-[#3d32d8] via-[#4b3de4] to-[#5b4ef0] text-white shadow-[0_30px_70px_rgba(79,70,229,0.3)]">
          <CardContent className="px-6 py-16 text-center sm:px-12">
            <h3 className="text-balance text-5xl font-bold tracking-tight">
              Ready to scale without limits?
            </h3>
            <p className="mx-auto mt-5 max-w-xl text-lg text-indigo-100/95">
              Join the high-performance revolution. Get started with $100 in free
              credits today.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                className="h-11 rounded-lg bg-white px-7 font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                Start Free Trial
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-lg border border-white/30 bg-transparent px-7 font-semibold text-white hover:bg-white/10"
              >
                Contact Sales
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-slate-200/80 bg-[#f4f5f7]">
        <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 py-14 md:grid-cols-[1.35fr_2fr] md:px-6">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-slate-800">onawie.io</p>
            <p className="mt-4 max-w-sm text-base leading-7 text-slate-600">
              The modern standard for cloud native infrastructure. Built by engineers,
              for engineers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  {column.links.map((link) => (
                    <li key={link}>
                      <Link href="#" className="transition hover:text-slate-900">
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between border-t border-slate-200/80 px-5 py-5 text-xs text-slate-500 md:px-6">
          <p>© 2025 onawie.io. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="#" aria-label="Twitter" className="transition hover:text-slate-800">
              <Send className="h-4 w-4" />
            </Link>
            <Link href="#" aria-label="GitHub" className="transition hover:text-slate-800">
              <GitBranch className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
