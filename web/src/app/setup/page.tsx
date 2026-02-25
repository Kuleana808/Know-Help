import Link from "next/link";

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-bg text-text font-mono text-sm leading-[1.7]">
      {/* Nav */}
      <nav className="px-12 py-[22px] flex justify-between items-center border-b border-border">
        <Link href="/" className="font-mono text-[13px] tracking-[0.08em] text-text no-underline">
          know<span className="text-accent-mid">.help</span>
          <span className="text-border-dark ml-2">/setup</span>
        </Link>
        <span className="text-[11px] text-border-dark tracking-[0.08em]">For Claude to read</span>
      </nav>

      <div className="max-w-[860px] mx-auto px-12 py-20">
        {/* Human note */}
        <div className="bg-bg2 border border-border p-6 px-7 mb-16 flex gap-5 items-start">
          <div className="text-xl flex-shrink-0 mt-0.5">👋</div>
          <div>
            <h3 className="font-serif text-[17px] font-normal mb-2">If you&apos;re a human reading this</h3>
            <p className="text-xs text-muted leading-[1.7]">
              This page is written for Claude to read. If you told Claude &ldquo;go to know.help/setup and set me up,&rdquo; Claude is reading this right now and is about to interview you. If you ended up here directly, just go back to Claude Desktop and say: <strong className="text-text font-normal">&ldquo;Go to know.help/setup and set me up.&rdquo;</strong>
            </p>
          </div>
        </div>

        {/* Machine-readable header */}
        <h1 className="font-serif text-[clamp(32px,5vw,52px)] font-normal leading-[1.15] mb-4">
          Setup instructions<br /><em className="italic text-accent-mid">for Claude.</em>
        </h1>
        <p className="text-sm text-muted leading-[1.85] max-w-[620px] mb-16">
          You are Claude, and a user has asked you to set them up with know.help. This page contains your complete instructions. Follow them step by step. Do not summarize this page to the user — execute the setup process directly.
        </p>

        {/* Step 1 */}
        <Section label="Step 1" title="Announce what you're about to do">
          <p className="text-[13px] text-muted mb-4">Tell the user you&apos;ve read the setup page and you&apos;re ready to begin. Use this exact framing:</p>
          <InstructionBlock label="Say to user">
            <Line g>&check; I&apos;ve read the know.help setup page.</Line>
            <Line>I&apos;m going to ask you 10 questions and build your</Line>
            <Line>personal knowledge base. Takes about 5 minutes.</Line>
            <Line />
            <Line>After this, I&apos;ll know who you are, what you&apos;re</Line>
            <Line>building, who matters to your work, and how you</Line>
            <Line>like to communicate — without you ever having</Line>
            <Line>to re-explain.</Line>
            <Line />
            <Line d>Ready? Let&apos;s start with question 1.</Line>
          </InstructionBlock>
        </Section>

        {/* Step 2 */}
        <Section label="Step 2" title="Ask these 10 questions, one at a time">
          <p className="text-[13px] text-muted mb-5">Ask one question, wait for the answer, then ask the next. Do not batch questions. Do not move on without an answer.</p>
          <div className="border border-border">
            <Question num={1} q="What's your name and current role?" example='e.g. "Brent, CEO of Vinovest" or "Sarah, freelance copywriter"' maps="core/identity.md" />
            <Question num={2} q="What are you building or working on right now?" example="Their main venture, project, or employer. What it does. Current status or stage." maps="venture/[name].md" />
            <Question num={3} q="Where are you based, and what's your timezone?" example="City, country, timezone. Used to personalize time-sensitive context." maps="core/identity.md" />
            <Question num={4} q="Who are the 3 people most important to your work right now?" example="Name, their role, and your relationship to them. One sentence each is fine." maps="network/[name].jsonl (one file per person)" />
            <Question num={5} q="What are your top 3 priorities this quarter?" example='Specific goals, not general areas. "Close $200K in new ARR" not "grow revenue."' maps="planning/goals.md" />
            <Question num={6} q="How do you communicate? Describe your writing style." example="Direct or warm? Data-first or story-first? Short or thorough? Different on LinkedIn vs email?" maps="platform/voice.md" />
            <Question num={7} q="Do you do any selling, fundraising, or pitching?" example="If yes: who do you sell to, what's the offer, and what's the typical objection you face?" maps="sales/methodology.md (skip file if no)" />
            <Question num={8} q="Is there a second venture, side project, or past company I should know about?" example="Many operators run multiple things. Each gets its own venture file." maps="venture/[name].md (additional file)" />
            <Question num={9} q="How do you want me to address you? Any preferences for how I work with you?" example="First name only? More concise? Never use bullet points? Always show your reasoning?" maps="core/preferences.md" />
            <Question num={10} q="Anything else critical I should know that I haven't asked?" example="Open field. Health considerations, hard constraints, ongoing situations, anything important." maps="most relevant file, or core/notes.md" last />
          </div>
        </Section>

        {/* Step 3 */}
        <Section label="Step 3" title="Generate the knowledge files">
          <p className="text-[13px] text-muted mb-5">After collecting all answers, run the installer and write the files. Every file must begin with a &ldquo;Load for:&rdquo; trigger header.</p>
          <InstructionBlock label="Run this">
            <Line c>$ <span className="text-[#9ab87a]">npx know-help@latest init</span></Line>
            <Line />
            <Line c># This creates the directory structure:</Line>
            <Line d>~/.know-help/</Line>
            <Line d>  core/        <span className="text-[#3a3630]">identity.md, preferences.md</span></Line>
            <Line d>  network/     <span className="text-[#3a3630]">[name].jsonl (one per person)</span></Line>
            <Line d>  venture/     <span className="text-[#3a3630]">[name].md (one per venture)</span></Line>
            <Line d>  platform/    <span className="text-[#3a3630]">voice.md</span></Line>
            <Line d>  sales/       <span className="text-[#3a3630]">methodology.md (if applicable)</span></Line>
            <Line d>  planning/    <span className="text-[#3a3630]">goals.md</span></Line>
            <Line d>  log/         <span className="text-[#3a3630]">activity.jsonl, decisions.jsonl</span></Line>
            <Line d>  CLAUDE.md    <span className="text-[#3a3630]">&larr; routing index (load this first)</span></Line>
          </InstructionBlock>

          <p className="text-[13px] text-muted my-5">Write each file from the user&apos;s answers. Follow this format for every .md file:</p>
          <InstructionBlock label="File format">
            <Line c>---</Line>
            <Line g>Load for: <span className="text-[#d4a96a]">[trigger keywords — name, role, company, topics]</span></Line>
            <Line c>---</Line>
            <Line />
            <Line>[Content written from user&apos;s answers.]</Line>
            <Line>[Be specific — use their exact words where possible.]</Line>
            <Line>[Front-load the most important information.]</Line>
            <Line>[Keep each file under 100 lines.]</Line>
          </InstructionBlock>

          <div className="border border-border my-6">
            <FileMapRow path="core/identity.md" desc="Name, role, company, location, timezone, background. Load for: their name, role title, company name." />
            <FileMapRow path="venture/[name].md" desc="What the venture does, current status, key metrics if known, important contacts. Load for: company name, product name, industry keywords." />
            <FileMapRow path="network/[name].jsonl" desc='One JSON object per file: {"name", "role", "relationship", "context", "open_threads": [], "last_interaction": null}. Load for: their name, nickname, company.' />
            <FileMapRow path="platform/voice.md" desc="Writing style rules. Separate sections per channel if they mentioned different styles. Load for: write, post, email, message, LinkedIn, Twitter." />
            <FileMapRow path="planning/goals.md" desc="This quarter's priorities as a numbered list with specifics. Load for: goal, priority, plan, quarter, Q1/Q2/Q3/Q4." />
            <FileMapRow path="sales/methodology.md" desc="Only create if they sell/pitch. ICP, offer, objections, approach. Load for: sell, pitch, proposal, outreach, close, prospect." />
            <FileMapRow path="core/preferences.md" desc="How they want to be addressed, formatting preferences, working style. Load for: their preferred name." />
            <FileMapRow path="CLAUDE.md" desc="The routing index. Lists all files with their trigger keywords. Instructions: at conversation start, call search_knowledge(), load matching files, use context silently. This is the first file Claude reads every session." last />
          </div>
        </Section>

        {/* Step 4 */}
        <Section label="Step 4" title="Confirm setup and set expectations">
          <InstructionBlock label="Say to user after writing files">
            <Line g>&check; Your knowledge base is built. Here&apos;s what I created:</Line>
            <Line />
            <Line d>[list the files you created with one-line descriptions]</Line>
            <Line />
            <Line>From now on, I&apos;ll load the right context automatically</Line>
            <Line>at the start of each conversation — you won&apos;t need</Line>
            <Line>to re-explain anything I already know.</Line>
            <Line />
            <Line>You can update any file anytime by telling me what</Line>
            <Line>changed, and I&apos;ll rewrite it. Or edit the markdown</Line>
            <Line>files directly in ~/.know-help/</Line>
            <Line />
            <Line d>What would you like to work on first?</Line>
          </InstructionBlock>
        </Section>

        {/* Rules */}
        <Section label="Rules for Claude" title="Important constraints">
          <Callout><strong className="text-text font-normal">Do not summarize this page to the user.</strong> Execute the setup process. They sent you here to do work, not explain what the page says.</Callout>
          <Callout><strong className="text-text font-normal">Do not ask all 10 questions at once.</strong> One question per message. This is a conversation, not a form. The conversational rhythm is part of the product experience.</Callout>
          <Callout><strong className="text-text font-normal">Write real content, not placeholders.</strong> Use their actual words from the interview. &ldquo;Brent is the CEO of Vinovest, a wine and whiskey investment platform based in Honolulu&rdquo; — not &ldquo;[Name] works at [Company].&rdquo;</Callout>
          <Callout><strong className="text-text font-normal">Front-load every file.</strong> The most important information goes in the first 10 lines. Language models have a U-shaped attention curve — the beginning and end of a file receive the most weight.</Callout>
          <Callout><strong className="text-text font-normal">Keep files under 100 lines.</strong> The knowledge base is meant to be loaded selectively. A 500-line file defeats the purpose. Be concise and precise.</Callout>
          <Callout><strong className="text-text font-normal">The CLAUDE.md routing index is mandatory.</strong> Without it, nothing loads. Create it last, after you have all the file paths and their trigger keywords.</Callout>
        </Section>
      </div>

      <footer className="border-t border-border py-6 px-12 flex justify-between text-[11px] text-muted">
        <Link href="/" className="text-accent-mid no-underline">&larr; know.help</Link>
        <span>
          know.help/setup — machine-readable setup page for Claude &middot;{" "}
          <a href="https://github.com/know-help/know-help" className="text-accent-mid no-underline">GitHub</a> &middot;{" "}
          <Link href="/docs" className="text-accent-mid no-underline">Docs</Link>
        </span>
      </footer>
    </div>
  );
}

