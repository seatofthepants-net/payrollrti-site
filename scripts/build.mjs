#!/usr/bin/env node
// Builds the static site into dist/ from src/ and data/. No dependencies.
//   node scripts/build.mjs
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DATA = join(ROOT, "data");
const DIST = join(ROOT, "dist");

const SITE = "https://payrollrti.uk";
const REPO = "https://github.com/seatofthepants-net/payrollrti";
const LATEST_FALLBACK = `${REPO}/releases/latest`;
const HMRC_HELP = "https://www.gov.uk/government/publications/basic-paye-tools-service-availability-and-issues/basic-paye-service-availability-and-issues";
const HMRC_BPT = "https://www.gov.uk/basic-paye-tools";
const SOTP = "https://seatofthepants.net";
const APPLE_THREAD = "https://discussions.apple.com/thread/256362758";

const readJSON = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const releases = readJSON("releases.json");
const prereleases = readJSON("prereleases.json");
const stats = readJSON("stats.json");
const faq = readJSON("faq.json");
const csv = readFileSync(join(DATA, "downloads.csv"), "utf8");

const latest = releases[0] || null;
const version = latest?.version || null;
const downloadUrl = latest?.dmg?.url || LATEST_FALLBACK;
const releaseUrl = latest?.html_url || LATEST_FALLBACK;
const today = new Date().toISOString().slice(0, 10);

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const stripTags = (s) => s.replace(/<[^>]+>/g, "");
const fmt = (n) => n.toLocaleString("en-GB");
const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

function friendlyCount(n) {
  if (!n || n < 100) return null;
  const step = n >= 1000 ? 100 : 10;
  return `over ${fmt(Math.floor(n / step) * step)}`;
}
const countText = friendlyCount(stats.total);

