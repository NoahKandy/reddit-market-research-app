/**
 * Job Manager - Handles background scraping and analysis jobs
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const redditService = require('./redditService');
const analysisService = require('./analysisService');

class JobManager {
    constructor() {
        this.jobs = new Map();
        this.dataDir = path.join(__dirname, '../../data');
        this.exportsDir = path.join(__dirname, '../../exports');
    }

    async init() {
        // Ensure directories exist
        await fs.mkdir(this.dataDir, { recursive: true });
        await fs.mkdir(this.exportsDir, { recursive: true });
    }

    /**
     * Create a new scraping job
     */
    createJob(config) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            type: 'scrape',
            status: 'pending',
            config: {
                subreddits: config.subreddits || [],
                topic: config.topic || '',
                postLimit: config.postLimit || 50,
                commentLimit: config.commentLimit || 50,
                sort: config.sort || 'top',
                timeFilter: config.timeFilter || 'year'
            },
            progress: {
                phase: 'pending',
                message: 'Job created, waiting to start...',
                percent: 0
            },
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            error: null,
            result: null,
            dataFile: null,
            analysisFile: null
        };

        this.jobs.set(jobId, job);
        return job;
    }

    /**
     * Start a scraping job
     */
    async startJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) throw new Error('Job not found');

        job.status = 'running';
        job.startedAt = new Date().toISOString();
        job.progress = { phase: 'starting', message: 'Starting scraper...', percent: 0 };

        // Run in background
        this._runScrapeJob(job).catch(err => {
            job.status = 'failed';
            job.error = err.message;
            job.progress = { phase: 'error', message: err.message, percent: 0 };
        });

        return job;
    }

    /**
     * Internal: Run the scrape job
     */
    async _runScrapeJob(job) {
        try {
            const { subreddits, postLimit, commentLimit, sort, timeFilter } = job.config;

            // Scrape data
            const scrapedData = await redditService.scrapeSubreddits(
                subreddits,
                { sort, timeFilter, postLimit, commentLimit },
                (progress) => {
                    job.progress = {
                        phase: progress.phase,
                        message: progress.message,
                        percent: progress.progress
                    };
                }
            );

            // Save raw data
            const dataFileName = `scrape_${job.id}_${Date.now()}.json`;
            const dataFilePath = path.join(this.dataDir, dataFileName);
            await fs.writeFile(dataFilePath, JSON.stringify(scrapedData, null, 2));
            job.dataFile = dataFileName;

            job.progress = { phase: 'scraped', message: 'Scraping complete!', percent: 100 };
            job.status = 'scraped';
            job.result = {
                totalPosts: scrapedData.metadata.totalPosts,
                totalComments: scrapedData.metadata.totalComments,
                subreddits: scrapedData.metadata.subreddits
            };
            job.completedAt = new Date().toISOString();

        } catch (err) {
            job.status = 'failed';
            job.error = err.message;
            job.progress = { phase: 'error', message: err.message, percent: 0 };
            throw err;
        }
    }

    /**
     * Start analysis on a completed scrape job
     */
    async startAnalysis(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) throw new Error('Job not found');
        if (job.status !== 'scraped' && job.status !== 'analyzed') {
            throw new Error('Job must be in scraped status to analyze');
        }

        job.status = 'analyzing';
        job.progress = { phase: 'analyzing', message: 'Starting analysis...', percent: 0 };

        // Run analysis in background
        this._runAnalysisJob(job).catch(err => {
            job.status = 'analysis_failed';
            job.error = err.message;
            job.progress = { phase: 'error', message: err.message, percent: 0 };
        });

        return job;
    }

    /**
     * Internal: Run the analysis job
     */
    async _runAnalysisJob(job) {
        try {
            // Load scraped data
            const dataFilePath = path.join(this.dataDir, job.dataFile);
            const rawData = await fs.readFile(dataFilePath, 'utf-8');
            const scrapedData = JSON.parse(rawData);

            // Run analysis
            const analysisResult = await analysisService.analyzeData(
                scrapedData,
                (progress) => {
                    job.progress = {
                        phase: progress.phase,
                        message: progress.message,
                        percent: progress.progress
                    };
                }
            );

            // Save analysis result
            const analysisFileName = `analysis_${job.id}_${Date.now()}.json`;
            const analysisFilePath = path.join(this.dataDir, analysisFileName);
            await fs.writeFile(analysisFilePath, JSON.stringify(analysisResult, null, 2));
            job.analysisFile = analysisFileName;

            job.progress = { phase: 'complete', message: 'Analysis complete!', percent: 100 };
            job.status = 'analyzed';
            job.analysisResult = analysisResult.summary;

        } catch (err) {
            job.status = 'analysis_failed';
            job.error = err.message;
            job.progress = { phase: 'error', message: err.message, percent: 0 };
            throw err;
        }
    }

    /**
     * Get job status
     */
    getJob(jobId) {
        return this.jobs.get(jobId);
    }

    /**
     * Get all jobs
     */
    getAllJobs() {
        return Array.from(this.jobs.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Get scraped data for a job
     */
    async getScrapedData(jobId) {
        const job = this.jobs.get(jobId);
        if (!job || !job.dataFile) return null;

        const filePath = path.join(this.dataDir, job.dataFile);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    }

    /**
     * Get analysis result for a job
     */
    async getAnalysisResult(jobId) {
        const job = this.jobs.get(jobId);
        if (!job || !job.analysisFile) return null;

        const filePath = path.join(this.dataDir, job.analysisFile);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    }

    /**
     * Export analysis to various formats
     */
    async exportAnalysis(jobId, format = 'json') {
        const job = this.jobs.get(jobId);
        if (!job || !job.analysisFile) {
            throw new Error('No analysis available for this job');
        }

        const analysis = await this.getAnalysisResult(jobId);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let fileName, content, contentType;

        switch (format) {
            case 'json':
                fileName = `export_${job.config.topic.replace(/\s+/g, '_')}_${timestamp}.json`;
                content = JSON.stringify(analysis, null, 2);
                contentType = 'application/json';
                break;

            case 'markdown':
                fileName = `export_${job.config.topic.replace(/\s+/g, '_')}_${timestamp}.md`;
                content = this._generateMarkdownReport(analysis);
                contentType = 'text/markdown';
                break;

            case 'csv':
                fileName = `export_${job.config.topic.replace(/\s+/g, '_')}_${timestamp}.csv`;
                content = this._generateCsvExport(analysis);
                contentType = 'text/csv';
                break;

            default:
                throw new Error('Unsupported export format');
        }

        const filePath = path.join(this.exportsDir, fileName);
        await fs.writeFile(filePath, content);

        return { fileName, filePath, contentType };
    }

    /**
     * Generate markdown report
     */
    _generateMarkdownReport(analysis) {
        let md = `# Reddit Market Research Report\n\n`;
        md += `**Generated:** ${analysis.metadata.analysisCompletedAt}\n`;
        md += `**Subreddits:** ${analysis.metadata.subreddits.join(', ')}\n`;
        md += `**Total Posts:** ${analysis.metadata.totalPosts}\n`;
        md += `**Total Comments:** ${analysis.metadata.totalComments}\n\n`;

        md += `---\n\n## Summary\n\n`;
        md += `- **Pain Points Identified:** ${analysis.summary.totalPainPoints}\n`;
        md += `- **Symptoms Extracted:** ${analysis.summary.totalSymptoms}\n`;
        md += `- **Symptom Clusters:** ${analysis.summary.totalClusters}\n`;
        md += `- **Top Pain Point:** ${analysis.summary.topPainPoint}\n`;
        md += `- **Top Symptom:** ${analysis.summary.topSymptom}\n\n`;

        md += `---\n\n## Pain Point Priority Ranking\n\n`;
        md += `| Rank | Pain Point | Priority Score | Volume | Emotional |\n`;
        md += `|------|------------|----------------|--------|----------|\n`;
        for (const pp of analysis.painPointAnalysis.priorityRanking) {
            md += `| ${pp.rank} | ${pp.name} | ${pp.priorityScore} | ${pp.volumeScore} | ${pp.emotionalScore} |\n`;
        }

        md += `\n---\n\n## Top Symptoms\n\n`;
        md += `| Symptom | Category | Frequency |\n`;
        md += `|---------|----------|----------|\n`;
        for (const s of analysis.symptomAnalysis.topSymptoms.slice(0, 15)) {
            md += `| ${s.name} | ${s.category} | ${s.frequency} |\n`;
        }

        md += `\n---\n\n## Mechanism Hypotheses\n\n`;
        for (const h of analysis.mechanismHypotheses) {
            md += `### ${h.name}\n\n`;
            md += `**Type:** ${h.type}\n\n`;
            md += `**Target Pain Points:** ${h.targetPainPoints.join(', ')}\n\n`;
            md += `**Key Symptoms:** ${h.keySymptoms.join(', ')}\n\n`;
            md += `**Problem Side:** ${h.problemSide}\n\n`;
            md += `**Solution Side:** ${h.solutionSide}\n\n`;
            md += `**Knowledge Gap:** ${h.knowledgeGap}\n\n`;
            md += `**Sample Hook:** ${h.sampleHook}\n\n`;
            md += `**Sample Lead:** ${h.sampleLead}\n\n`;
            md += `---\n\n`;
        }

        md += `## Copy Bank\n\n`;
        md += `### Symptom Phrases\n\n`;
        for (const p of analysis.copyBank.symptomPhrases.slice(0, 10)) {
            md += `- "${p.phrase}"\n`;
        }

        md += `\n### Problem Phrases\n\n`;
        for (const p of analysis.copyBank.problemPhrases.slice(0, 10)) {
            md += `- "${p.phrase}"\n`;
        }

        md += `\n### Desire Phrases\n\n`;
        for (const p of analysis.copyBank.desirePhrases.slice(0, 10)) {
            md += `- "${p.phrase}"\n`;
        }

        md += `\n---\n\n## Source Log (Top 20 Threads)\n\n`;
        for (const s of analysis.sourceLog.topThreads) {
            md += `${s.index}. [${s.analysisValue}] **${s.title}**\n`;
            md += `   - Score: ${s.score} | Comments: ${s.commentCount}\n`;
            md += `   - ${s.url}\n\n`;
        }

        return md;
    }

    /**
     * Generate CSV export
     */
    _generateCsvExport(analysis) {
        let csv = 'Type,Name,Score,Details,Source\n';

        // Pain points
        for (const pp of analysis.painPointAnalysis.fullList) {
            csv += `Pain Point,"${pp.name}",${pp.priorityScore},"Volume: ${pp.volumeScore}, Emotional: ${pp.emotionalScore}",""\n`;
        }

        // Symptoms
        for (const s of analysis.symptomAnalysis.topSymptoms) {
            csv += `Symptom,"${s.name}",${s.frequency},"Category: ${s.category}",""\n`;
        }

        // Copy phrases
        for (const p of analysis.copyBank.symptomPhrases) {
            csv += `Copy - Symptom,"${p.phrase.replace(/"/g, '""')}",,"","${p.source}"\n`;
        }
        for (const p of analysis.copyBank.problemPhrases) {
            csv += `Copy - Problem,"${p.phrase.replace(/"/g, '""')}",,"","${p.source}"\n`;
        }
        for (const p of analysis.copyBank.desirePhrases) {
            csv += `Copy - Desire,"${p.phrase.replace(/"/g, '""')}",,"","${p.source}"\n`;
        }

        return csv;
    }

    /**
     * Delete a job and its files
     */
    async deleteJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return false;

        // Delete files
        if (job.dataFile) {
            try {
                await fs.unlink(path.join(this.dataDir, job.dataFile));
            } catch (e) { /* ignore */ }
        }
        if (job.analysisFile) {
            try {
                await fs.unlink(path.join(this.dataDir, job.analysisFile));
            } catch (e) { /* ignore */ }
        }

        this.jobs.delete(jobId);
        return true;
    }
}

module.exports = new JobManager();