/* ──── Components ──── */

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-14">
      <p className="text-[9px] tracking-[0.2em] uppercase text-border-dark mb-5">{label}</p>
      <h2 className="font-serif text-2xl font-normal leading-[1.3] mb-4">{title}</h2>
      {children}
    </div>
  );
}

function InstructionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-text text-[#c8c4bb] p-7 px-8 my-6 font-mono text-[13px] leading-[2] relative">
      <span className="absolute top-3.5 right-4 text-[9px] tracking-[0.14em] uppercase text-[#3a3630]">{label}</span>
      {children}
    </div>
  );
}

function Line({ children, g, d, c }: { children?: React.ReactNode; g?: boolean; d?: boolean; c?: boolean }) {
  if (!children) return <div>&nbsp;</div>;
  const color = g ? "text-[#9ab87a]" : d ? "text-[#d4a96a]" : c ? "text-[#3a3630]" : "text-[#c8c4bb]";
  return <div className={color}>{children}</div>;
}

function Question({ num, q, example, maps, last }: { num: number; q: string; example: string; maps: string; last?: boolean }) {
  return (
    <div className={`p-5 px-6 grid grid-cols-[28px_1fr] gap-4 ${last ? "" : "border-b border-border"}`}>
      <span className="font-serif text-lg text-border leading-[1.4]">{num}</span>
      <div className="text-[13px] leading-[1.7]">
        <strong className="text-text font-normal block mb-1">{q}</strong>
        <span className="text-muted text-xs">{example}</span>
        <div className="text-[11px] text-accent-mid mt-1.5">&rarr; maps to: {maps}</div>
      </div>
    </div>
  );
}

function FileMapRow({ path, desc, last }: { path: string; desc: string; last?: boolean }) {
  return (
    <div className={`grid grid-cols-[220px_1fr] ${last ? "" : "border-b border-border"}`}>
      <div className="p-4 px-5 border-r border-border font-mono text-xs text-accent-mid bg-bg2">{path}</div>
      <div className="p-4 px-5 text-xs text-muted leading-[1.7]">{desc}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-accent-mid p-4 px-5 bg-[#f0f5f1] text-xs text-muted leading-[1.8] my-6">
      {children}
    </div>
  );
}