function inline(md) {
  let s = esc(md);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:)])/g, '$1<a href="$2">$2</a>');
  return s;
}
// GitHub's "Full changelog" line links to the commit diff, which means nothing to someone running payroll.
const withoutDiffLinks = (md) => String(md || "").split("\n").filter((line) => !/\/compare\/[^\s)]*\.\.\./.test(line)).join("\n");
// Small Markdown subset for GitHub release notes: headings, lists, paragraphs, links, bold, code.
function markdown(md) {
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`); list = null; } };
  for (const raw of String(md || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^\s*[-*+]\s+(.*)$/);
    if (!line.trim()) { flushPara(); flushList(); }
    else if (h) { flushPara(); flushList(); out.push(`<h3>${inline(h[1])}</h3>`); }
    else if (li) { flushPara(); (list ||= []).push(li[1]); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return out.join("\n");
}

// ---------- assets ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
// styles.css pulls in tokens.css and base.css with @import; inline them so the page loads one hashed file.
const inlineImports = (file) => readFileSync(file, "utf8").replace(/@import url\("\.\/([\w-]+\.css)"\);\n?/g, (_, name) => inlineImports(join(SRC, name)) + "\n");
const css = inlineImports(join(SRC, "styles.css"));
const cssName = `styles.${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`;
writeFileSync(join(DIST, cssName), css);
cpSync(join(SRC, "fonts"), join(DIST, "fonts"), { recursive: true });
cpSync(join(SRC, "images"), join(DIST, "images"), { recursive: true });
cpSync(join(SRC, "favicon.svg"), join(DIST, "favicon.svg"));
cpSync(join(SRC, "images", "apple-touch-icon.png"), join(DIST, "apple-touch-icon.png"));
cpSync(join(SRC, "_headers"), join(DIST, "_headers"));

// ---------- shared parts ----------
const ICON_DOWNLOAD = `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>`;

function head({ title, description, path, extra = "", noindex = false }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-snippet:-1, max-image-preview:large"}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PayrollRTI">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/images/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="HMRC’s Basic PAYE Tools running in its own Mac window">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0D352C">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/rethink-sans-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/public-sans-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/${cssName}">
<link rel="alternate" type="text/markdown" href="/llms.txt" title="Summary for AI assistants">
${extra}</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
`;
}

function header(current, anchors) {
  const item = (href, label) => `<li><a href="${href}"${current === href ? ' aria-current="page"' : ""}>${label}</a></li>`;
  return `<header class="site-header">
<div class="wrap">
<a class="brand" href="/"><span class="brand-mark" aria-hidden="true">£</span>PayrollRTI</a>
<nav class="nav" aria-label="Main">
<ul>
${anchors ? anchors.map(([href, label]) => item(href, label)).join("\n") : item("/", "Home")}
${item("/releases/", "Release notes")}
${item(REPO, "GitHub")}
</ul>
</nav>
</div>
</header>
`;
}

const footer = `<footer class="site-footer">
<div class="wrap">
<div class="about">
<p class="name">PayrollRTI</p>
<p>Made by <a href="${SOTP}">seatofthepants.net</a>. Free and open source under the MIT licence.</p>
<p>This site uses no cookies and no tracking.</p>
<p class="small">PayrollRTI is not made, endorsed or supported by HMRC. Basic PAYE Tools is HMRC’s software.</p>
</div>
<ul>
<li><a href="${REPO}">Source code on GitHub</a></li>
<li><a href="/releases/">Release notes</a></li>
<li><a href="${REPO}/issues">Report a problem</a></li>
<li><a href="${HMRC_BPT}">Get Basic PAYE Tools from GOV.UK</a></li>
</ul>
</div>
</footer>
</body>
</html>
`;

function picture(stem, widths, alt, sizes, attrs = "") {
  const [w1, w2] = widths;
  const dims = { "basic-paye-tools-on-mac": [2000, 1297], starting: [1200, 396], "bpt-not-installed": [1200, 509], "dmg-window": [1200, 796], "choose-engine": [1600, 1216] }[stem];
  const srcset = (ext) => `/images/${stem}-${w1}.${ext} ${w1}w, /images/${stem}-${w2}.${ext} ${w2}w`;
  const avif = existsSync(join(SRC, "images", `${stem}-${w1}.avif`)) ? `<source type="image/avif" srcset="${srcset("avif")}" sizes="${sizes}">` : "";
  return `<picture>${avif}<source type="image/webp" srcset="${srcset("webp")}" sizes="${sizes}"><img src="/images/${stem}-${w1}.webp" width="${dims[0]}" height="${dims[1]}" alt="${esc(alt)}" ${attrs}></picture>`;
}

// ---------- home ----------
const metaList = (items) => items.filter(Boolean).map((item) => `<li>${item}</li>`).join("");
const heroFacts = metaList(["Free and open source", "macOS Sequoia, Tahoe, Golden Gate and later", "Apple silicon and Intel", version ? `Version ${esc(version)}` : null]);
const ctaMeta = metaList([countText ? `Downloaded ${countText} times` : null, version ? `Version ${esc(version)}` : null, `<a href="/releases/">What’s new</a>`]);

const renderFaq = (list) => list.map((f) => `<details${f.open ? " open" : ""}>
<summary>${esc(f.q)}<span class="plus" aria-hidden="true">+</span></summary>
<p class="answer">${f.a}</p>
</details>`).join("\n");
const faqJsonld = (list) => ({ "@type": "FAQPage", mainEntity: list.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripTags(f.a) } })) });
const jsonldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>\n`;

// The newest pre-release, offered on /beta/ only while it's newer than the latest release.
const beta = prereleases[0] || null;
const betaIsCurrent = Boolean(beta && (!latest || beta.published_at > latest.published_at));
const betaDownloadUrl = beta?.dmg?.url || beta?.html_url || `${REPO}/releases`;
const betaNotesUrl = beta?.html_url || `${REPO}/releases`;

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "PayrollRTI",
      description: "Free, open-source macOS app that runs HMRC Basic PAYE Tools on macOS Sequoia (15), Tahoe (26) and Golden Gate (27) without Terminal commands, and on Apple silicon without Rosetta, ready for macOS 28, by running HMRC's Linux version natively.",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Payroll",
      operatingSystem: "macOS 15 or later",
      processorRequirements: "Apple silicon or Intel",
      ...(version ? { softwareVersion: version } : {}),
      downloadUrl,
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
      author: { "@type": "Organization", name: "seatofthepants.net Ltd", url: SOTP },
      codeRepository: REPO,
      screenshot: `${SITE}/images/basic-paye-tools-on-mac-2000.webp`,
      url: `${SITE}/`,
    },
    faqJsonld(faq),
  ],
};

const home = head({
  title: "Run Basic PAYE Tools on a Mac without Terminal or Rosetta | PayrollRTI",
  description: "Basic PAYE Tools not opening on your Mac? PayrollRTI is a free app that runs HMRC’s Basic PAYE Tools on macOS Sequoia, Tahoe and Golden Gate with a double-click, and on Apple silicon without Rosetta, ready for macOS 28. No Terminal. Free and open source.",
  path: "/",
  extra: jsonldScript(jsonld),
}) + header("/", [["#engines", "Two ways to run it"], ["#care", "Your payroll data"], ["#install", "How to install"], ["#faq", "Questions"]]) + `<main id="main">

