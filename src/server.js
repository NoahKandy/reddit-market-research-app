/**
 * Reddit Market Research App - Main Server
 */

// Load environment variables from .env file FIRST
// Use override: true to replace empty env vars (e.g., from Claude for Desktop)
require('dotenv').config({ override: true });

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const jobManager = require('./services/jobManager');
const claudeService = require('./services/claudeService');

// Reload Claude service API key from environment (ensures dotenv has run)
claudeService.reloadFromEnv();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRoutes);

// Serve frontend for all other routes (Express 5 compatible)
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize and start server
async function start() {
    await jobManager.init();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Reddit Market Research Toolkit                              ║
║   ──────────────────────────────────────                      ║
║                                                               ║
║   Server running at: http://localhost:${PORT}                  ║
║                                                               ║
║   Features:                                                   ║
║   • Subreddit discovery by topic                              ║
║   • Background scraping with progress tracking                ║
║   • Automated mechanism extraction & analysis                 ║
║   • Export to JSON, Markdown, or CSV                          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    });
}

start().catch(console.error);
