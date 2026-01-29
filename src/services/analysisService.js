/**
 * Analysis Service - Extracts insights from scraped Reddit data
 * Implements the extraction prompt framework for mechanism discovery
 */

class AnalysisService {
    constructor() {
        // Keywords for categorization
        this.problemKeywords = [
            'help', 'struggling', 'nothing works', 'frustrated', 'tried everything',
            'why', "can't", "won't", 'failed', 'desperate', 'suffering', 'miserable',
            'ruining my life', 'at my wits end', 'give up', 'hopeless', 'chronic',
            'years', 'months', 'doctors', 'no answers', 'getting worse'
        ];

        this.solutionKeywords = [
            'finally', 'fixed', 'worked', 'helped', 'cured', 'success', 'recommend',
            'game changer', 'life saver', 'breakthrough', 'solved', 'discovered',
            'the key', 'what worked', 'turning point', 'miracle', 'relief'
        ];

        this.symptomPatterns = [
            /feels? like/gi,
            /i (experience|have|get|suffer from)/gi,
            /symptoms? (include|are|is)/gi,
            /pain in/gi,
            /after eating/gi,
            /when i (eat|wake|sleep|stress)/gi,
            /bloat(ed|ing)?/gi,
            /fatigue|tired|exhausted/gi,
            /brain fog/gi,
            /anxiety|anxious/gi,
            /nausea/gi,
            /constipat(ed|ion)/gi,
            /diarrhea/gi,
            /cramp(s|ing)?/gi,
            /inflam(ed|mation)/gi
        ];

        this.emotionalIndicators = [
            'depressed', 'anxious', 'scared', 'worried', 'frustrated', 'angry',
            'hopeless', 'embarrassed', 'ashamed', 'isolated', 'alone', 'crying',
            'breakdown', 'mental health', 'quality of life'
        ];
    }

    /**
     * Main analysis function - processes all scraped data
     */
    async analyzeData(scrapedData, progressCallback = null) {
        const { posts, sourceLog, metadata } = scrapedData;

        if (progressCallback) progressCallback({ phase: 'starting', message: 'Starting analysis...', progress: 0 });

        // Phase 1: Extract all text content
        const allContent = this._extractAllContent(posts);
        if (progressCallback) progressCallback({ phase: 'content', message: 'Extracted content from posts...', progress: 10 });

        // Phase 2: Identify pain points
        const painPoints = this._extractPainPoints(posts);
        if (progressCallback) progressCallback({ phase: 'painPoints', message: 'Identified pain points...', progress: 25 });

        // Phase 3: Extract symptoms
        const symptoms = this._extractSymptoms(posts);
        if (progressCallback) progressCallback({ phase: 'symptoms', message: 'Extracted symptoms...', progress: 40 });

        // Phase 4: Find symptom clusters
        const symptomClusters = this._findSymptomClusters(posts, symptoms);
        if (progressCallback) progressCallback({ phase: 'clusters', message: 'Found symptom clusters...', progress: 55 });

        // Phase 5: Extract mechanism material
        const mechanismMaterial = this._extractMechanismMaterial(posts);
        if (progressCallback) progressCallback({ phase: 'mechanisms', message: 'Extracted mechanism material...', progress: 70 });

        // Phase 6: Mine language/copy
        const copyBank = this._mineCopyBank(posts);
        if (progressCallback) progressCallback({ phase: 'copy', message: 'Mined copy language...', progress: 85 });

        // Phase 7: Generate mechanism hypotheses
        const hypotheses = this._generateHypotheses(painPoints, symptoms, mechanismMaterial);
        if (progressCallback) progressCallback({ phase: 'hypotheses', message: 'Generated hypotheses...', progress: 95 });

        // Phase 8: Compile final report
        const report = this._compileReport({
            metadata,
            painPoints,
            symptoms,
            symptomClusters,
            mechanismMaterial,
            copyBank,
            hypotheses,
            sourceLog: this._enrichSourceLog(sourceLog, posts)
        });

        if (progressCallback) progressCallback({ phase: 'complete', message: 'Analysis complete!', progress: 100 });

        return report;
    }