<section class="hero" aria-labelledby="hero-title">
<div class="wrap">
<div class="app-icon" aria-hidden="true">£</div>
<h1 id="hero-title">Keep Basic PAYE Tools working on your Mac.</h1>
<p class="lede">PayrollRTI opens HMRC’s payroll software with a double-click, and runs it without Rosetta, ready for macOS 28.</p>
<div class="actions">
<a class="btn btn-gold" href="${esc(downloadUrl)}">${ICON_DOWNLOAD}Download for Mac</a>
<a class="btn btn-ghost" href="${esc(releaseUrl)}">Get it from GitHub Releases</a>
</div>
<ul class="meta">${heroFacts}</ul>
<div class="hero-shot">${picture("basic-paye-tools-on-mac", [1000, 2000], "HMRC’s Basic PAYE Tools home page open in its own Mac window, run by PayrollRTI", "(max-width: 1120px) 100vw, 1080px", 'fetchpriority="high"')}</div>
</div>
</section>

<div class="notice"><p>PayrollRTI is a free community tool. It is not made or endorsed by HMRC. Basic PAYE Tools itself is HMRC’s software.</p></div>

<section class="section" aria-labelledby="problem-title">
<div class="wrap split">
<div class="copy">
<h2 class="h2" id="problem-title">Two things stop Basic PAYE Tools working on a Mac</h2>
<p>Basic PAYE Tools (BPT) is HMRC’s free payroll software for employers with fewer than 10 employees. You use it to send your payroll to HMRC each time you pay your staff, under Real Time Information (RTI).</p>
<p><strong>It no longer opens by itself.</strong> Since macOS Sequoia, BPT’s background service doesn’t start. HMRC’s fix is to type commands into the Terminal app every time you run payroll.</p>
<p><strong>Rosetta is going.</strong> HMRC’s Mac app is built for Intel Macs, so on Apple silicon it runs through Rosetta. Apple say macOS 27 Golden Gate is the last version with full Rosetta.</p>
<p><a href="${HMRC_HELP}">Read HMRC’s help page about this issue</a></p>
</div>
<div class="compare">
<div class="card-dark">
<p class="label">HMRC’s workaround</p>
<ol>
<li>Open the Terminal app</li>
<li>Type in a set of commands</li>
<li>Keep the Terminal window open while you do payroll</li>
<li>Press Ctrl+C when you have finished</li>
</ol>
</div>
<div class="card-light">
<div class="app-icon" aria-hidden="true">£</div>
<div>
<p class="big">Double-click PayrollRTI. That’s it.</p>
</div>
</div>
</div>
</div>
</section>

<section class="section section-alt" id="said" aria-labelledby="said-title">
<div class="wrap">
<h2 class="h2" id="said-title">From people running payroll on a Mac</h2>
<p class="sub">About PayrollRTI 0.1, from the <a href="${APPLE_THREAD}">Apple Support Communities thread</a> on Basic PAYE Tools not opening.</p>
<div class="quotes">
<figure class="quote">
<blockquote cite="${APPLE_THREAD}?answerId=262184279022#262184279022"><p>“The software is amazing, thank you for providing it. The HMRC suggestion worked but was a bit clunky. The PAYE Tools software now loads faster than ever before.”</p></blockquote>
<figcaption>A Mac user, October 2026. <a href="${APPLE_THREAD}?answerId=262184279022#262184279022">Read the reply</a></figcaption>
</figure>
<figure class="quote">
<blockquote cite="${APPLE_THREAD}?answerId=262184218022#262184218022"><p>“This is perfect! Why doesn’t HMRC tell us about this working app?”</p></blockquote>
<figcaption>The person who started the thread, October 2026. <a href="${APPLE_THREAD}?answerId=262184218022#262184218022">Read the reply</a></figcaption>
</figure>
</div>
</div>
</section>

