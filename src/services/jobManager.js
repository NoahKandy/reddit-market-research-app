/**
 * Job Manager - Handles background scraping and analysis jobs
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const redditService = require('./redditService');
const claudeService = require('./claudeService');

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
                timeFilter: config.timeFilter || 'year',
                keywords: config.keywords || [],
                matchAll: config.matchAll || false
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
            const { subreddits, postLimit, commentLimit, sort, timeFilter, keywords, matchAll } = job.config;

            // Scrape data (with optional keyword filtering)
            const scrapedData = await redditService.scrapeSubreddits(
                subreddits,
                { sort, timeFilter, postLimit, commentLimit, keywords, matchAll },
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
     * Internal: Run the analysis job using Claude API
     */
    async _runAnalysisJob(job) {
        try {
            // Check if Claude API is configured
            if (!claudeService.isConfigured()) {
                throw new Error('Claude API key not configured. Please set your API key in settings.');
            }

            // Load scraped data
            const dataFilePath = path.join(this.dataDir, job.dataFile);
            const rawData = await fs.readFile(dataFilePath, 'utf-8');
            const scrapedData = JSON.parse(rawData);

            // Run AI-powered analysis using Claude
            const analysisResult = await claudeService.analyzeScrapedData(
                scrapedData,
                job.config.topic,
                (progress) => {
                    job.progress = {
                        phase: progress.phase,
                        message: progress.message,
                        percent: progress.percent
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
            job.analysisResult = {
                painPointsFound: analysisResult.structured.painPoints.length,
                hypothesesGenerated: analysisResult.structured.hypotheses.length,
                totalPosts: analysisResult.structured.totalPosts,
                totalComments: analysisResult.structured.totalComments
            };

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
        const topicSlug = (job.config.topic || 'analysis').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        let fileName, content, contentType;

        switch (format) {
            case 'json':
                fileName = `export_${topicSlug}_${timestamp}.json`;
                content = JSON.stringify(analysis, null, 2);
                contentType = 'application/json';
                break;

            case 'markdown':
                fileName = `export_${topicSlug}_${timestamp}.md`;
                // Use the raw markdown from Claude analysis directly
                content = analysis.rawMarkdown || this._generateMarkdownReport(analysis);
                contentType = 'text/markdown';
                break;

            case 'csv':
                fileName = `export_${topicSlug}_${timestamp}.csv`;
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
     * Generate markdown report (fallback if rawMarkdown not available)
     */
    _generateMarkdownReport(analysis) {
        // If we have rawMarkdown from Claude, use it
        if (analysis.rawMarkdown) {
            return analysis.rawMarkdown;
        }

        // Fallback: generate basic report from structured data
        let md = `# Reddit Market Research Report\n\n`;
        md += `**Generated:** ${analysis.metadata?.analysisCompletedAt || new Date().toISOString()}\n`;
        md += `**Topic:** ${analysis.metadata?.topic || 'N/A'}\n`;
        md += `**Subreddits:** ${(analysis.metadata?.subreddits || []).join(', ')}\n`;
        md += `**Total Posts:** ${analysis.metadata?.totalPosts || 0}\n`;
        md += `**Total Comments:** ${analysis.metadata?.totalComments || 0}\n\n`;

        if (analysis.structured) {
            md += `---\n\n## Pain Points Identified (${analysis.structured.painPoints?.length || 0})\n\n`;
            for (const pp of (analysis.structured.painPoints || [])) {
                md += `### ${pp.number}. ${pp.name}\n`;
                md += `- **Priority Score:** ${pp.priorityScore}\n`;
                md += `- **Volume Score:** ${pp.volumeScore}\n`;
                md += `- **Emotional Score:** ${pp.emotionalScore}\n\n`;
            }

            md += `---\n\n## Mechanism Hypotheses (${analysis.structured.hypotheses?.length || 0})\n\n`;
            for (const h of (analysis.structured.hypotheses || [])) {
                md += `### Hypothesis #${h.number}: ${h.name}\n`;
                md += `- **Type:** ${h.type}\n`;
                md += `- **Target Pain Points:** ${h.targetPainPoints}\n`;
                md += `- **Sample Hook:** ${h.sampleHook}\n`;
                md += `- **Sample Lead:** ${h.sampleLead}\n\n`;
            }
        }

        return md;
    }

    /**
     * Generate CSV export from structured analysis
     */
    _generateCsvExport(analysis) {
        let csv = 'Type,Name,Priority Score,Volume Score,Emotional Score,Details\n';

        // Pain points from structured data
        const painPoints = analysis.structured?.painPoints || [];
        for (const pp of painPoints) {
            const name = (pp.name || '').replace(/"/g, '""');
            csv += `Pain Point,"${name}",${pp.priorityScore || 0},${pp.volumeScore || 0},${pp.emotionalScore || 0},""\n`;
        }

        // Hypotheses
        const hypotheses = analysis.structured?.hypotheses || [];
        for (const h of hypotheses) {
            const name = (h.name || '').replace(/"/g, '""');
            const details = `Type: ${h.type || 'N/A'}, Target: ${(h.targetPainPoints || '').replace(/"/g, '""')}`;
            csv += `Hypothesis,"${name}",,,,${details.replace(/"/g, '""')}\n`;
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