    /**
     * Extract all text content from posts and comments
     */
    _extractAllContent(posts) {
        const content = [];
        for (const post of posts) {
            content.push({
                type: 'post',
                id: post.id,
                text: post.title + ' ' + post.selftext,
                score: post.score,
                url: post.url
            });
            for (const comment of post.comments) {
                content.push({
                    type: 'comment',
                    id: comment.id,
                    text: comment.body,
                    score: comment.score,
                    postId: post.id
                });
                for (const reply of comment.replies || []) {
                    content.push({
                        type: 'reply',
                        id: reply.id,
                        text: reply.body,
                        score: reply.score,
                        postId: post.id
                    });
                }
            }
        }
        return content;
    }

    /**
     * Extract and rank pain points
     */
    _extractPainPoints(posts) {
        const painPointMap = new Map();

        for (const post of posts) {
            const text = (post.title + ' ' + post.selftext).toLowerCase();
            const allCommentText = post.comments.map(c => c.body).join(' ').toLowerCase();
            const combinedText = text + ' ' + allCommentText;

            // Look for pain point indicators
            const painIndicators = this._findPainIndicators(combinedText);

            for (const indicator of painIndicators) {
                if (!painPointMap.has(indicator.name)) {
                    painPointMap.set(indicator.name, {
                        name: indicator.name,
                        commonNames: new Set([indicator.name]),
                        threadCount: 0,
                        totalScore: 0,
                        emotionalCharge: 0,
                        sampleQuotes: [],
                        sourceUrls: []
                    });
                }

                const pp = painPointMap.get(indicator.name);
                pp.threadCount++;
                pp.totalScore += post.score;
                pp.emotionalCharge += this._calculateEmotionalCharge(combinedText);

                if (indicator.quote && pp.sampleQuotes.length < 5) {
                    pp.sampleQuotes.push({
                        text: indicator.quote,
                        source: post.url
                    });
                }
                pp.sourceUrls.push(post.url);
            }
        }

        // Calculate priority scores and convert to array
        const painPoints = Array.from(painPointMap.values()).map(pp => {
            const volumeScore = Math.min(10, Math.log10(pp.threadCount + 1) * 5);
            const emotionalScore = Math.min(10, pp.emotionalCharge / pp.threadCount);
            const priorityScore = (volumeScore * 0.4) + (emotionalScore * 0.6);

            return {
                ...pp,
                commonNames: Array.from(pp.commonNames),
                volumeScore: Math.round(volumeScore * 10) / 10,
                emotionalScore: Math.round(emotionalScore * 10) / 10,
                priorityScore: Math.round(priorityScore * 10) / 10,
                avgScore: Math.round(pp.totalScore / pp.threadCount)
            };
        });

        // Sort by priority score
        return painPoints.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    /**
     * Find pain indicators in text
     */
    _findPainIndicators(text) {
        const indicators = [];
        const patterns = [
            { pattern: /(?:struggling with|suffering from|dealing with|have|diagnosed with)\s+([a-z\s]{3,30})/gi, type: 'condition' },
            { pattern: /(?:my|the)\s+([a-z]+)\s+(?:is|are)\s+(?:killing|ruining|destroying)/gi, type: 'impact' },
            { pattern: /(?:chronic|severe|constant|persistent)\s+([a-z\s]{3,20})/gi, type: 'symptom' },
            { pattern: /(?:can't|cannot)\s+(?:eat|sleep|work|live|function)\s+(?:because of|due to)\s+([a-z\s]{3,30})/gi, type: 'limitation' }
        ];

        for (const { pattern, type } of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const name = match[1].trim().toLowerCase();
                if (name.length >= 3 && name.length <= 30) {
                    // Extract surrounding context as quote
                    const startIdx = Math.max(0, match.index - 50);
                    const endIdx = Math.min(text.length, match.index + match[0].length + 50);
                    const quote = '...' + text.substring(startIdx, endIdx).trim() + '...';

                    indicators.push({
                        name: this._normalizePainPointName(name),
                        type,
                        quote
                    });
                }
            }
        }

        return indicators;
    }

    /**
     * Normalize pain point names
     */
    _normalizePainPointName(name) {
        const normalizations = {
            'ibs': 'IBS (Irritable Bowel Syndrome)',
            'irritable bowel': 'IBS (Irritable Bowel Syndrome)',
            'sibo': 'SIBO (Small Intestinal Bacterial Overgrowth)',
            'small intestinal bacterial overgrowth': 'SIBO (Small Intestinal Bacterial Overgrowth)',
            'bloating': 'Bloating',
            'bloat': 'Bloating',
            'constipation': 'Constipation',
            'diarrhea': 'Diarrhea',
            'acid reflux': 'Acid Reflux/GERD',
            'gerd': 'Acid Reflux/GERD',
            'leaky gut': 'Leaky Gut',
            'gut issues': 'General Gut Issues',
            'digestive issues': 'Digestive Issues',
            'food intolerances': 'Food Intolerances',
            'food sensitivities': 'Food Sensitivities'
        };

        const lower = name.toLowerCase().trim();
        return normalizations[lower] || name.charAt(0).toUpperCase() + name.slice(1);
    }

    /**
     * Calculate emotional charge of text
     */
    _calculateEmotionalCharge(text) {
        let charge = 0;
        const lowerText = text.toLowerCase();

        // Check for emotional indicators
        for (const indicator of this.emotionalIndicators) {
            if (lowerText.includes(indicator)) charge += 1;
        }

        // Check for desperation language
        const desperationPatterns = [
            /at (my |wit'?s? )?end/i,
            /don'?t know what (else )?to do/i,
            /tried everything/i,
            /nothing (works|helps)/i,
            /ruining my life/i,
            /can'?t (take|handle|deal)/i,
            /years of/i,
            /desperate/i,
            /please help/i
        ];

        for (const pattern of desperationPatterns) {
            if (pattern.test(text)) charge += 2;
        }

        return charge;
    }

    /**
     * Extract symptoms from posts
     */
    _extractSymptoms(posts) {
        const symptomMap = new Map();

        for (const post of posts) {
            const allText = [
                post.title,
                post.selftext,
                ...post.comments.map(c => c.body),
                ...post.comments.flatMap(c => (c.replies || []).map(r => r.body))
            ].join(' ');

            const foundSymptoms = this._findSymptoms(allText);

            for (const symptom of foundSymptoms) {
                if (!symptomMap.has(symptom.normalized)) {
                    symptomMap.set(symptom.normalized, {
                        name: symptom.normalized,
                        variations: new Set(),
                        frequency: 0,
                        category: symptom.category,
                        samplePhrases: [],
                        coOccurrences: new Map()
                    });
                }

                const s = symptomMap.get(symptom.normalized);
                s.variations.add(symptom.original);
                s.frequency++;
                if (symptom.phrase && s.samplePhrases.length < 5) {
                    s.samplePhrases.push(symptom.phrase);
                }
            }
        }

        // Convert to array and sort by frequency
        return Array.from(symptomMap.values())
            .map(s => ({
                ...s,
                variations: Array.from(s.variations),
                coOccurrences: Object.fromEntries(s.coOccurrences)
            }))
            .sort((a, b) => b.frequency - a.frequency);
    }

    /**
     * Find symptoms in text
     */
    _findSymptoms(text) {
        const symptoms = [];
        const lowerText = text.toLowerCase();

        const symptomDictionary = {
            'physical': [
                { terms: ['bloating', 'bloated', 'bloat'], normalized: 'Bloating' },
                { terms: ['constipation', 'constipated'], normalized: 'Constipation' },
                { terms: ['diarrhea', 'loose stool', 'loose stools'], normalized: 'Diarrhea' },
                { terms: ['abdominal pain', 'stomach pain', 'belly pain', 'gut pain'], normalized: 'Abdominal Pain' },
                { terms: ['cramps', 'cramping', 'cramp'], normalized: 'Cramping' },
                { terms: ['nausea', 'nauseous', 'queasy'], normalized: 'Nausea' },
                { terms: ['gas', 'flatulence', 'gassy'], normalized: 'Gas/Flatulence' },
                { terms: ['acid reflux', 'heartburn', 'gerd'], normalized: 'Acid Reflux' },
                { terms: ['fatigue', 'tired', 'exhausted', 'no energy'], normalized: 'Fatigue' },
                { terms: ['brain fog', 'foggy', 'can\'t think', 'mental fog'], normalized: 'Brain Fog' },
                { terms: ['headache', 'headaches', 'migraine'], normalized: 'Headaches' },
                { terms: ['skin issues', 'acne', 'rash', 'eczema'], normalized: 'Skin Issues' },
                { terms: ['weight gain', 'gaining weight', 'can\'t lose weight'], normalized: 'Weight Issues' },
                { terms: ['insomnia', 'can\'t sleep', 'poor sleep'], normalized: 'Sleep Issues' },
                { terms: ['joint pain', 'achy joints'], normalized: 'Joint Pain' }
            ],
            'emotional': [
                { terms: ['anxiety', 'anxious', 'worried'], normalized: 'Anxiety' },
                { terms: ['depression', 'depressed', 'sad'], normalized: 'Depression' },
                { terms: ['stress', 'stressed'], normalized: 'Stress' },
                { terms: ['irritability', 'irritable', 'mood swings'], normalized: 'Mood Issues' }
            ],
            'lifestyle': [
                { terms: ['can\'t eat', 'afraid to eat', 'food fear'], normalized: 'Food Fear/Restrictions' },
                { terms: ['can\'t go out', 'avoid social', 'cancel plans'], normalized: 'Social Avoidance' },
                { terms: ['miss work', 'can\'t work', 'affects my job'], normalized: 'Work Impact' },
                { terms: ['relationship', 'partner', 'spouse'], normalized: 'Relationship Strain' }
            ]
        };

        for (const [category, symptomList] of Object.entries(symptomDictionary)) {
            for (const { terms, normalized } of symptomList) {
                for (const term of terms) {
                    if (lowerText.includes(term)) {
                        // Extract surrounding phrase
                        const idx = lowerText.indexOf(term);
                        const start = Math.max(0, idx - 30);
                        const end = Math.min(lowerText.length, idx + term.length + 30);
                        const phrase = text.substring(start, end).trim();

                        symptoms.push({
                            original: term,
                            normalized,
                            category,
                            phrase: phrase.length > 10 ? '...' + phrase + '...' : null
                        });
                        break; // Found this symptom, move to next
                    }
                }
            }
        }

        return symptoms;
    }

    /**
     * Find symptom clusters (symptoms that appear together)
     */
    _findSymptomClusters(posts, symptoms) {
        const clusterMap = new Map();

        for (const post of posts) {
            const allText = [post.title, post.selftext, ...post.comments.map(c => c.body)].join(' ').toLowerCase();

            // Find which symptoms appear in this post
            const presentSymptoms = symptoms
                .filter(s => s.variations.some(v => allText.includes(v.toLowerCase())))
                .map(s => s.name)
                .slice(0, 5); // Max 5 symptoms per cluster

            if (presentSymptoms.length >= 2) {
                const clusterKey = presentSymptoms.sort().join(' + ');

                if (!clusterMap.has(clusterKey)) {
                    clusterMap.set(clusterKey, {
                        symptoms: presentSymptoms,
                        frequency: 0,
                        sourceUrls: []
                    });
                }

                const cluster = clusterMap.get(clusterKey);
                cluster.frequency++;
                if (cluster.sourceUrls.length < 3) {
                    cluster.sourceUrls.push(post.url);
                }
            }
        }

        // Convert to array and sort by frequency
        return Array.from(clusterMap.values())
            .filter(c => c.frequency >= 2)
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20)
            .map((c, i) => ({
                ...c,
                name: `Cluster ${i + 1}: ${c.symptoms.slice(0, 3).join(' + ')}${c.symptoms.length > 3 ? ' + more' : ''}`
            }));
    }

    /**
     * Extract mechanism material (root causes, solutions, beliefs)
     */
    _extractMechanismMaterial(posts) {
        const material = {
            rootCauses: [],
            failedSolutions: [],
            workingSolutions: [],
            beliefs: [],
            skepticisms: []
        };

        for (const post of posts) {
            const allText = [
                post.title,
                post.selftext,
                ...post.comments.map(c => c.body)
            ].join('\n');

            // Extract root cause beliefs
            const rootCausePatterns = [
                /(?:i think|i believe|turns out|the real (?:cause|reason|problem)|root cause)\s+(?:is|was|it'?s)\s+([^.!?\n]{10,100})/gi,
                /(?:caused by|due to|because of)\s+([^.!?\n]{10,80})/gi
            ];

            for (const pattern of rootCausePatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    material.rootCauses.push({
                        text: match[1].trim(),
                        context: match[0],
                        source: post.url,
                        score: post.score
                    });
                }
            }

            // Extract failed solutions
            const failedPatterns = [
                /(?:tried|used|took)\s+([^.!?\n]{5,50})\s+(?:but|and)\s+(?:it )?(didn'?t|didn'?t work|nothing|no help|made .* worse)/gi,
                /([^.!?\n]{5,50})\s+(?:didn'?t work|doesn'?t work|never worked|useless|waste of money)/gi
            ];

            for (const pattern of failedPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    material.failedSolutions.push({
                        solution: match[1].trim(),
                        context: match[0],
                        source: post.url
                    });
                }
            }

            // Extract working solutions
            const workingPatterns = [
                /(?:what (?:finally )?worked|game changer|life saver|breakthrough|the key)\s+(?:was|is|for me)?\s*:?\s*([^.!?\n]{10,100})/gi,
                /(?:finally|actually)\s+(?:worked|helped|fixed|cured|solved)\s*:?\s*([^.!?\n]{10,100})/gi,
                /(?:i |my )?(?:started|began|tried)\s+([^.!?\n]{10,80})\s+and\s+(?:it )?(?:worked|helped|fixed|changed)/gi
            ];

            for (const pattern of workingPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    material.workingSolutions.push({
                        solution: match[1].trim(),
                        context: match[0],
                        source: post.url,
                        score: post.score
                    });
                }
            }

            // Extract beliefs about what works
            const beliefPatterns = [
                /(?:you need to|you have to|the key is|important to)\s+([^.!?\n]{10,80})/gi,
                /(?:most people|everyone|doctors)\s+(?:don'?t|doesn'?t|never)\s+([^.!?\n]{10,80})/gi
            ];

            for (const pattern of beliefPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    material.beliefs.push({
                        belief: match[1].trim(),
                        context: match[0],
                        source: post.url
                    });
                }
            }

            // Extract skepticisms
            const skepticPatterns = [
                /(?:snake oil|scam|doesn'?t work|waste of money|bs|bullshit|fake)\s*:?\s*([^.!?\n]{5,50})?/gi,
                /(?:don'?t believe|skeptical|doubt|suspicious)\s+(?:about|of)?\s*([^.!?\n]{5,80})/gi
            ];

            for (const pattern of skepticPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    material.skepticisms.push({
                        target: (match[1] || '').trim(),
                        context: match[0],
                        source: post.url
                    });
                }
            }
        }

        // Deduplicate and sort by frequency/score
        return {
            rootCauses: this._dedupeAndRank(material.rootCauses, 'text'),
            failedSolutions: this._dedupeAndRank(material.failedSolutions, 'solution'),
            workingSolutions: this._dedupeAndRank(material.workingSolutions, 'solution'),
            beliefs: this._dedupeAndRank(material.beliefs, 'belief'),
            skepticisms: this._dedupeAndRank(material.skepticisms, 'target')
        };
    }