<section class="section" id="macos" aria-labelledby="macos-title">
<div class="wrap narrow">
<h2 class="h2" id="macos-title">Basic PAYE Tools on each version of macOS</h2>
<p class="sub">What happens to HMRC’s Mac app on an Apple silicon Mac, and what PayrollRTI does about it.</p>
<div class="table-wrap"><table class="mac-table">
<caption>Basic PAYE Tools by macOS version</caption>
<thead><tr><th scope="col">macOS</th><th scope="col">HMRC’s Mac app on its own</th><th scope="col">With PayrollRTI</th></tr></thead>
<tbody>
<tr><th scope="row">14 Sonoma and earlier</th><td>Opens normally</td><td>Optional: one click from the menu bar, backup when you quit</td></tr>
<tr><th scope="row">15 Sequoia and 26 Tahoe</th><td>Won’t open without HMRC’s Terminal workaround</td><td>Opens with a double-click</td></tr>
<tr><th scope="row">27 Golden Gate</th><td>Won’t open without the workaround. The last macOS with full Rosetta</td><td>Opens with a double-click, through Rosetta or without it</td></tr>
<tr><th scope="row">28, due in 2027</th><td>Apple say Intel apps will stop running, apart from some older games</td><td>Runs HMRC’s Linux version natively, with no Rosetta</td></tr>
</tbody>
</table></div>
<p class="table-note">Intel Macs don’t use Rosetta, and macOS 26 Tahoe is the last version for them, so HMRC’s Mac app keeps working there.</p>
</div>
</section>

<section class="section section-alt" id="engines" aria-labelledby="engines-title">
<div class="wrap">
<h2 class="h2 center" id="engines-title">Two ways to run Basic PAYE Tools</h2>
<p class="sub center">Both run HMRC’s own Basic PAYE Tools on the same payroll data. Choose when you first open PayrollRTI, and change it later in Settings.</p>
<figure class="engine-shot">${picture("choose-engine", [800, 1600], "PayrollRTI asking how to run Basic PAYE Tools: HMRC’s Linux version, run by PayrollRTI, recommended for Apple silicon Macs, or HMRC’s Mac app, which runs through Rosetta", "(max-width: 1000px) 100vw, 960px", 'loading="lazy"')}</figure>
<div class="engines">
<article class="engine recommended" aria-labelledby="engine-linux">
<h3 id="engine-linux">HMRC’s Linux version, run by PayrollRTI</h3>
<p class="engine-for">Recommended for Apple silicon Macs</p>
<ul>
<li>Built to keep working without Rosetta, which Apple will remove in macOS 28.</li>
<li>Nothing extra to install: no Rosetta, and no HMRC installer to run.</li>
<li>When HMRC release a new version, PayrollRTI downloads it for you.</li>
<li>Downloaded from GOV.UK and run unchanged: the same screens, calculations and submissions to HMRC.</li>
</ul>
<p class="engine-needs">Needs an Apple silicon Mac (M1 or later) and a download of about 190 MB from GOV.UK.</p>
</article>
<article class="engine" aria-labelledby="engine-mac">
<h3 id="engine-mac">HMRC’s Mac app</h3>
<p class="engine-for">For Intel Macs, or Apple silicon until Rosetta goes</p>
<ul>
<li>The Basic PAYE Tools you install from GOV.UK into your Applications folder.</li>
<li>On Apple silicon it runs through Rosetta, which PayrollRTI can install for you.</li>
<li>Apple will remove Rosetta after macOS 27, so on Apple silicon it has a limited life.</li>
<li>New versions come from HMRC’s installer, as they do now.</li>
</ul>
<p class="engine-needs">Works on Intel and Apple silicon Macs.</p>
</article>
</div>
</div>
</section>

<section class="section" id="care" aria-labelledby="care-title">
<div class="wrap narrow">
<h2 class="h2" id="care-title">Looking after your payroll data</h2>
<p class="sub">Running HMRC’s Linux version is new. Five habits keep your payroll safe, whichever way you run it.</p>
<ol class="care">
<li><strong>Back up before you start.</strong> In Basic PAYE Tools, choose Backup your data, and keep a copy off your Mac, on a USB stick or in cloud storage.</li>
<li><strong>PayrollRTI backs up too.</strong> Before it downloads the Linux version, and before any update that changes your data, it saves a backup in <code>~/HMRC/payetools-rti/backups</code>. You can always restore your data from these in Basic PAYE Tools.</li>
<li><strong>Updates only go forward.</strong> A newer Basic PAYE Tools updates your payroll data when it first starts, and older versions can’t open it afterwards. PayrollRTI checks first and won’t start a copy that’s too old.</li>
<li><strong>Match versions before you switch back.</strong> If the Linux version moves to a new release, install the same release of HMRC’s Mac app from GOV.UK before you switch to it.</li>
<li><strong>Run Basic PAYE Tools one way at a time.</strong> Don’t use HMRC’s Terminal workaround or another copy of Basic PAYE Tools while PayrollRTI is running it.</li>
</ol>
<div class="callout"><p><strong>If something looks wrong, stop and keep your backups.</strong> <a href="${REPO}/issues">Report it on GitHub</a>, and restore your last good backup in Basic PAYE Tools. For questions about your payroll itself, contact HMRC.</p></div>
</div>
</section>

