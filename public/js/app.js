/**
 * Reddit Market Research App - Frontend JavaScript
 */

class RedditResearchApp {
    constructor() {
        this.selectedSubreddits = new Set();
        this.currentJobId = null;
        this.pollInterval = null;
        this.discoveredSubreddits = [];

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadJobs();
    }

    bindEvents() {
        // Discovery
        document.getElementById('discover-btn').addEventListener('click', () => this.discoverSubreddits());
        document.getElementById('topic-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.discoverSubreddits();
        });
        document.getElementById('select-all-btn').addEventListener('click', () => this.selectTopSubreddits());
        document.getElementById('proceed-to-config-btn').addEventListener('click', () => this.showConfigSection());

        // Configuration
        document.getElementById('back-to-discovery-btn').addEventListener('click', () => this.showDiscoverySection());
        document.getElementById('start-scrape-btn').addEventListener('click', () => this.startScraping());

        // Analysis
        document.getElementById('start-analysis-btn').addEventListener('click', () => this.startAnalysis());

        // Export
        document.getElementById('export-json-btn').addEventListener('click', () => this.exportResults('json'));
        document.getElementById('export-md-btn').addEventListener('click', () => this.exportResults('markdown'));
        document.getElementById('export-csv-btn').addEventListener('click', () => this.exportResults('csv'));

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Job history
        document.getElementById('refresh-jobs-btn').addEventListener('click', () => this.loadJobs());
    }

    // ====================
    // Discovery Functions
    // ====================

    async discoverSubreddits() {
        const topic = document.getElementById('topic-input').value.trim();
        if (!topic) {
            alert('Please enter a topic to search');
            return;
        }

        const btn = document.getElementById('discover-btn');
        const loading = document.getElementById('discovery-loading');
        const results = document.getElementById('discovery-results');

        btn.disabled = true;
        loading.classList.remove('hidden');
        results.classList.add('hidden');

        try {
            const response = await fetch(`/api/discover?topic=${encodeURIComponent(topic)}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.discoveredSubreddits = data.subreddits;
            this.renderSubreddits(data.subreddits);

            loading.classList.add('hidden');
            results.classList.remove('hidden');
            document.getElementById('subreddit-count').textContent = data.count;

        } catch (err) {
            alert('Error discovering subreddits: ' + err.message);
            loading.classList.add('hidden');
        } finally {
            btn.disabled = false;
        }
    }

    renderSubreddits(subreddits) {
        const grid = document.getElementById('subreddit-grid');
        grid.innerHTML = '';

        subreddits.forEach(sub => {
            const card = document.createElement('div');
            card.className = 'subreddit-card';
            card.dataset.name = sub.name;

            if (this.selectedSubreddits.has(sub.name)) {
                card.classList.add('selected');
            }

            card.innerHTML = `
                <div class="checkbox">${this.selectedSubreddits.has(sub.name) ? '✓' : ''}</div>
                <div class="subreddit-name">r/${sub.name}</div>
                <div class="subreddit-title">${this.escapeHtml(sub.title || sub.name)}</div>
                <div class="subreddit-stats">
                    <span>👥 ${this.formatNumber(sub.subscribers)} members</span>
                    <span>📊 Rank #${sub.rank}</span>
                </div>
            `;

            card.addEventListener('click', () => this.toggleSubreddit(sub.name));
            grid.appendChild(card);
        });

        this.updateSelectedDisplay();
    }

    toggleSubreddit(name) {
        if (this.selectedSubreddits.has(name)) {
            this.selectedSubreddits.delete(name);
        } else {
            this.selectedSubreddits.add(name);
        }
        this.renderSubreddits(this.discoveredSubreddits);
    }

    selectTopSubreddits() {
        this.selectedSubreddits.clear();
        this.discoveredSubreddits.slice(0, 10).forEach(sub => {
            this.selectedSubreddits.add(sub.name);
        });
        this.renderSubreddits(this.discoveredSubreddits);
    }

    updateSelectedDisplay() {
        const container = document.getElementById('selected-subreddits');
        const proceedBtn = document.getElementById('proceed-to-config-btn');

        container.innerHTML = '';

        if (this.selectedSubreddits.size === 0) {
            container.innerHTML = '<span class="text-muted">No subreddits selected</span>';
            proceedBtn.disabled = true;
            return;
        }

        proceedBtn.disabled = false;

        this.selectedSubreddits.forEach(name => {
            const pill = document.createElement('span');
            pill.className = 'pill';
            pill.innerHTML = `
                r/${name}
                <button onclick="app.toggleSubreddit('${name}')">&times;</button>
            `;
            container.appendChild(pill);
        });
    }

    // ====================
    // Navigation
    // ====================

    setActiveStep(stepNum) {
        document.querySelectorAll('.step').forEach((step, i) => {
            step.classList.remove('active', 'completed');
            if (i + 1 < stepNum) {
                step.classList.add('completed');
            } else if (i + 1 === stepNum) {
                step.classList.add('active');
            }
        });
    }

    showDiscoverySection() {
        this.setActiveStep(1);
        document.getElementById('section-discovery').classList.remove('hidden');
        document.getElementById('section-config').classList.add('hidden');
    }

    showConfigSection() {
        this.setActiveStep(2);
        document.getElementById('section-discovery').classList.add('hidden');
        document.getElementById('section-config').classList.remove('hidden');

        const selectedList = Array.from(this.selectedSubreddits).map(s => `r/${s}`).join(', ');
        document.getElementById('config-selected-subs').textContent = selectedList;
    }

    // ====================
    // Scraping
    // ====================

    async startScraping() {
        const config = {
            subreddits: Array.from(this.selectedSubreddits),
            topic: document.getElementById('topic-input').value.trim(),
            postLimit: parseInt(document.getElementById('post-limit').value),
            commentLimit: parseInt(document.getElementById('comment-limit').value),
            sort: document.getElementById('sort-method').value,
            timeFilter: document.getElementById('time-filter').value
        };

        try {
            const response = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const job = await response.json();

            if (job.error) {
                throw new Error(job.error);
            }

            this.currentJobId = job.id;
            this.setActiveStep(3);

            document.getElementById('section-config').classList.add('hidden');
            document.getElementById('section-scraping').classList.remove('hidden');

            this.pollJobProgress();

        } catch (err) {
            alert('Error starting scrape: ' + err.message);
        }
    }

    pollJobProgress() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/jobs/${this.currentJobId}`);
                const job = await response.json();

                if (job.error) {
                    throw new Error(job.error);
                }

                // Update progress UI
                const progressBar = document.getElementById('scrape-progress-bar');
                const progressText = document.getElementById('scrape-progress-text');

                progressBar.style.width = `${job.progress.percent}%`;
                progressText.textContent = job.progress.message;

                // Check if completed
                if (job.status === 'scraped') {
                    clearInterval(this.pollInterval);
                    this.onScrapingComplete(job);
                } else if (job.status === 'failed') {
                    clearInterval(this.pollInterval);
                    alert('Scraping failed: ' + job.error);
                }

                this.loadJobs();

            } catch (err) {
                console.error('Poll error:', err);
            }
        }, 2000);
    }

    onScrapingComplete(job) {
        this.setActiveStep(4);

        document.getElementById('section-scraping').classList.add('hidden');
        document.getElementById('section-analysis').classList.remove('hidden');
        document.getElementById('analysis-ready').classList.remove('hidden');
        document.getElementById('analysis-progress').classList.add('hidden');

        document.getElementById('scrape-summary').textContent =
            `Scraped ${job.result.totalPosts} posts and ${job.result.totalComments} comments from ${job.result.subreddits.length} subreddits.`;
    }

    // ====================
    // Analysis
    // ====================

    async startAnalysis() {
        try {
            const response = await fetch(`/api/jobs/${this.currentJobId}/analyze`, {
                method: 'POST'
            });

            const job = await response.json();

            if (job.error) {
                throw new Error(job.error);
            }

            document.getElementById('analysis-ready').classList.add('hidden');
            document.getElementById('analysis-progress').classList.remove('hidden');

            this.pollAnalysisProgress();

        } catch (err) {
            alert('Error starting analysis: ' + err.message);
        }
    }

    pollAnalysisProgress() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/jobs/${this.currentJobId}`);
                const job = await response.json();

                const progressBar = document.getElementById('analysis-progress-bar');
                const progressText = document.getElementById('analysis-progress-text');

                progressBar.style.width = `${job.progress.percent}%`;
                progressText.textContent = job.progress.message;

                if (job.status === 'analyzed') {
                    clearInterval(this.pollInterval);
                    this.onAnalysisComplete();
                } else if (job.status === 'analysis_failed') {
                    clearInterval(this.pollInterval);
                    alert('Analysis failed: ' + job.error);
                }

                this.loadJobs();

            } catch (err) {
                console.error('Poll error:', err);
            }
        }, 1000);
    }

    async onAnalysisComplete() {
        this.setActiveStep(5);

        document.getElementById('section-analysis').classList.add('hidden');
        document.getElementById('section-results').classList.remove('hidden');

        // Load and display results
        const response = await fetch(`/api/jobs/${this.currentJobId}/analysis`);
        const analysis = await response.json();

        this.renderResults(analysis);
    }

    // ====================
    // Results Rendering
    // ====================

    renderResults(analysis) {
        // Summary
        const summary = document.getElementById('results-summary');
        summary.innerHTML = `
            <div class="alert alert-success">
                <strong>Analysis Complete!</strong>
                Found ${analysis.summary.totalPainPoints} pain points,
                ${analysis.summary.totalSymptoms} symptoms,
                and generated ${analysis.summary.hypothesesGenerated} mechanism hypotheses.
            </div>
        `;

        // Pain Points
        this.renderPainPoints(analysis.painPointAnalysis.priorityRanking);

        // Symptoms
        this.renderSymptoms(analysis.symptomAnalysis);

        // Mechanisms
        this.renderMechanisms(analysis.mechanismMaterial);

        // Hypotheses
        this.renderHypotheses(analysis.mechanismHypotheses);

        // Copy Bank
        this.renderCopyBank(analysis.copyBank);

        // Sources
        this.renderSources(analysis.sourceLog.topThreads);
    }

    renderPainPoints(painPoints) {
        const tbody = document.querySelector('#pain-points-table tbody');
        tbody.innerHTML = '';

        painPoints.forEach(pp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${pp.rank}</td>
                <td><strong>${this.escapeHtml(pp.name)}</strong></td>
                <td><span class="score-badge ${this.getScoreClass(pp.priorityScore)}">${pp.priorityScore}</span></td>
                <td>${pp.volumeScore}</td>
                <td>${pp.emotionalScore}</td>
                <td>${pp.threadCount}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderSymptoms(symptomAnalysis) {
        const tbody = document.querySelector('#symptoms-table tbody');
        tbody.innerHTML = '';

        symptomAnalysis.topSymptoms.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${this.escapeHtml(s.name)}</strong></td>
                <td><span class="category-badge">${s.category}</span></td>
                <td>${s.frequency}</td>
                <td class="text-muted">${s.samplePhrases[0] ? this.escapeHtml(s.samplePhrases[0]) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        // Clusters
        const clusterContainer = document.getElementById('symptom-clusters');
        clusterContainer.innerHTML = '';

        symptomAnalysis.clusters.forEach(cluster => {
            const div = document.createElement('div');
            div.className = 'copy-card';
            div.innerHTML = `
                <strong>${this.escapeHtml(cluster.name)}</strong>
                <p class="text-muted mt-1">Frequency: ${cluster.frequency} occurrences</p>
                <p class="text-muted">${cluster.symptoms.join(' + ')}</p>
            `;
            clusterContainer.appendChild(div);
        });
    }

    renderMechanisms(mechanismMaterial) {
        // Root Causes
        const rootCausesList = document.getElementById('root-causes-list');
        rootCausesList.innerHTML = '';
        mechanismMaterial.rootCauses.slice(0, 10).forEach(item => {
            rootCausesList.innerHTML += `
                <div class="copy-card">
                    <blockquote>${this.escapeHtml(item.text)}</blockquote>
                    <p class="source">Mentioned ${item.frequency}x</p>
                </div>
            `;
        });

        // Failed Solutions
        const failedList = document.getElementById('failed-solutions-list');
        failedList.innerHTML = '';
        mechanismMaterial.failedSolutions.slice(0, 10).forEach(item => {
            failedList.innerHTML += `
                <div class="copy-card">
                    <blockquote>${this.escapeHtml(item.solution)}</blockquote>
                    <p class="source">Mentioned ${item.frequency}x</p>
                </div>
            `;
        });

        // Working Solutions
        const workingList = document.getElementById('working-solutions-list');
        workingList.innerHTML = '';
        mechanismMaterial.workingSolutions.slice(0, 10).forEach(item => {
            workingList.innerHTML += `
                <div class="copy-card">
                    <blockquote>${this.escapeHtml(item.solution)}</blockquote>
                    <p class="source">Mentioned ${item.frequency}x</p>
                </div>
            `;
        });
    }

    renderHypotheses(hypotheses) {
        const container = document.getElementById('hypotheses-list');
        container.innerHTML = '';

        hypotheses.forEach((h, i) => {
            container.innerHTML += `
                <div class="hypothesis-card">
                    <h4>Hypothesis #${i + 1}: ${this.escapeHtml(h.name)}</h4>
                    <span class="type-badge">${h.type}</span>

                    <dl>
                        <dt>Target Pain Points</dt>
                        <dd>${h.targetPainPoints.map(p => this.escapeHtml(p)).join(', ')}</dd>

                        <dt>Key Symptoms</dt>
                        <dd>${h.keySymptoms.map(s => this.escapeHtml(s)).join(', ')}</dd>

                        <dt>Problem Side</dt>
                        <dd>${this.escapeHtml(h.problemSide)}</dd>

                        <dt>Solution Side</dt>
                        <dd>${this.escapeHtml(h.solutionSide)}</dd>

                        <dt>Knowledge Gap</dt>
                        <dd>${this.escapeHtml(h.knowledgeGap)}</dd>

                        <dt>Sample Hook</dt>
                        <dd><strong>"${this.escapeHtml(h.sampleHook)}"</strong></dd>

                        <dt>Sample Lead</dt>
                        <dd><em>"${this.escapeHtml(h.sampleLead)}"</em></dd>
                    </dl>
                </div>
            `;
        });
    }

    renderCopyBank(copyBank) {
        // Symptom Phrases
        const symptomList = document.getElementById('symptom-phrases-list');
        symptomList.innerHTML = '';
        copyBank.symptomPhrases.forEach(p => {
            symptomList.innerHTML += `
                <div class="copy-card">
                    <blockquote>${this.escapeHtml(p.phrase)}</blockquote>
                </div>
            `;
        });

        // Problem Phrases
        const problemList = document.getElementById('problem-phrases-list');
        problemList.innerHTML = '';
        copyBank.problemPhrases.forEach(p => {
            problemList.innerHTML += `
                <div class="copy-card">
                    <blockquote>${this.escapeHtml(p.phrase)}</blockquote>
                </div>
            `;
        });

        // Desire Phrases
        const desireList = document.getElementById('desire-phrases-list');
        desireList.innerHTML = '';
        copyBank.desirePhrases.forEach(p => {
            desireList.innerHTML += `
                <div class="copy-card">
                    <blockquote>${this.escapeHtml(p.phrase)}</blockquote>
                </div>
            `;
        });
    }

    renderSources(sources) {
        const tbody = document.querySelector('#sources-table tbody');
        tbody.innerHTML = '';

        sources.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.index}</td>
                <td><a href="${s.url}" target="_blank">${this.escapeHtml(s.title)}</a></td>
                <td>${s.subreddit}</td>
                <td>${s.score}</td>
                <td><span class="category-badge">${s.analysisValue || s.value}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ====================
    // Tabs
    // ====================

    switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');
    }

    // ====================
    // Export
    // ====================

    async exportResults(format) {
        if (!this.currentJobId) {
            alert('No job selected');
            return;
        }

        window.open(`/api/jobs/${this.currentJobId}/export?format=${format}`, '_blank');
    }

    // ====================
    // Job History
    // ====================

    async loadJobs() {
        try {
            const response = await fetch('/api/jobs');
            const data = await response.json();

            this.renderJobList(data.jobs);
        } catch (err) {
            console.error('Error loading jobs:', err);
        }
    }

    renderJobList(jobs) {
        const list = document.getElementById('job-list');

        if (jobs.length === 0) {
            list.innerHTML = '<li class="empty-state">No jobs yet. Start by discovering subreddits above.</li>';
            return;
        }

        list.innerHTML = '';

        jobs.forEach(job => {
            const li = document.createElement('li');
            li.className = 'job-item';

            const statusClass = `status-${job.status.replace('_', '-')}`;
            const date = new Date(job.createdAt).toLocaleString();

            li.innerHTML = `
                <div class="job-info">
                    <h4>${this.escapeHtml(job.config.topic || job.config.subreddits.join(', '))}</h4>
                    <p>${job.config.subreddits.length} subreddits • ${job.config.postLimit} posts/sub • ${date}</p>
                </div>
                <div class="job-status">
                    <span class="status-dot ${statusClass}"></span>
                    <span>${this.formatStatus(job.status)}</span>
                    ${job.status === 'analyzed' ? `<button class="btn btn-sm btn-secondary" onclick="app.viewJob('${job.id}')">View</button>` : ''}
                </div>
            `;

            list.appendChild(li);
        });
    }

    async viewJob(jobId) {
        this.currentJobId = jobId;

        const response = await fetch(`/api/jobs/${jobId}/analysis`);
        const analysis = await response.json();

        if (analysis.error) {
            alert('Could not load analysis: ' + analysis.error);
            return;
        }

        // Show results section
        document.getElementById('section-discovery').classList.add('hidden');
        document.getElementById('section-config').classList.add('hidden');
        document.getElementById('section-scraping').classList.add('hidden');
        document.getElementById('section-analysis').classList.add('hidden');
        document.getElementById('section-results').classList.remove('hidden');

        this.setActiveStep(5);
        this.renderResults(analysis);
    }

    // ====================
    // Utilities
    // ====================

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatNumber(num) {
        if (!num) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    formatStatus(status) {
        const statuses = {
            'pending': 'Pending',
            'running': 'Scraping...',
            'scraped': 'Ready for Analysis',
            'analyzing': 'Analyzing...',
            'analyzed': 'Complete',
            'failed': 'Failed',
            'analysis_failed': 'Analysis Failed'
        };
        return statuses[status] || status;
    }

    getScoreClass(score) {
        if (score >= 7) return 'score-high';
        if (score >= 4) return 'score-medium';
        return 'score-low';
    }
}

// Initialize app
const app = new RedditResearchApp();
