/**
 * API Routes for Reddit Market Research App
 */

const express = require('express');
const router = express.Router();
const redditService = require('../services/redditService');
const jobManager = require('../services/jobManager');
const path = require('path');
const fs = require('fs').promises;

/**
 * GET /api/discover
 * Discover subreddits related to a topic
 */
router.get('/discover', async (req, res) => {
    try {
        const { topic } = req.query;
        if (!topic) {
            return res.status(400).json({ error: 'Topic parameter required' });
        }

        const subreddits = await redditService.discoverSubreddits(topic);
        res.json({
            topic,
            count: subreddits.length,
            subreddits
        });
    } catch (err) {
        console.error('Discovery error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/jobs
 * Create a new scraping job
 */
router.post('/jobs', async (req, res) => {
    try {
        const { subreddits, topic, postLimit, commentLimit, sort, timeFilter } = req.body;

        if (!subreddits || !Array.isArray(subreddits) || subreddits.length === 0) {
            return res.status(400).json({ error: 'At least one subreddit required' });
        }

        const job = jobManager.createJob({
            subreddits,
            topic: topic || subreddits.join(', '),
            postLimit: postLimit || 50,
            commentLimit: commentLimit || 50,
            sort: sort || 'top',
            timeFilter: timeFilter || 'year'
        });

        // Start the job immediately
        await jobManager.startJob(job.id);

        res.status(201).json(job);
    } catch (err) {
        console.error('Job creation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/jobs
 * List all jobs
 */
router.get('/jobs', (req, res) => {
    const jobs = jobManager.getAllJobs();
    res.json({ jobs });
});

/**
 * GET /api/jobs/:id
 * Get job status
 */
router.get('/jobs/:id', (req, res) => {
    const job = jobManager.getJob(req.params.id);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
});

/**
 * POST /api/jobs/:id/analyze
 * Start analysis on a scraped job
 */
router.post('/jobs/:id/analyze', async (req, res) => {
    try {
        const job = await jobManager.startAnalysis(req.params.id);
        res.json(job);
    } catch (err) {
        console.error('Analysis start error:', err);
        res.status(400).json({ error: err.message });
    }
});

/**
 * GET /api/jobs/:id/data
 * Get scraped data for a job
 */
router.get('/jobs/:id/data', async (req, res) => {
    try {
        const data = await jobManager.getScrapedData(req.params.id);
        if (!data) {
            return res.status(404).json({ error: 'Data not found' });
        }
        res.json(data);
    } catch (err) {
        console.error('Data fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/jobs/:id/analysis
 * Get analysis results for a job
 */
router.get('/jobs/:id/analysis', async (req, res) => {
    try {
        const analysis = await jobManager.getAnalysisResult(req.params.id);
        if (!analysis) {
            return res.status(404).json({ error: 'Analysis not found' });
        }
        res.json(analysis);
    } catch (err) {
        console.error('Analysis fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/jobs/:id/export
 * Export analysis results
 */
router.get('/jobs/:id/export', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const result = await jobManager.exportAnalysis(req.params.id, format);

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

        const content = await fs.readFile(result.filePath, 'utf-8');
        res.send(content);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/jobs/:id
 * Delete a job
 */
router.delete('/jobs/:id', async (req, res) => {
    try {
        const deleted = await jobManager.deleteJob(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Job not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