<section class="section section-alt" id="install" aria-labelledby="install-title">
<div class="wrap">
<h2 class="h2 center" id="install-title">How to run Basic PAYE Tools on your Mac</h2>
<p class="sub center">It takes a few minutes, and you only do it once. PayrollRTI is signed and notarised by Apple.</p>
<ol class="steps">
<li class="step">
<div class="step-art" role="img" aria-label="The PayrollRTI download in your browser’s downloads list">
<div class="mock mock-dl">
<span class="t">Downloads</span>
<div class="mock-row">
<span class="mock-file"><span class="mini-icon">£</span></span>
<div class="grow"><div class="mock-name">PayrollRTI.dmg</div><div class="mock-bar"></div></div>
</div>
</div>
</div>
<div class="step-body">
<span class="step-num">1</span>
<h3>Download PayrollRTI</h3>
<p>Back up your payroll first. Then select the Download for Mac button. The file goes into your Downloads folder.</p>
</div>
</li>
<li class="step">
<div class="step-art">${picture("dmg-window", [600, 1200], "The PayrollRTI disk image window, with an arrow from the PayrollRTI icon to the Applications folder and the words Drag PayrollRTI into Applications", "260px", 'class="step-capture" loading="lazy"')}</div>
<div class="step-body">
<span class="step-num">2</span>
<h3>Drag it to Applications</h3>
<p>Open the file and drag PayrollRTI onto Applications. If you already have PayrollRTI, choose Replace.</p>
</div>
</li>
<li class="step">
<div class="step-art">${picture("choose-engine", [800, 1600], "PayrollRTI’s screen for choosing how to run Basic PAYE Tools", "256px", 'class="step-shot" loading="lazy"')}</div>
<div class="step-body">
<span class="step-num">3</span>
<h3>Choose how to run it</h3>
<p>Open PayrollRTI and pick HMRC’s Linux version, which it downloads from GOV.UK for you, or HMRC’s Mac app. From now on PayrollRTI updates itself.</p>
</div>
</li>
</ol>
</div>
</section>

<section class="section" id="faq" aria-labelledby="faq-title">
<div class="wrap narrow">
<h2 class="h2 center" id="faq-title">Common questions</h2>
<div class="faq">
${renderFaq(faq)}
</div>
</div>
</section>

<section class="cta" aria-labelledby="cta-title">
<div class="wrap">
<h2 class="h2" id="cta-title">Get back to running payroll</h2>
<p class="sub">Free to download. No account, no sign-up.</p>
<div class="actions">
<a class="btn btn-gold" href="${esc(downloadUrl)}">${ICON_DOWNLOAD}Download for Mac</a>
<a class="btn btn-ghost" href="${esc(releaseUrl)}">Get it from GitHub Releases</a>
</div>
<ul class="meta">${ctaMeta}</ul>
</div>
</section>

</main>
` + footer;

// ---------- beta ----------
// Not indexed. Offers the newest pre-release while it's newer than the latest release; otherwise says there's no beta.
const betaPage = head({
  title: betaIsCurrent ? `PayrollRTI ${beta.version} beta | PayrollRTI` : "No beta right now | PayrollRTI",
  description: betaIsCurrent ? "A test version of PayrollRTI, newer than the latest release." : "There is no PayrollRTI beta at the moment. The latest release is the newest version.",
  path: "/beta/",
  noindex: true,
}) + header("/beta/") + `<main id="main" class="statuspage">
<div class="wrap">
${betaIsCurrent ? `<h1 class="h2">PayrollRTI ${esc(beta.version)} beta</h1>
<p>A test version, newer than the latest release${version ? ` (${esc(version)})` : ""}. Back up your payroll in Basic PAYE Tools before you try it.</p>
<div class="actions">
<a class="btn btn-gold btn-sm" href="${esc(betaDownloadUrl)}">${ICON_DOWNLOAD}Download the beta</a>
</div>
<p><a href="${esc(betaNotesUrl)}">What’s in this beta, on GitHub</a></p>
<p><a href="/">Or use the latest release</a></p>` : `<h1 class="h2">No beta right now</h1>
<p>${version ? `PayrollRTI ${esc(version)} is the latest version.` : "The latest release is the newest version."} There’s nothing newer to test at the moment.</p>
<div class="actions">
<a class="btn btn-gold btn-sm" href="${esc(downloadUrl)}">${ICON_DOWNLOAD}Download the latest release</a>
</div>
<p><a href="/releases/">See what’s new in each version</a></p>`}
</div>
</main>
` + footer;

// ---------- releases ----------
const releaseHtml = releases.length
  ? releases.map((r, i) => `<article class="release${i === 0 ? " latest" : ""}" aria-labelledby="r-${i}">
