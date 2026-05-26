# REDO News Dashboard

A free, always-on dashboard with three tabs: a live ecommerce **News** feed, daily AI-generated strategic **Recommendations**, and an **Implementation** copilot that critiques specific assets (Shopify listings, landing pages, ad copy, screenshots) against REDO's 18 plays. Color-coded, dark themed, accessible from any browser.

**How it works:** GitHub Actions runs the scraper hourly and the recommender daily, writing `news.json` and `recommendations.json` back to your repo. GitHub Pages serves the static dashboard at a public URL. The Implementation tab calls Claude directly from your browser using an API key you paste in once (stored locally on your machine, never committed to the repo). Zero servers to maintain. Total cost: $0 for hosting, roughly $1 to $5 per month for the AI features if you enable them.

---

## What you need

1. A GitHub account (free). If you don't have one, sign up at [github.com](https://github.com).
2. About 20 minutes for the one-time setup.
3. *(Optional, can add later)* An Anthropic API key for smarter classification, daily AI recommendations, and the Implementation copilot. Get one at [console.anthropic.com](https://console.anthropic.com). You get free credit on signup; expect roughly $1 to $5 per month at normal usage.

Without an API key the News tab still works (it falls back to keyword-based classification), but the Recommendations and Implementation tabs need the key to function.

---

## Setup (one-time, about 20 min)

### Step 1: Create the repository

1. Go to [github.com/new](https://github.com/new).
2. Repository name: `redo-news-dashboard` (any name works, but this one matches the folder).
3. Choose **Public**. (GitHub Pages free tier requires public repos.)
4. Do NOT check "Add a README file." Leave it empty.
5. Click **Create repository**.

### Step 2: Upload these files

1. On the new empty repo page, click **uploading an existing file** (it's a link in the middle of the page).
2. Open the `redo-news-dashboard` folder on your Desktop in Finder.
3. Drag every file AND the `.github` folder into the GitHub upload area.
   - If GitHub doesn't show the `.github` folder, in Finder press `Cmd+Shift+.` to reveal hidden folders, then drag it in.
4. Scroll down, leave "Commit directly to the `main` branch" selected, click **Commit changes**.

### Step 3: Enable GitHub Pages

1. On your repo page, click **Settings** (top right tab).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment**, set:
   - Source: **Deploy from a branch**
   - Branch: **main** / **/ (root)**
4. Click **Save**.
5. Wait about 60 seconds, then refresh the Pages settings page. You'll see a green box with your dashboard URL, something like:
   `https://YOUR-USERNAME.github.io/redo-news-dashboard/`

### Step 4: Allow GitHub Actions to commit back to your repo

1. Still in **Settings**, in the left sidebar click **Actions** → **General**.
2. Scroll to **Workflow permissions** at the bottom.
3. Select **Read and write permissions**.
4. Click **Save**.

### Step 5: Trigger the first refresh

1. Go to your repo's **Actions** tab (top of the page).
2. If prompted, click **I understand my workflows, go ahead and enable them**.
3. In the left sidebar, click **Refresh news dashboard**.
4. Click the **Run workflow** dropdown on the right, then **Run workflow** (green button).
5. Wait about 90 seconds. The run will show a green checkmark when done.
6. Open your dashboard URL from Step 3. You should see stories with green (opportunities) and red (threats) tags.

From now on, the workflow runs automatically every hour.

---

## Optional: Upgrade to LLM-based classification (later)

When you're ready for better classification:

1. Sign up at [console.anthropic.com](https://console.anthropic.com), grab your API key from the **API Keys** section.
2. In your GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Name: `ANTHROPIC_API_KEY` (exact spelling, all caps with underscores).
5. Value: paste your API key.
6. Click **Add secret**.

The next hourly run automatically picks up the key and switches to LLM classification. No redeploy needed. The dashboard's "Classifier" indicator will switch from `keyword` to `llm` on the next refresh.

If you ever want to pause API usage, just delete the secret — the system falls back to keyword mode automatically.

---

## Using the dashboard

The dashboard has three tabs across the top. Click any tab to switch, or use the URL hash (`#news`, `#recommendations`, `#implementation`) to deep link.

### News tab

This is the live feed from the hourly scraper.

- **All / Opportunities / Threats** filter buttons at the top.
- **Search box** filters by any text in the title, summary, or source.
- **Color coding:** green left border = opportunity, red left border = threat.
- **Tag intensity:** darker tag = high confidence, lighter = medium or low.
- **Auto-refresh:** the page silently re-fetches the news every 5 minutes while open, so you don't need to manually reload.

### Recommendations tab

Daily AI-generated strategic plays based on the last 7 days of news, grounded in REDO's playbook (`strategy_context.md`).

- Each card shows urgency, impact, and whether it's amplifying an existing play or proposing a new one.
- Click **Implement this** on any card to jump straight to the Implementation tab with the relevant play pre-selected.
- Triggering news stories are linked at the bottom of each card so you can audit the reasoning.

### Implementation tab

A copilot that takes a specific asset and tells you exactly what to change to better execute one of REDO's 18 plays.

**One-time setup:**
1. Open the Implementation tab.
2. Paste your Anthropic API key into the **API key** field and click **Save key**. It's stored in your browser's localStorage and never leaves your machine except to call Anthropic's API directly. It is NOT committed to the GitHub repo.

**Each time you use it:**
1. Pick a play from the dropdown. You have 19 options:
   - **Plays 1 through 18** are REDO's standing plays from the strategy doc.
   - **Option 19, "Other,"** lets you target one of the AI recommendations from the Recommendations tab. Type a name, a paraphrase, or a few keywords for the recommendation you want to execute, and the copilot will read all current recommendations from `recommendations.json`, match the closest one, and use it as context.
2. Provide one or more inputs:
   - **URL:** paste a link (Shopify app listing, landing page, blog post, competitor page).
   - **Content:** paste raw text (ad copy, email draft, headline options).
   - **Images:** upload screenshots (G2 listing, ad creative, landing page mockup).
3. Click **Get recommendations**. The copilot reads your inputs, the play's strategic intent, and REDO's context, then returns specific edits you can make today.

Reference screenshots for plays 3 (G2 listing), 6 (Reddit), and 8 (LinkedIn ads) are displayed automatically when you select those plays.

**Refining the response (follow-up chat):**

After the first set of recommendations renders, a **Refine these recommendations** chat box appears below them. Type a follow-up and click **Send follow-up** to keep the conversation going. The copilot remembers everything in the current thread, so you can:

- Ask it to rewrite a specific suggestion in a different tone.
- Push back ("we don't have the budget for that, what's a $0 version?").
- Drill into one section ("go deeper on suggestion #2").
- Ask for a different format ("give me three subject-line options instead of one").

Click **Start over** to clear the thread and begin fresh (for a new play or new asset). Your inputs stay where they are; only the conversation resets.

**Example uses:**
- "Here's our Shopify app listing URL, what would make it convert better for Play 3?" (paste URL, pick Play 3, hit Get recommendations)
- "Here's draft copy for a Klaviyo comparison page, does it land for Play 1?" (paste copy, pick Play 1)
- "Here's a screenshot of our LinkedIn ad, is it doing what Play 8 needs?" (upload PNG, pick Play 8)

---

## What it scrapes

**Always-on feeds:**

- Practical Ecommerce, Modern Retail, Retail Dive, eCommerce Bytes
- Hacker News
- r/shopify, r/ecommerce

**Google News searches:**

Klaviyo, Yotpo, Loop Returns, Attentive, Omnisend, Postscript, Shopify, Mailchimp, ShipStation, Narvar, agentic commerce, AI shopping agent, post-purchase ecommerce, abandoned cart recovery, DTC ecommerce, ecommerce SaaS, Shopify Plus, returns management software, headless commerce

To add or remove sources, edit `scraper.py` (the `FEEDS` and `GOOGLE_NEWS_TERMS` lists at the top) and push the change to GitHub.

---

## Strategic recommendations (the AI agent)

On top of the news scraper, the dashboard also runs a strategic recommender agent that reads the last 7 days of classified news and generates 3 to 5 actionable plays. Each recommendation tells you what to do, why it'll work, and which news items triggered it. The agent either suggests amplifying one of REDO's existing 18 plays OR proposes a brand-new play, depending on what the news warrants.

**Important:** the recommender requires an Anthropic API key. Without it, the dashboard still shows news but the recommendations section says "set ANTHROPIC_API_KEY to enable." Setup is described in the Optional section above.

**Schedule:** runs daily at 11 AM UTC (4 AM PT / 7 AM ET), so fresh recommendations are waiting before the US workday starts. You can also manually trigger it from the Actions tab any time (look for "Generate strategic recommendations" in the left sidebar).

**The strategy context:** the agent reads `strategy_context.md` to understand REDO's playbook, plays, and competitive position. Edit that file when REDO's strategy changes (new plays, new competitors, updated stats, etc). The agent picks up changes on the next run, no code edits needed.

**Cost:** roughly $0.50 to $2.00 per month at daily cadence on Claude Sonnet 4.6.

**Dashboard display:** recommendations appear at the top of the page, above the news feed. Each recommendation card is color-coded the same way as news (green left border = opportunity-driven, red = threat-driven), plus three small badges showing urgency (urgent / this quarter / long-term), impact, and whether it's amplifying an existing play or proposing a new one.

---

## Troubleshooting

**The dashboard URL says "404 - file not found."** GitHub Pages takes 1-2 minutes to publish after first enabling. Wait and refresh. If it persists, check Settings → Pages and confirm the source is set to `main` branch root.

**The dashboard loads but says "No data yet."** The first Actions run hasn't completed. Go to the Actions tab and check the most recent run. If it failed, click into it to see the error. If it hasn't run yet, follow Step 5 above to trigger it manually.

**A workflow run failed.** Click into the failed run in the Actions tab to see the error log. The most common issue is the `news.json` file getting locked or a single feed timing out — the next hourly run usually resolves it on its own.

**Stories look miscategorized.** Keyword classification is rough. Adding an Anthropic API key (Optional step above) noticeably improves accuracy.

**I want to change the hourly schedule.** Edit `.github/workflows/refresh.yml`. The cron expression `0 * * * *` means "every hour at minute 0." Change to `0 */2 * * *` for every 2 hours, `0 8,12,16 * * *` for 3 specific times daily, etc.

---

## File map

```
redo-news-dashboard/
├── README.md                   ← you are here
├── index.html                  ← the tabbed dashboard (served by GitHub Pages)
├── news.json                   ← scraped data (auto-updated hourly)
├── recommendations.json        ← AI recommendations (auto-updated daily)
├── strategy_context.md         ← REDO playbook the recommender + copilot use
├── scraper.py                  ← pulls RSS feeds
├── classifier.py               ← labels stories as opportunity/threat
├── refresh.py                  ← runs the scrape + classify pipeline
├── recommender.py              ← generates strategic recommendations
├── requirements.txt            ← Python dependencies
├── images/                     ← reference screenshots shown in the Implementation tab
│   ├── play3_g2_*.png          ← G2 listing screenshots for Play 3
│   ├── play6_reddit_klaviyo.png← Reddit thread for Play 6
│   └── play8_linkedin_ads.png  ← LinkedIn Campaign Manager for Play 8
└── .github/
    └── workflows/
        ├── refresh.yml         ← hourly news scrape
        └── recommend.yml       ← daily recommendation generation
```

---

## Updating the dashboard after the initial setup

If you change any of the files locally (for example, you edit `strategy_context.md`, swap in new images, or get an updated `index.html`), here's how to push the changes to GitHub:

1. On your repo page, click the file you want to replace (e.g., `index.html`).
2. Click the pencil icon (top right) to edit, then paste the new contents. OR click **Add file → Upload files** at the repo root and drag the updated file in.
3. Scroll down, click **Commit changes**.
4. GitHub Pages redeploys automatically in about 60 seconds.

**Adding the images folder (first time):** click **Add file → Upload files** at the repo root, drag the entire `images/` folder in, scroll down, **Commit changes**. Done.

**Where the Implementation API key lives:** in your browser's localStorage. It is NOT in any file in the repo, and re-uploading `index.html` will not affect it. If you switch browsers or clear site data, you'll need to paste it again.
