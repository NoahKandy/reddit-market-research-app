/**
 * Extraction Prompt Template
 * Uses the exact v2.0 extraction framework for market research
 */

function generateExtractionPrompt(scrapedData, topic) {
    const { metadata, posts, sourceLog } = scrapedData;

    // Format the scraped data for analysis
    const formattedPosts = posts.map((post, index) => {
        const comments = post.comments.map(c => {
            const replies = (c.replies || []).map(r => `      - Reply (${r.score} pts): ${r.body}`).join('\n');
            return `    - Comment (${c.score} pts) by u/${c.author}: ${c.body}${replies ? '\n' + replies : ''}`;
        }).join('\n');

        return `
### POST #${index + 1}
**Title:** ${post.title}
**Subreddit:** r/${post.subreddit}
**Score:** ${post.score} | **Comments:** ${post.numComments}
**URL:** ${post.url}
**Flair:** ${post.flair || 'None'}

**Body:**
${post.selftext || '[No body text]'}

**Top Comments:**
${comments || '[No comments]'}
`;
    }).join('\n---\n');

    const prompt = `REDDIT MARKET RESEARCH EXTRACTION v2.0
Purpose: Extract pain points, symptoms, and mechanism raw material for supplement offers

=== INPUT PARAMETERS ===
NICHE: ${topic}
DATE RANGE: ${metadata.timeFilter}
SCOPE: ${metadata.subreddits.map(s => 'r/' + s).join(', ')}
DEPTH: ${metadata.totalPosts} posts, ${metadata.totalComments} comments analyzed

=== SCRAPED DATA TO ANALYZE ===

${formattedPosts}

=== END OF SCRAPED DATA ===

Now analyze the above Reddit data using the following framework:

=== SOURCE TRACKING (CRITICAL) ===
Maintain a running log of every thread analyzed. For each source, capture:
- URL
- Subreddit
- Post title
- Upvotes (if visible)
- Comment count (if visible)
- Date posted (important for trend tracking)
- Primary extraction value (Pain Point / Symptom / Mechanism / Multiple)

Output this as a structured SOURCE LOG at the end of the extraction, formatted as:

SOURCE LOG:
1. [URL] | r/[subreddit] | "[Post Title]" | [upvotes] | [date] | Value: [Pain Point/Symptom/Mechanism/Multiple]
2. [URL] | r/[subreddit] | "[Post Title]" | [upvotes] | [date] | Value: [Pain Point/Symptom/Mechanism/Multiple]
...

This log will be used for deeper analysis in follow-up sessions.

=== PHASE 1: SUBREDDIT MAPPING ===
Identify:
- Primary subreddits (direct topic)
- Adjacent subreddits (related conditions, co-morbidities)
- Skeptic subreddits (where people complain solutions don't work)
- Demographic subreddits (where target audience hangs out)
- Symptom-specific subreddits (where people discuss individual symptoms)

=== PHASE 2: PAIN POINT & SYMPTOM EXTRACTION ===
(CRITICAL: This is the foundation for targeting unaware/problem-aware markets)

**SECTION A: PAIN POINT IDENTIFICATION**

For each distinct pain point discovered within the niche:

1. PAIN POINT NAME
   - Common name used by audience (their words, not clinical)
   - Clinical/medical name (if different)
   - Alternate names/slang terms

2. PAIN POINT VOLUME INDICATORS
   - Number of dedicated threads found
   - Average upvotes on pain point threads
   - Comment engagement level (Low/Medium/High/Viral)
   - Dedicated subreddits for this specific pain point?
   - VOLUME SCORE: [1-10]

3. EMOTIONAL CHARGE INDICATORS
   - Desperation language frequency ("I can't take this anymore", "ruining my life")
   - Duration of suffering mentioned (months/years)
   - Failed attempt count mentioned
   - Life impact statements
   - EMOTIONAL CHARGE SCORE: [1-10]

4. PAIN POINT PRIORITY SCORE
   - Formula: (Volume Score × 0.4) + (Emotional Charge Score × 0.6) = PRIORITY SCORE
   - [Higher emotional charge weighted more - indicates buying intent]

**SECTION B: SYMPTOM MAPPING**
(For each identified pain point, extract symptoms in hierarchy)

PRIMARY SYMPTOMS (Physical) - What they FEEL in their body:
- Exact symptom descriptions in their words
- Frequency mentioned (daily/weekly/episodic)
- Severity language ("mild", "debilitating", "worst pain")
- Timing patterns ("after eating", "in the morning", "when stressed")
- Location specificity ("lower left abdomen", "behind my eyes")
- [Flag high-frequency symptoms - these become ad hooks]

SECONDARY SYMPTOMS (Emotional) - Extract only if high volume:
- Emotional states directly tied to physical symptoms
- Mental health impacts mentioned
- Cognitive symptoms ("brain fog", "can't concentrate")
- [Only include if mentioned in 20%+ of threads]

COMPLEMENTARY SYMPTOMS (Lifestyle Impact):
- Activities they can't do
- Social situations they avoid
- Work/productivity impact
- Relationship strain
- [Use for "imagine if..." future pacing in copy]

**SECTION C: SYMPTOM CLUSTER IDENTIFICATION**
(Critical for "Do you experience..." ad hooks)

Identify SYMPTOM CLUSTERS - combinations that appear together:
- Cluster A: [Symptom 1] + [Symptom 2] + [Symptom 3]
- Cluster B: [Symptom 1] + [Symptom 4] + [Symptom 5]
- [These clusters = audience segments with specific experiences]

For each cluster:
- Frequency (how often this combo appears)
- Unique identifier name (what could we call this type?)
- Best source threads demonstrating this cluster

**SECTION D: PAIN POINT → SYMPTOM MATRIX OUTPUT**

| Pain Point | Priority Score | Top Physical Symptoms | Emotional (if high vol) | Lifestyle Impact | Thread Count |
|------------|---------------|----------------------|------------------------|------------------|--------------|
| [Name]     | [X.X]         | [1, 2, 3]            | [if applicable]        | [key impacts]    | [#]          |

=== PHASE 3: MECHANISM EXTRACTION ===
(Now connected to specific pain points)

**SECTION A: PROBLEM MECHANISM RAW MATERIAL**
(What we need to build the "why you've failed" narrative)

For EACH high-priority pain point, extract:

1. STATED BELIEFS ABOUT ROOT CAUSE
   - What do they think is ACTUALLY causing this specific pain point?
   - What "hidden" or "overlooked" factors do they mention?
   - What body systems/processes do they blame?
   - What triggers do they identify?
   - [Flag any beliefs that could become the "knowledge gap"]
   - LINKED TO PAIN POINT: [Name]

2. WHY PAST SOLUTIONS FAILED (Their Words)
   - Specific products/approaches that didn't work FOR THIS PAIN POINT
   - Their explanation for WHY it didn't work
   - Partial successes that stopped working
   - Side effects experienced
   - [Flag patterns - same failure reason = mechanism opportunity]
   - LINKED TO PAIN POINT: [Name]

3. MISSING PIECE LANGUAGE
   - "I feel like I'm missing something..."
   - "Nobody talks about..."
   - "Why doesn't anyone mention..."
   - "I finally realized..."
   - [These are direct mechanism seeds]
   - LINKED TO PAIN POINT: [Name]

**SECTION B: SOLUTION MECHANISM RAW MATERIAL**
(What we need to build the "why THIS works" narrative)

4. THINGS THAT ACTUALLY WORKED
   - What finally helped them with THIS SPECIFIC pain point?
   - What was different about it?
   - What did they have to change/add/remove?
   - Unexpected solutions that worked
   - [Raw material for existing/unspoken mechanisms]
   - LINKED TO PAIN POINT: [Name]

5. UNSPOKEN FACTORS
   - Common practices nobody highlights for this pain point
   - "Everyone knows X but..."
   - Standard ingredients/approaches that could be elevated
   - [Direct unspoken mechanism opportunities]

6. REFRAMABLE CONCEPTS
   - Boring/clinical terms for things that work
   - Scientific processes described in plain language
   - Old remedies or approaches with new understanding
   - [Transubstantiation opportunities]

**SECTION C: BELIEF ARCHITECTURE**
(What the prospect already believes - leverage or counter)

7. TRUSTED INFORMATION SOURCES
   - Who do they believe?
   - What studies/experts do they cite?
   - What makes them trust something?

8. SKEPTICISM PATTERNS
   - What claims trigger distrust?
   - Past disappointments
   - "Red flags" they watch for
   - [Objections the mechanism must overcome]

9. SUCCESS METRICS (Per Pain Point)
   - How do they know something is "working" for THIS pain point?
   - Timeline expectations
   - What would convince them it's real?
   - Specific symptom relief they look for

=== PHASE 4: LANGUAGE MINING ===

**SECTION A: SYMPTOM DESCRIPTION LANGUAGE**
(Organized by pain point)

For each pain point, capture:
- Exact phrases for symptoms (verbatim)
- Sensory language ("feels like...", "it's like...")
- Severity descriptors
- [Direct ad hook material - "Do you experience [exact phrase]?"]

**SECTION B: PROBLEM DESCRIPTION LANGUAGE**
- Exact phrases for the overall problem
- Emotional language about impact
- Metaphors they use
- [Direct ad copy material]

**SECTION C: DESIRE LANGUAGE**
- How they describe the ideal outcome
- "I just want to..."
- Life impact of solving this
- Specific activities they want to do again
- [Headline/promise material]

=== PHASE 5: SYNTHESIS & PRIORITIZATION ===

**A. PAIN POINT PRIORITY RANKING**

Rank all discovered pain points:

| Rank | Pain Point | Priority Score | Volume | Emotional Charge | Mechanism Opportunity | Recommended Focus |
|------|------------|----------------|--------|------------------|----------------------|-------------------|
| 1    | [Name]     | [X.X]          | [1-10] | [1-10]           | [High/Med/Low]       | [Primary/Secondary/Skip] |
| 2    | [Name]     | [X.X]          | [1-10] | [1-10]           | [High/Med/Low]       | [Primary/Secondary/Skip] |

**B. SYMPTOM HOOK BANK**
(Top 20 symptom-based hooks, ranked by frequency + emotional charge)

| Rank | Symptom/Cluster | Verbatim Language | Pain Point | Frequency | Hook Potential |
|------|-----------------|-------------------|------------|-----------|----------------|
| 1    | [Symptom]       | "[exact quote]"   | [Name]     | [High/Med]| [1-10]         |

**C. PROBLEM MECHANISM CANDIDATES**
For each candidate:
- Mechanism name (what to call it)
- LINKED TO PAIN POINT(S): [Which pain points this explains]
- The knowledge gap it fills
- Evidence from Reddit that supports it
- Why it explains past failure
- Believability score (1-10)
- Source threads (reference by SOURCE LOG number)

**D. SOLUTION MECHANISM CANDIDATES**
For each candidate:
- Mechanism type (Existing / Unspoken / Transubstantiated)
- LINKED TO PAIN POINT(S): [Which pain points this solves]
- What it is in plain terms
- How to name/frame it
- Why it's different from what they've tried
- Proof points available
- Source threads (reference by SOURCE LOG number)

**E. COPY BANK**
- 10-20 verbatim symptom phrases for hooks (with source # and pain point)
- 10-20 verbatim phrases for problem agitation (with source #)
- 10-20 verbatim phrases for desire/outcome (with source #)
- Key objection language to address (with source #)

**F. MECHANISM VALIDATION CHECKLIST**
For each top mechanism candidate, answer:
□ Does it explain why past solutions failed for [specific pain point]?
□ Does it connect to the TOP physical symptoms?
□ Does it fill a genuine knowledge gap?
□ Is it believable/provable?
□ Does it differentiate from competitors?
□ Can we build a full narrative around it?

=== PHASE 6: HYPOTHESIS OUTPUT ===

Generate 3-5 complete mechanism hypotheses, each tied to specific pain points:

MECHANISM HYPOTHESIS #[X]
- Name: [Catchy mechanism name]
- Type: [Existing/Unspoken/Transubstantiated]
- TARGET PAIN POINT(S): [Which pain points this addresses]
- KEY SYMPTOMS IT EXPLAINS: [Top 3 symptoms this mechanism accounts for]
- Problem Side: [Why they've been failing]
- Solution Side: [Why this works]
- Knowledge Gap: [The one thing they didn't know]
- Proof Strategy: [How to make it believable]
- Best-Fit Product Type: [What kind of supplement this works for]
- Sample Hook: [One-line version for ads - symptom-focused]
- Sample "Do You Experience..." Lead: [Symptom cluster question]
- Key Source Threads: [List SOURCE LOG numbers with richest evidence]

=== PHASE 7: OUTPUT SOURCE LOG ===

At the end of extraction, output the complete SOURCE LOG:

SOURCE LOG:
1. [Full URL] | r/[subreddit] | "[Post Title]" | [upvotes] upvotes | [comments] comments | [date] | Value: [Pain Point/Symptom/Mechanism/Multiple] | Key insight: [1-line summary]
2. ...

Flag TOP 10 PRIORITY THREADS for deep-dive analysis:
- TOP 5 for SYMPTOM LANGUAGE (richest physical symptom descriptions)
- TOP 5 for MECHANISM EVIDENCE (strongest root cause/solution insights)

=== EXTRACTION PRIORITY ORDER ===
1. First pass: Identify all distinct PAIN POINTS
2. Second pass: Map SYMPTOMS to each pain point
3. Third pass: Extract MECHANISM material linked to high-priority pain points
4. Fourth pass: Mine LANGUAGE for copy bank
5. Final pass: Synthesize and prioritize

IMPORTANT: Use ACTUAL quotes and data from the scraped posts above. Do not make up or generalize - extract the REAL language people are using.

Go.`;

    return prompt;
}

module.exports = { generateExtractionPrompt };