<div class="release-head">
<div class="left"><h2 id="r-${i}">Version ${esc(r.version)}</h2>${i === 0 ? '<span class="badge">Latest</span>' : ""}</div>
<time datetime="${esc(r.published_at)}">${longDate(r.published_at)}</time>
</div>
<div class="notes">${markdown(withoutDiffLinks(r.body)) || "<p>No notes for this release.</p>"}</div>
${i === 0 && r.dmg ? `<a class="btn btn-gold btn-sm" href="${esc(r.dmg.url)}">${ICON_DOWNLOAD}Download this version</a>\n` : ""}<p class="more"><a href="${esc(r.html_url)}">See this release on GitHub</a></p>
</article>`).join("\n")
  : `<div class="empty"><p>Release notes will appear here shortly. In the meantime, <a href="${REPO}/releases">see all releases on GitHub</a>.</p></div>`;

const releasesPage = head({
  title: "Release notes | PayrollRTI",
  description: "What has changed in each version of PayrollRTI, the free app that runs HMRC's Basic PAYE Tools on modern Macs.",
  path: "/releases/",
}) + header("/releases/") + `<main id="main" class="page">
<div class="wrap narrow">
<p><a href="/">Back to PayrollRTI</a></p>
<h1>Release notes</h1>
<p class="intro">What has changed in each version of PayrollRTI. This list comes straight from <a href="${REPO}/releases">our releases on GitHub</a>.</p>
<div class="releases">
${releaseHtml}
</div>
<div class="callout"><p><strong>Looking for HMRC’s own updates?</strong> PayrollRTI tells you when HMRC releases a new version of Basic PAYE Tools. You can also check the <a href="${HMRC_BPT}">Basic PAYE Tools page on GOV.UK</a>.</p></div>
</div>
</main>
` + footer;

// ---------- stats ----------
const rows = csv.trim().split("\n").slice(1).filter(Boolean).map((l) => { const [date, v, c] = l.split(","); return { date, v, c: Number(c) }; });
const totalsByDate = new Map();
for (const r of rows) totalsByDate.set(r.date, (totalsByDate.get(r.date) || 0) + r.c);
const dates = [...totalsByDate.keys()].sort();
const daily = dates.slice(1).map((d, i) => ({ date: d, n: Math.max(0, totalsByDate.get(d) - totalsByDate.get(dates[i])) })).slice(-90);

function chart() {
  if (daily.length < 2) return `<p class="muted">The daily chart appears after a few days of data.</p>`;
  const W = 900, H = 260, pad = { l: 44, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...daily.map((d) => d.n));
  const bw = Math.min(28, (W - pad.l - pad.r) / daily.length);
  const y = (n) => pad.t + (H - pad.t - pad.b) * (1 - n / max);
  const bars = daily.map((d, i) => `<rect class="bar" x="${(pad.l + i * bw + 1).toFixed(1)}" y="${y(d.n).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${(H - pad.b - y(d.n)).toFixed(1)}" rx="2"><title>${d.date}: ${d.n}</title></rect>`).join("");
  const ticks = [0, Math.round(max / 2), max].map((t) => `<text class="tick" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12">${t}</text><line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`).join("");
  const labels = `<text class="tick" x="${pad.l}" y="${H - 8}" font-size="12">${daily[0].date}</text><text class="tick" x="${W - pad.r}" y="${H - 8}" text-anchor="end" font-size="12">${daily.at(-1).date}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Downloads per day, ${daily[0].date} to ${daily.at(-1).date}. Highest day: ${max}.">${ticks}${bars}${labels}</svg>`;
}
const byVersion = Object.entries(stats.byVersion || {});
const last7 = daily.slice(-7).reduce((a, d) => a + d.n, 0);
const statsPage = head({ title: "Download numbers | PayrollRTI", description: "PayrollRTI download numbers.", path: "/stats/", noindex: true }) + header("/stats/") + `<main id="main" class="page">
<div class="wrap narrow">
<p><a href="/">Back to PayrollRTI</a></p>
<h1>Download numbers</h1>
<p class="intro">Counted by GitHub for each release file. Includes repeat and automated downloads, so read it as a trend. ${stats.updatedAt ? `Updated ${longDate(stats.updatedAt)}.` : "Not updated yet."}</p>
<div class="stat-grid">
<div class="stat"><p class="n">${fmt(stats.total || 0)}</p><p class="l">Downloads in total</p></div>
<div class="stat"><p class="n">${daily.length ? fmt(last7) : "None yet"}</p><p class="l">In the last 7 days</p></div>
<div class="stat"><p class="n">${releases.length}</p><p class="l">Releases</p></div>
</div>
<div class="chart"><h2 class="chart-title">Downloads per day</h2>${chart()}</div>
<div class="table-wrap"><table>
<caption>Downloads by version</caption>
<thead><tr><th scope="col">Version</th><th scope="col" class="num">Downloads</th></tr></thead>
<tbody>${byVersion.length ? byVersion.map(([v, n]) => `<tr><td>${esc(v)}</td><td class="num">${fmt(n)}</td></tr>`).join("") : `<tr><td colspan="2">No data yet.</td></tr>`}</tbody>
</table></div>
</div>
</main>
` + footer;

