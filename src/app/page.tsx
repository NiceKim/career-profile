'use client';

import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  Check,
  Compass,
  FileText,
  GitBranch,
  GitFork,
  Layers3,
  Moon,
  Sparkles,
  Sun,
  Target,
} from 'lucide-react';

const features = [
  {
    icon: Layers3,
    title: 'One career source of truth',
    description: 'Store experiences, skills, projects, and achievements as reusable career objects.',
  },
  {
    icon: GitBranch,
    title: 'Version like a developer',
    description: 'Edit, save, compare, and fork resume versions without duplicated documents.',
  },
  {
    icon: Target,
    title: 'Tailor every application',
    description: 'Match your strongest career evidence to each role and job description.',
  },
  {
    icon: BrainCircuit,
    title: 'Ask your career data',
    description: 'Get AI-powered answers about your strengths, gaps, and next best moves.',
  },
];

export default function Page() {
  const [dark, setDark] = useState(false);

  return (
    <main className={`min-h-screen ${dark ? 'dark bg-background text-foreground' : 'bg-background text-foreground'}`}>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(46,160,67,0.12),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(46,160,67,0.18),transparent_62%)]" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-[#2da44e] text-white shadow-sm shadow-[#2da44e]/20">
              <GitFork aria-hidden="true" className="size-4" />
            </span>
            <span>footprint</span>
          </a>
          <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#features">Features</a>
            <a className="transition-colors hover:text-foreground" href="#how-it-works">How it works</a>
            <a className="transition-colors hover:text-foreground" href="#ai">AI for your career</a>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(!dark)} className="grid size-9 place-items-center self-auto rounded-md border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <a href="/login" className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Log in</a>
            <a href="/signup" className="rounded-md bg-[#2da44e] px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#278a43]">Sign up</a>
          </div>
        </nav>

        <section id="top" className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2da44e]/25 bg-[#2da44e]/8 px-3 py-1.5 text-xs font-medium text-[#2da44e]">
              <Sparkles className="size-3.5" />
              Your career, versioned
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[4.5rem]">Build a career that compounds.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Keep your entire career history in one living footprint. Reuse what you have built, tailor it to what is next, and move forward with clarity.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/signup" className="inline-flex items-center justify-center gap-2 rounded-md bg-[#2da44e] px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#278a43] hover:shadow-md">Start building free <ArrowRight className="size-4" /></a>
              <a href="#how-it-works" className="inline-flex items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-medium transition-colors hover:bg-muted">See how it works</a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">No credit card required · Your data stays yours</p>
          </div>

          <div className="relative mx-auto w-full max-w-[490px] lg:ml-auto">
            <div className="rounded-xl border border-border bg-card p-3 shadow-2xl shadow-black/8 dark:shadow-black/30">
              <div className="flex items-center justify-between border-b border-border px-3 pb-3">
                <div className="flex items-center gap-2 text-xs font-medium"><span className="size-2 rounded-full bg-[#2da44e]" /> career-footprint</div>
                <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">main</span>
              </div>
              <div className="grid grid-cols-[30px_1fr] gap-3 px-3 pt-4">
                <div className="relative flex flex-col items-center"><div className="z-10 grid size-7 place-items-center rounded-full border border-[#2da44e]/40 bg-[#2da44e]/12 text-[#2da44e]"><GitBranch className="size-3.5" /></div><div className="absolute top-7 h-[190px] w-px bg-border" /></div>
                <div className="flex flex-col gap-3 pb-2">
                  {[['Senior product engineer', 'experience', '2m ago'], ['Launch analytics platform', 'project', '5d ago'], ['Led team of 6 engineers', 'achievement', '1w ago']].map(([title, type, time], index) => (
                    <div key={title} className="rounded-lg border border-border bg-background p-3 transition-colors hover:border-[#2da44e]/40">
                      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{title}</p><p className="mt-1 font-mono text-[10px] text-[#2da44e]">{type}</p></div><span className="text-[10px] text-muted-foreground">{time}</span></div>
                      {index === 0 && <div className="mt-3 flex gap-1.5"><span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">Product</span><span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">Leadership</span></div>}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"><GitFork className="size-3.5 text-[#2da44e]" /> <span>Forked into</span> <span className="font-medium text-foreground">staff-plus-v2</span></div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg sm:flex"><div className="grid size-8 place-items-center rounded-md bg-[#2da44e]/12 text-[#2da44e]"><Check className="size-4" /></div><div><p className="text-xs font-medium">Role match found</p><p className="text-[10px] text-muted-foreground">94% relevant experience</p></div></div>
          </div>
        </section>
      </div>

      <section id="features" className="flex min-h-[560px] items-center border-y border-border bg-muted/35 px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl"><div className="max-w-2xl"><p className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-[#2da44e]">Everything in context</p><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stop rewriting your history.</h2><p className="mt-4 text-muted-foreground">A structured system for the work you have done and the work you want to do next.</p></div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">{features.map((feature) => { const Icon = feature.icon; return <article key={feature.title} className="bg-background p-6"><Icon className="size-5 text-[#2da44e]" /><h3 className="mt-12 text-sm font-semibold">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p></article> })}</div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border bg-background"><div><div className="mx-auto max-w-6xl px-5 pb-12 pt-20 sm:px-8 lg:px-10"><p className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-[#2da44e]">Your career system</p><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">One footprint.<br />Many directions.</h2><p className="mt-5 max-w-md leading-7 text-muted-foreground">Capture your full career history once, then use it as the foundation for the work you want to do next.</p></div><div className="relative mt-12"><article className="relative min-h-[520px] overflow-hidden border-y border-[#2da44e]/25 bg-[#eaf6ec] px-5 py-16 dark:bg-[#102416] sm:px-8 sm:py-24"><Layers3 aria-hidden="true" className="pointer-events-none absolute bottom-[-3rem] right-[-2rem] size-64 text-[#2da44e]/10 sm:size-80" /><p className="mt-4 font-mono text-xs text-[#2da44e]">01 · SOURCE OF TRUTH</p><h3 className="relative z-10 mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Career Profile</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Capture your complete career footprint: experiences, projects, skills, achievements, and the evidence behind them.</p></article><div className="relative z-10 flex h-0 justify-center text-[#2da44e]"><ArrowDown className="size-5 -translate-y-1/2" aria-hidden="true" /></div><div className="grid md:grid-cols-2"><article className="relative min-h-[520px] overflow-hidden border-b border-border bg-[#eef4ff] px-5 py-14 sm:px-8 sm:py-20 dark:bg-[#171f35]"><span className="font-mono text-xs text-[#2da44e]">02</span><FileText aria-hidden="true" className="pointer-events-none absolute bottom-[-3rem] right-[-2rem] size-64 text-[#2da44e]/10 sm:size-80" /><h3 className="relative z-10 mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">Resume Studio</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Refer to your profile, select the strongest evidence, and shape tailored resume versions for every opportunity.</p><div className="mt-5 flex items-center gap-2 text-xs font-medium text-[#2da44e]"><GitBranch className="size-3.5" /> Edit, save, and fork versions</div></article><article className="relative min-h-[520px] overflow-hidden border-b border-l-0 border-border bg-[#eef3f8] px-5 py-14 sm:border-l sm:px-8 sm:py-20 dark:bg-[#17202a]"><span className="font-mono text-xs text-[#2da44e]">03</span><Compass aria-hidden="true" className="pointer-events-none absolute bottom-[-3rem] right-[-2rem] size-64 text-[#2da44e]/10 sm:size-80" /><h3 className="relative z-10 mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">Career Guru</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Use your profile to uncover strengths, identify gaps, and decide what to build toward your desired future career.</p><div className="mt-5 flex items-center gap-2 text-xs font-medium text-[#2da44e]"><BrainCircuit className="size-3.5" /> Grow with AI-powered guidance</div></article></div></div></div></section>

      <section id="ai" className="flex min-h-[360px] items-center bg-[#17251a] px-5 py-24 text-white sm:px-8 lg:px-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-10 lg:flex-row lg:items-end"><div className="max-w-xl"><p className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-[#7ee787]">Your career copilot</p><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Make your next move with evidence.</h2><p className="mt-4 leading-7 text-white/65">Ask questions across your career history. Understand your strengths, find the gaps, and turn your experience into a clear next step.</p></div><a href="/signup" className="inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-[#2da44e] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3fb950] lg:self-auto">Explore your footprint <ArrowRight className="size-4" /></a></div></section>

      <footer className="mx-auto flex min-h-[120px] max-w-6xl flex-col gap-4 px-5 py-10 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div className="flex items-center gap-2 font-medium text-foreground"><span className="grid size-6 place-items-center rounded bg-[#2da44e] text-white"><GitFork className="size-3" /></span> footprint</div><div className="flex gap-5"><a href="#privacy" className="hover:text-foreground">Privacy</a><a href="#about" className="hover:text-foreground">About</a><a href="#contact" className="hover:text-foreground">Contact</a></div><p>© 2026 Footprint</p></footer>
    </main>
  );
}