    /**
     * Deduplicate and rank extracted items
     */
    _dedupeAndRank(items, keyField) {
        const map = new Map();

        for (const item of items) {
            const key = (item[keyField] || '').toLowerCase().trim();
            if (key.length < 5) continue;

            if (!map.has(key)) {
                map.set(key, {
                    ...item,
                    frequency: 0,
                    sources: []
                });
            }

            const existing = map.get(key);
            existing.frequency++;
            if (existing.sources.length < 3) {
                existing.sources.push(item.source);
            }
        }

        return Array.from(map.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20);
    }

    /**
     * Mine copy/language bank
     */
    _mineCopyBank(posts) {
        const copyBank = {
            symptomPhrases: [],
            problemPhrases: [],
            desirePhrases: [],
            objectionPhrases: []
        };

        for (const post of posts) {
            const allText = [post.title, post.selftext, ...post.comments.map(c => c.body)].join('\n');

            // Symptom description phrases
            const symptomPatterns = [
                /(?:feels? like|it'?s like)\s+([^.!?\n]{10,80})/gi,
                /(?:i experience|i get|i have)\s+([^.!?\n]{10,60})/gi
            ];

            for (const pattern of symptomPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    copyBank.symptomPhrases.push({
                        phrase: match[0].trim(),
                        source: post.url
                    });
                }
            }

            // Problem/frustration phrases
            const problemPatterns = [
                /(?:i'?m so|i am so)\s+(?:tired|sick|frustrated|done)\s+([^.!?\n]{5,60})/gi,
                /(?:nothing|it'?s|this is)\s+(?:ruining|destroying|affecting)\s+([^.!?\n]{10,60})/gi
            ];

            for (const pattern of problemPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    copyBank.problemPhrases.push({
                        phrase: match[0].trim(),
                        source: post.url
                    });
                }
            }

            // Desire/outcome phrases
            const desirePatterns = [
                /(?:i just want to|i wish i could|i want to be able to)\s+([^.!?\n]{10,80})/gi,
                /(?:imagine|if only)\s+([^.!?\n]{10,80})/gi
            ];

            for (const pattern of desirePatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    copyBank.desirePhrases.push({
                        phrase: match[0].trim(),
                        source: post.url
                    });
                }
            }

            // Objection phrases
            const objectionPatterns = [
                /(?:i don'?t believe|how do i know|seems too good|sounds like)\s+([^.!?\n]{10,80})/gi,
                /(?:skeptical|doubt|suspicious|concerned)\s+(?:about|that)?\s*([^.!?\n]{5,80})/gi
            ];

            for (const pattern of objectionPatterns) {
                let match;
                while ((match = pattern.exec(allText)) !== null) {
                    copyBank.objectionPhrases.push({
                        phrase: match[0].trim(),
                        source: post.url
                    });
                }
            }
        }

        // Deduplicate each category
        return {
            symptomPhrases: this._dedupePhrases(copyBank.symptomPhrases),
            problemPhrases: this._dedupePhrases(copyBank.problemPhrases),
            desirePhrases: this._dedupePhrases(copyBank.desirePhrases),
            objectionPhrases: this._dedupePhrases(copyBank.objectionPhrases)
        };
    }

    /**
     * Deduplicate phrases
     */
    _dedupePhrases(phrases) {
        const seen = new Set();
        return phrases
            .filter(p => {
                const key = p.phrase.toLowerCase().substring(0, 30);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 20);
    }

    /**
     * Generate mechanism hypotheses
     */
    _generateHypotheses(painPoints, symptoms, mechanismMaterial) {
        const hypotheses = [];

        // Get top pain points
        const topPainPoints = painPoints.slice(0, 5);
        const topSymptoms = symptoms.slice(0, 10);
        const topWorkingSolutions = mechanismMaterial.workingSolutions.slice(0, 10);
        const topRootCauses = mechanismMaterial.rootCauses.slice(0, 10);

        // Generate hypotheses based on patterns
        if (topRootCauses.length > 0 && topWorkingSolutions.length > 0) {
            // Hypothesis 1: Root cause + solution pattern
            hypotheses.push({
                name: 'The Hidden Root Cause Mechanism',
                type: 'Unspoken',
                targetPainPoints: topPainPoints.slice(0, 3).map(p => p.name),
                keySymptoms: topSymptoms.slice(0, 3).map(s => s.name),
                problemSide: `Most people focus on symptoms, but the real issue is ${topRootCauses[0]?.text || 'an underlying imbalance'}`,
                solutionSide: `By addressing ${topWorkingSolutions[0]?.solution || 'the root cause'}, you can finally see results`,
                knowledgeGap: 'The connection between the root cause and visible symptoms',
                proofStrategy: 'Show the mechanism of action, cite studies on root cause',
                sampleHook: `Why ${topSymptoms[0]?.name || 'your symptoms'} keeps coming back (hint: it's not what you think)`,
                sampleLead: `Do you experience ${topSymptoms.slice(0, 3).map(s => s.name).join(', ')}?`,
                sources: [...(topRootCauses[0]?.sources || []), ...(topWorkingSolutions[0]?.sources || [])]
            });
        }

        if (mechanismMaterial.failedSolutions.length > 0) {
            // Hypothesis 2: Why past solutions failed
            const topFailed = mechanismMaterial.failedSolutions[0];
            hypotheses.push({
                name: 'The Missing Piece Mechanism',
                type: 'Existing',
                targetPainPoints: topPainPoints.slice(0, 3).map(p => p.name),
                keySymptoms: topSymptoms.slice(0, 3).map(s => s.name),
                problemSide: `${topFailed?.solution || 'Common solutions'} don't work because they only address part of the problem`,
                solutionSide: 'You need to combine the right approach with the missing element',
                knowledgeGap: 'Why single-target solutions fail for multi-factor problems',
                proofStrategy: 'Show clinical evidence of synergistic effects',
                sampleHook: `Why ${topFailed?.solution || 'what you tried'} didn't work for you`,
                sampleLead: `Tried ${topFailed?.solution || 'everything'} but still struggling with ${topSymptoms[0]?.name || 'symptoms'}?`,
                sources: topFailed?.sources || []
            });
        }

        if (symptoms.length > 5) {
            // Hypothesis 3: Symptom cluster mechanism
            hypotheses.push({
                name: 'The Connected Symptoms Mechanism',
                type: 'Transubstantiated',
                targetPainPoints: topPainPoints.slice(0, 3).map(p => p.name),
                keySymptoms: topSymptoms.slice(0, 5).map(s => s.name),
                problemSide: `Your ${topSymptoms.slice(0, 3).map(s => s.name).join(', ')} aren't separate problems—they're connected`,
                solutionSide: 'Address the common thread and all symptoms improve together',
                knowledgeGap: 'The hidden connection between seemingly unrelated symptoms',
                proofStrategy: 'Map out the physiological pathway connecting symptoms',
                sampleHook: `The surprising link between ${topSymptoms[0]?.name} and ${topSymptoms[1]?.name}`,
                sampleLead: `Do you notice your ${topSymptoms[0]?.name} gets worse when your ${topSymptoms[1]?.name} flares up?`,
                sources: []
            });
        }

        return hypotheses;
    }

    /**
     * Enrich source log with analysis value
     */
    _enrichSourceLog(sourceLog, posts) {
        return sourceLog.map(item => {
            const post = posts.find(p => p.url === item.url);
            if (!post) return item;

            const allText = [post.title, post.selftext, ...post.comments.map(c => c.body)].join(' ');
            const hasRootCause = /(?:root cause|real reason|underlying|the key)/i.test(allText);
            const hasSolution = /(?:finally worked|game changer|breakthrough|helped me)/i.test(allText);
            const hasSymptoms = /(?:symptoms|experience|feel|suffering)/i.test(allText);

            let analysisValue = [];
            if (hasRootCause) analysisValue.push('Mechanism');
            if (hasSolution) analysisValue.push('Solution');
            if (hasSymptoms) analysisValue.push('Symptoms');

            return {
                ...item,
                analysisValue: analysisValue.length > 0 ? analysisValue.join('/') : item.value,
                commentCount: post.comments.length,
                totalEngagement: post.score + post.comments.reduce((sum, c) => sum + c.score, 0)
            };
        }).sort((a, b) => b.totalEngagement - a.totalEngagement);
    }

    /**
     * Compile the final report
     */
    _compileReport(data) {
        const { metadata, painPoints, symptoms, symptomClusters, mechanismMaterial, copyBank, hypotheses, sourceLog } = data;

        return {
            metadata: {
                ...metadata,
                analysisCompletedAt: new Date().toISOString()
            },

            summary: {
                totalPainPoints: painPoints.length,
                totalSymptoms: symptoms.length,
                totalClusters: symptomClusters.length,
                topPainPoint: painPoints[0]?.name || 'N/A',
                topSymptom: symptoms[0]?.name || 'N/A',
                hypothesesGenerated: hypotheses.length
            },

            painPointAnalysis: {
                priorityRanking: painPoints.slice(0, 10).map((p, i) => ({
                    rank: i + 1,
                    name: p.name,
                    priorityScore: p.priorityScore,
                    volumeScore: p.volumeScore,
                    emotionalScore: p.emotionalScore,
                    threadCount: p.threadCount,
                    sampleQuotes: p.sampleQuotes.slice(0, 3)
                })),
                fullList: painPoints
            },

            symptomAnalysis: {
                topSymptoms: symptoms.slice(0, 15).map(s => ({
                    name: s.name,
                    category: s.category,
                    frequency: s.frequency,
                    samplePhrases: s.samplePhrases.slice(0, 3)
                })),
                clusters: symptomClusters.slice(0, 10),
                hookBank: symptoms.slice(0, 10).map(s => ({
                    symptom: s.name,
                    hookIdea: `Do you experience ${s.name.toLowerCase()}?`,
                    frequency: s.frequency
                }))
            },

            mechanismMaterial: {
                rootCauses: mechanismMaterial.rootCauses.slice(0, 15),
                failedSolutions: mechanismMaterial.failedSolutions.slice(0, 15),
                workingSolutions: mechanismMaterial.workingSolutions.slice(0, 15),
                beliefs: mechanismMaterial.beliefs.slice(0, 10),
                skepticisms: mechanismMaterial.skepticisms.slice(0, 10)
            },

            copyBank: {
                symptomPhrases: copyBank.symptomPhrases.slice(0, 15),
                problemPhrases: copyBank.problemPhrases.slice(0, 15),
                desirePhrases: copyBank.desirePhrases.slice(0, 15),
                objectionPhrases: copyBank.objectionPhrases.slice(0, 10)
            },

            mechanismHypotheses: hypotheses,

            sourceLog: {
                topThreads: sourceLog.slice(0, 20),
                byValue: {
                    mechanism: sourceLog.filter(s => s.analysisValue?.includes('Mechanism')).slice(0, 10),
                    solution: sourceLog.filter(s => s.analysisValue?.includes('Solution')).slice(0, 10),
                    symptoms: sourceLog.filter(s => s.analysisValue?.includes('Symptoms')).slice(0, 10)
                },
                fullLog: sourceLog
            }
        };
    }
}

module.exports = new AnalysisService();