// ---------- 404 ----------
const notFound = head({ title: "Page not found | PayrollRTI", description: "This page could not be found.", path: "/404.html", noindex: true }) + header("") + `<main id="main" class="statuspage">
<div class="wrap">
<h1 class="h2">Page not found</h1>
<p>The page you’re looking for isn’t here.</p>
<p><a href="/">Go to the PayrollRTI home page</a></p>
</div>
</main>
` + footer;

// ---------- text files ----------
// llms.txt: the facts an AI assistant needs, in plain Markdown. llms-full.txt adds every FAQ answer,
// built from the same data as the pages so the two can't drift apart.
// The beta lines show only while the newest pre-release is newer than the latest release.
const mdFromHtml = (html, base) => html
  .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (_, href, text) => `[${text}](${href.startsWith("#") ? `${base}${href}` : href})`)
  .replace(/<[^>]+>/g, "");
const faqMarkdown = (list, base) => list.map((f) => `### ${f.q}\n\n${mdFromHtml(f.a, base)}`).join("\n\n");

const llmsBeta = betaIsCurrent ? `
## Beta: PayrollRTI ${beta.version} (pre-release for testers)
- A test version, newer than the latest release. Back up in Basic PAYE Tools before trying it.
- Download the beta: ${betaDownloadUrl}
- What's in it: ${betaNotesUrl}
` : "";

