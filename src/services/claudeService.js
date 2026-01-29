/**
 * Claude API Service
 * Handles AI-powered analysis using Anthropic's Claude API
 */

const https = require('https');
const { generateExtractionPrompt } = require('./extractionPrompt');

class ClaudeService {
    constructor() {
        // Load API key from environment variable (for deployment)
        // Falls back to session-based key if env var not set
        this.apiKey = process.env.ANTHROPIC_API_KEY || null;
        this.model = 'claude-sonnet-4-20250514'; // Latest Sonnet model
        this.maxTokens = 16000; // Allow long responses for detailed analysis
    }

    /**
     * Reload API key from environment (useful after .env changes)
     */
    reloadFromEnv() {
        if (process.env.ANTHROPIC_API_KEY) {
            this.apiKey = process.env.ANTHROPIC_API_KEY;
        }
    }

    /**
     * Check if API key is configured
     */
    isConfigured() {
        return !!this.apiKey;
    }

    /**
     * Set API key
     */
    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Make a request to Claude API
     */
    async _makeRequest(messages, systemPrompt = null) {
        return new Promise((resolve, reject) => {
            const requestBody = {
                model: this.model,
                max_tokens: this.maxTokens,
                messages: messages
            };

            if (systemPrompt) {
                requestBody.system = systemPrompt;
            }

            const postData = JSON.stringify(requestBody);

            const options = {
                hostname: 'api.anthropic.com',
                port: 443,
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode === 200) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error?.message || `API Error: ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse API response'));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(300000, () => { // 5 minute timeout for long analyses
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Run the full market research extraction analysis
     */
    async analyzeScrapedData(scrapedData, topic, progressCallback = null) {
        if (!this.isConfigured()) {
            throw new Error('Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.');
        }

        if (progressCallback) {
            progressCallback({ phase: 'preparing', message: 'Preparing data for analysis...', percent: 5 });
        }

        // Generate the extraction prompt with scraped data
        const extractionPrompt = generateExtractionPrompt(scrapedData, topic);

        if (progressCallback) {
            progressCallback({ phase: 'analyzing', message: 'Sending to Claude for analysis (this may take 1-2 minutes)...', percent: 20 });
        }

        // Call Claude API
        const response = await this._makeRequest([
            {
                role: 'user',
                content: extractionPrompt
            }
        ], 'You are an expert market researcher specializing in health supplement offers. Your job is to extract actionable insights from Reddit data that can be used to create compelling marketing copy and product positioning. Be thorough, use exact quotes from the data, and follow the extraction framework precisely.');

        if (progressCallback) {
            progressCallback({ phase: 'processing', message: 'Processing analysis results...', percent: 90 });
        }

        // Extract the text content from Claude's response
        const analysisText = response.content[0]?.text || '';

        // Parse the analysis into structured sections
        const structuredAnalysis = this._parseAnalysis(analysisText, scrapedData);

        if (progressCallback) {
            progressCallback({ phase: 'complete', message: 'Analysis complete!', percent: 100 });
        }

        return {
            rawMarkdown: analysisText,
            structured: structuredAnalysis,
            metadata: {
                ...scrapedData.metadata,
                analysisCompletedAt: new Date().toISOString(),
                model: this.model,
                topic: topic
            }
        };
    }

    /**
     * Parse the markdown analysis into structured sections
     */
    _parseAnalysis(analysisText, scrapedData) {
        // Extract sections from the markdown
        const sections = {};

        // Extract Phase 1: Subreddit Mapping
        const phase1Match = analysisText.match(/=== PHASE 1: SUBREDDIT MAPPING ===([\s\S]*?)(?===== PHASE 2|$)/i);
        sections.subredditMapping = phase1Match ? phase1Match[1].trim() : '';

        // Extract Phase 2: Pain Points & Symptoms
        const phase2Match = analysisText.match(/=== PHASE 2: PAIN POINT & SYMPTOM EXTRACTION ===([\s\S]*?)(?===== PHASE 3|$)/i);
        sections.painPointsAndSymptoms = phase2Match ? phase2Match[1].trim() : '';

        // Extract Phase 3: Mechanism Extraction
        const phase3Match = analysisText.match(/=== PHASE 3: MECHANISM EXTRACTION ===([\s\S]*?)(?===== PHASE 4|$)/i);
        sections.mechanismExtraction = phase3Match ? phase3Match[1].trim() : '';

        // Extract Phase 4: Language Mining
        const phase4Match = analysisText.match(/=== PHASE 4: LANGUAGE MINING ===([\s\S]*?)(?===== PHASE 5|$)/i);
        sections.languageMining = phase4Match ? phase4Match[1].trim() : '';

        // Extract Phase 5: Synthesis
        const phase5Match = analysisText.match(/=== PHASE 5: SYNTHESIS & PRIORITIZATION ===([\s\S]*?)(?===== PHASE 6|$)/i);
        sections.synthesis = phase5Match ? phase5Match[1].trim() : '';

        // Extract Phase 6: Hypotheses
        const phase6Match = analysisText.match(/=== PHASE 6: HYPOTHESIS OUTPUT ===([\s\S]*?)(?===== PHASE 7|$)/i);
        sections.hypotheses = phase6Match ? phase6Match[1].trim() : '';

        // Extract Phase 7: Source Log
        const phase7Match = analysisText.match(/=== PHASE 7: OUTPUT SOURCE LOG ===([\s\S]*?)$/i);
        sections.sourceLog = phase7Match ? phase7Match[1].trim() : '';

        // Extract pain points from the analysis
        const painPoints = this._extractPainPoints(sections.painPointsAndSymptoms);

        // Extract mechanism hypotheses
        const hypotheses = this._extractHypotheses(sections.hypotheses);

        return {
            sections,
            painPoints,
            hypotheses,
            totalPosts: scrapedData.metadata.totalPosts,
            totalComments: scrapedData.metadata.totalComments
        };
    }

    /**
     * Extract pain points from the pain points section
     */
    _extractPainPoints(text) {
        const painPoints = [];
        const painPointRegex = /### PAIN POINT #(\d+): ([^\n]+)([\s\S]*?)(?=### PAIN POINT #|$)/gi;

        let match;
        while ((match = painPointRegex.exec(text)) !== null) {
            const content = match[3];

            // Extract scores
            const volumeMatch = content.match(/VOLUME SCORE:\s*(\d+)/i);
            const emotionalMatch = content.match(/EMOTIONAL CHARGE SCORE:\s*(\d+)/i);
            const priorityMatch = content.match(/PAIN POINT PRIORITY SCORE:\s*([\d.]+)/i);

            painPoints.push({
                number: parseInt(match[1]),
                name: match[2].trim(),
                volumeScore: volumeMatch ? parseInt(volumeMatch[1]) : 0,
                emotionalScore: emotionalMatch ? parseInt(emotionalMatch[1]) : 0,
                priorityScore: priorityMatch ? parseFloat(priorityMatch[1]) : 0,
                content: content.trim()
            });
        }

        return painPoints.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    /**
     * Extract mechanism hypotheses from the hypotheses section
     */
    _extractHypotheses(text) {
        const hypotheses = [];
        const hypothesisRegex = /MECHANISM HYPOTHESIS #(\d+)([\s\S]*?)(?=MECHANISM HYPOTHESIS #|$)/gi;

        let match;
        while ((match = hypothesisRegex.exec(text)) !== null) {
            const content = match[2];

            // Extract key fields
            const nameMatch = content.match(/- Name:\s*([^\n]+)/i);
            const typeMatch = content.match(/- Type:\s*([^\n]+)/i);
            const targetMatch = content.match(/- TARGET PAIN POINT\(S\):\s*([^\n]+)/i);
            const hookMatch = content.match(/- Sample Hook:\s*([^\n]+)/i);
            const leadMatch = content.match(/- Sample "Do You Experience\.\.\." Lead:\s*([^\n]+)/i);

            hypotheses.push({
                number: parseInt(match[1]),
                name: nameMatch ? nameMatch[1].trim() : `Hypothesis #${match[1]}`,
                type: typeMatch ? typeMatch[1].trim() : 'Unknown',
                targetPainPoints: targetMatch ? targetMatch[1].trim() : '',
                sampleHook: hookMatch ? hookMatch[1].trim() : '',
                sampleLead: leadMatch ? leadMatch[1].trim() : '',
                content: content.trim()
            });
        }

        return hypotheses;
    }
}

module.exports = new ClaudeService();