const llms = `# PayrollRTI

> Free, open-source Mac app that runs HMRC's Basic PAYE Tools (BPT) on macOS Sequoia (15), Tahoe (26) and Golden Gate (27) without the Terminal workaround in HMRC's help page, and on Apple silicon without Rosetta, ready for macOS 28. Not made or endorsed by HMRC.

## The problem
- Basic PAYE Tools is HMRC's free payroll software for employers with fewer than 10 employees, used to send Real Time Information (RTI) payroll submissions to HMRC.
- Since macOS Sequoia, Basic PAYE Tools does not start properly on a Mac: its background service doesn't start, so it hangs or never opens. HMRC acknowledge the problem on macOS 15 Sequoia, 26 Tahoe and 27 Golden Gate. Their workaround is to open Terminal, type commands, keep the window open while running payroll, and press Ctrl+C at the end, every time.
- HMRC's Mac app is built for Intel Macs, so on Apple silicon Macs it runs through Rosetta. Apple say macOS 27 Golden Gate is the last version with full Rosetta; from macOS 28 (due 2027) only some older games keep it, so Intel-only apps stop running on Apple silicon.
- Intel Macs don't use Rosetta. macOS 26 Tahoe is the last version for Intel Macs.
${version ? `
## What PayrollRTI ${version} does (current release)` : `
## What PayrollRTI does`}
- Install PayrollRTI, then double-click it: it starts Basic PAYE Tools' background service, opens Basic PAYE Tools in its own Mac window, and stops the service cleanly on quit. No Terminal.
- Two ways to run Basic PAYE Tools, chosen when PayrollRTI first opens and changeable any time in Settings: HMRC's Linux version run natively by PayrollRTI (recommended on Apple silicon), or HMRC's Mac app installed from GOV.UK.
- HMRC's Linux version: PayrollRTI downloads HMRC's Linux build from GOV.UK (about 190 MB), unpacks it, and runs it on a native Apple silicon Python runtime built into the app. It is the same Basic PAYE Tools program as the Mac app, packaged differently. HMRC's files are not modified or redistributed. No Rosetta needed, so it is designed to keep working on macOS 28 and later, when Apple will remove Rosetta for apps.
- HMRC's Mac app: runs on Intel Macs natively and on Apple silicon through Rosetta, which PayrollRTI can install while Apple still offer it.
- Same screens, same calculations, same submissions to HMRC either way. Tested by the developer with real backups restored, P60s produced, and live submissions accepted by HMRC (a NINO verification request and a Full Payment Submission); a month's pay run gave identical submissions from both.
- Both use the same payroll data in ~/HMRC/payetools-rti. Switching between them at the same Basic PAYE Tools version is a restart. A newer version updates the database when it first starts; older versions can't open it afterwards, and PayrollRTI refuses to start a copy that is too old.
- Runs the same steps as HMRC's own launcher, which the Terminal workaround skips: setting up the database on first use, updating it after a new Basic PAYE Tools version, and Basic PAYE Tools' backup when you quit.
- Backups: PayrollRTI also saves a backup in Basic PAYE Tools' own format before downloading the Linux version and before starting a version that will update the database, in ~/HMRC/payetools-rti/backups. You can always restore your data from these in Basic PAYE Tools.
- Updates: PayrollRTI checks HMRC's own update feed. With the Linux version it downloads new Basic PAYE Tools versions itself; with the Mac app it links to GOV.UK. PayrollRTI updates itself from GitHub releases (from version 0.2.0; earlier versions need a manual download).
- Menu bar status and start at login.
- Needs macOS 15 Sequoia or later. The Linux version needs an Apple silicon Mac (M1 or later); Intel Macs use HMRC's Mac app. Signed and notarised by Apple.
- Advice: back up in Basic PAYE Tools and keep a copy off the Mac before switching; install the matching version of HMRC's Mac app before switching back to it; run Basic PAYE Tools one way at a time.
- Data: everything runs locally. PayrollRTI sends no data anywhere.
- Cost: free, no account, no tracking. Licence: MIT. Made by seatofthepants.net Ltd.
${llmsBeta}
## Links
- [Download the current release${version ? ` (${version})` : ""}](${downloadUrl})${betaIsCurrent ? `\n- [Download the beta (${beta.version})](${betaDownloadUrl})` : ""}
- [Source code](${REPO})
- [Report a problem](${REPO}/issues)
- [HMRC's help page on the issue](${HMRC_HELP})
- [Get Basic PAYE Tools from GOV.UK](${HMRC_BPT})
- [Release notes](${SITE}/releases/)
- [Apple Support Communities thread on Basic PAYE Tools not opening](${APPLE_THREAD})
- [Full text, with every common question answered](${SITE}/llms-full.txt)
`;

const llmsFull = `${llms}
## Common questions

${faqMarkdown(faq, `${SITE}/`)}
`;
const robots = `User-agent: *\nAllow: /\nDisallow: /stats/\n\nSitemap: ${SITE}/sitemap.xml\n`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>
<url><loc>${SITE}/releases/</loc><lastmod>${(latest?.published_at || new Date().toISOString()).slice(0, 10)}</lastmod></url>
</urlset>
`;

// ---------- write ----------
const write = (p, s) => { mkdirSync(dirname(join(DIST, p)), { recursive: true }); writeFileSync(join(DIST, p), s); };
write("index.html", home);
write("releases/index.html", releasesPage);
write("beta/index.html", betaPage);
write("stats/index.html", statsPage);
write("404.html", notFound);
write("llms.txt", llms);
write("llms-full.txt", llmsFull);
write("robots.txt", robots);
write("sitemap.xml", sitemap);
write("stats.json", JSON.stringify(stats, null, 2) + "\n");
console.log(`Built dist/ — version ${version || "(none yet)"}, downloads ${stats.total || 0}, download link ${downloadUrl}`);
