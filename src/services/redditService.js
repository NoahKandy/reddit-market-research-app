/**
 * Reddit Service - Handles all Reddit API interactions
 * Uses public JSON endpoints (no API key required)
 */

class RedditService {
    constructor() {
        this.baseUrl = 'https://www.reddit.com';
        this.delay = 2000; // 2 seconds between requests
        this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * Make a request with rate limiting
     */
    async _makeRequest(url) {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (response.status === 200) {
            return await response.json();
        } else if (response.status === 429) {
            throw new Error('Rate limited by Reddit. Please wait a moment.');
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    /**
     * Sleep helper for rate limiting
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Search for subreddits related to a topic
     * Returns list of subreddits sorted by subscriber count
     */
    async discoverSubreddits(topic) {
        const results = [];
        const seen = new Set();

        // Strategy 1: Direct subreddit search
        try {
            const searchUrl = `${this.baseUrl}/subreddits/search.json?q=${encodeURIComponent(topic)}&limit=25`;
            const data = await this._makeRequest(searchUrl);

            if (data?.data?.children) {
                for (const child of data.data.children) {
                    const sub = child.data;
                    if (!seen.has(sub.display_name.toLowerCase())) {
                        seen.add(sub.display_name.toLowerCase());
                        results.push({
                            name: sub.display_name,
                            title: sub.title || sub.display_name,
                            description: sub.public_description || sub.description || '',
                            subscribers: sub.subscribers || 0,
                            activeUsers: sub.accounts_active || 0,
                            url: `https://www.reddit.com/r/${sub.display_name}`,
                            nsfw: sub.over18 || false,
                            relevanceScore: this._calculateRelevance(topic, sub)
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Subreddit search error:', e.message);
        }

        await this._sleep(this.delay);

        // Strategy 2: Search posts and extract subreddits they're in
        try {
            const postSearchUrl = `${this.baseUrl}/search.json?q=${encodeURIComponent(topic)}&limit=100&sort=relevance`;
            const data = await this._makeRequest(postSearchUrl);

            if (data?.data?.children) {
                const subCounts = {};
                for (const child of data.data.children) {
                    const subName = child.data.subreddit;
                    if (!subCounts[subName]) {
                        subCounts[subName] = {
                            count: 0,
                            subscribers: child.data.subreddit_subscribers || 0
                        };
                    }
                    subCounts[subName].count++;
                }

                // Add subreddits found in posts (but with lower relevance unless name matches topic)
                const topicLower = topic.toLowerCase();
                const topicNoSpaces = topicLower.replace(/\s+/g, '');
                const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);

                for (const [name, info] of Object.entries(subCounts)) {
                    if (!seen.has(name.toLowerCase())) {
                        seen.add(name.toLowerCase());
                        const nameLower = name.toLowerCase();

                        // Calculate relevance based on name match to topic
                        let relevance = 30; // Base score for post-found subreddits
                        if (nameLower === topicNoSpaces) {
                            relevance = 100;
                        } else if (nameLower.includes(topicNoSpaces)) {
                            relevance = 80;
                        } else if (topicWords.some(word => nameLower.includes(word))) {
                            relevance = 60;
                        } else {
                            // Generic sub with topic posts - low score based on post count
                            relevance = Math.min(50, 20 + info.count * 5);
                        }

                        results.push({
                            name: name,
                            title: name,
                            description: `Found ${info.count} relevant posts`,
                            subscribers: info.subscribers,
                            activeUsers: 0,
                            url: `https://www.reddit.com/r/${name}`,
                            nsfw: false,
                            relevanceScore: relevance
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Post search error:', e.message);
        }

        // Calculate combined score: heavily weight relevance, but also consider volume
        results.forEach(r => {
            // Normalize subscribers to 0-100 scale (log scale for fairness)
            const volumeNorm = r.subscribers > 0 ? Math.min(100, Math.log10(r.subscribers) * 15) : 0;
            // Combined: 70% relevance, 30% volume
            r.combinedScore = (r.relevanceScore * 0.7) + (volumeNorm * 0.3);
        });

        // Sort by combined score (relevance-weighted) descending
        results.sort((a, b) => b.combinedScore - a.combinedScore);

        // Add rank
        return results.map((r, i) => ({ ...r, rank: i + 1 }));
    }

    /**
     * Calculate relevance score based on topic match
     */
    _calculateRelevance(topic, subreddit) {
        const topicLower = topic.toLowerCase();
        const topicWords = topicLower.split(/\s+/);
        const topicNoSpaces = topicLower.replace(/\s+/g, '');
        const nameLower = subreddit.display_name.toLowerCase();
        const titleLower = (subreddit.title || '').toLowerCase();
        const descLower = (subreddit.public_description || '').toLowerCase();

        let score = 20; // Lower base score

        // Exact name match (highest priority)
        if (nameLower === topicNoSpaces) {
            score += 80;
        }
        // Name contains full topic
        else if (nameLower.includes(topicNoSpaces)) {
            score += 60;
        }
        // Name contains any word from topic (e.g., "gut" or "health")
        else if (topicWords.some(word => word.length > 3 && nameLower.includes(word))) {
            score += 40;
        }
        // Title contains full topic
        else if (titleLower.includes(topicLower)) {
            score += 30;
        }
        // Description contains full topic
        else if (descLower.includes(topicLower)) {
            score += 20;
        }
        // Description contains any word from topic
        else if (topicWords.some(word => word.length > 3 && descLower.includes(word))) {
            score += 10;
        }

        // Related terms bonus for health topics
        const healthRelatedTerms = ['ibs', 'sibo', 'microbiome', 'probiotic', 'digest', 'fodmap', 'bloat', 'constip', 'nutriti'];
        if (healthRelatedTerms.some(term => nameLower.includes(term) || descLower.includes(term))) {
            score += 25;
        }

        // Small subscriber bonus (don't let huge generic subs dominate)
        if (subreddit.subscribers > 10000 && subreddit.subscribers < 500000) score += 10;
        else if (subreddit.subscribers > 1000) score += 5;

        return Math.min(100, score);
    }

    /**
     * Get posts from a subreddit
     */
    async getPosts(subreddit, options = {}) {
        const {
            sort = 'top',
            timeFilter = 'year',
            limit = 50
        } = options;

        const posts = [];
        let after = null;
        let fetched = 0;

        while (fetched < limit) {
            const batchLimit = Math.min(100, limit - fetched);
            let url = `${this.baseUrl}/r/${subreddit}/${sort}.json?t=${timeFilter}&limit=${batchLimit}`;

            if (after) {
                url += `&after=${after}`;
            }

            try {
                await this._sleep(this.delay);
                const data = await this._makeRequest(url);

                if (!data?.data?.children?.length) {
                    break;
                }

                for (const child of data.data.children) {
                    const post = child.data;
                    posts.push({
                        id: post.id,
                        title: post.title,
                        selftext: post.selftext || '',
                        score: post.score || 0,
                        upvoteRatio: post.upvote_ratio || 0,
                        numComments: post.num_comments || 0,
                        createdUtc: post.created_utc,
                        author: post.author,
                        permalink: post.permalink,
                        url: `https://www.reddit.com${post.permalink}`,
                        subreddit: subreddit,
                        flair: post.link_flair_text,
                        comments: []
                    });
                    fetched++;
                    if (fetched >= limit) break;
                }

                after = data.data.after;
                if (!after) break;

            } catch (e) {
                console.error(`Error fetching posts from r/${subreddit}:`, e.message);
                break;
            }
        }

        return posts;
    }

    /**
     * Get comments for a post
     */
    async getComments(permalink, limit = 50) {
        const url = `${this.baseUrl}${permalink}.json?limit=${limit}&sort=top`;

        try {
            await this._sleep(this.delay);
            const data = await this._makeRequest(url);

            if (!data || data.length < 2) {
                return [];
            }

            const comments = [];
            const commentData = data[1]?.data?.children || [];

            for (const child of commentData) {
                if (child.kind !== 't1') continue;

                const c = child.data;
                const comment = {
                    id: c.id,
                    body: c.body || '',
                    score: c.score || 0,
                    author: c.author,
                    createdUtc: c.created_utc,
                    replies: []
                };

                // Get nested replies (one level)
                if (c.replies?.data?.children) {
                    for (const reply of c.replies.data.children.slice(0, 5)) {
                        if (reply.kind !== 't1') continue;
                        const r = reply.data;
                        comment.replies.push({
                            id: r.id,
                            body: r.body || '',
                            score: r.score || 0,
                            author: r.author
                        });
                    }
                }

                comments.push(comment);
                if (comments.length >= limit) break;
            }

            return comments;
        } catch (e) {
            console.error('Error fetching comments:', e.message);
            return [];
        }
    }

    /**
     * Assess post value for extraction
     */
    assessPostValue(post) {
        const text = (post.title + ' ' + post.selftext).toLowerCase();

        const problemKeywords = ['help', 'struggling', 'nothing works', 'frustrated',
            'tried everything', 'why', "can't", "won't", 'failed', 'desperate'];
        const solutionKeywords = ['finally', 'fixed', 'worked', 'helped', 'cured',
            'success', 'recommend', 'game changer', 'life saver', 'breakthrough'];

        const hasProblem = problemKeywords.some(kw => text.includes(kw));
        const hasSolution = solutionKeywords.some(kw => text.includes(kw));

        if (hasProblem && hasSolution) return 'Both';
        if (hasSolution) return 'Solution';
        if (hasProblem) return 'Problem';
        return 'General';
    }

    /**
     * Full scrape of multiple subreddits
     */
    async scrapeSubreddits(subreddits, options = {}, progressCallback = null) {
        const {
            sort = 'top',
            timeFilter = 'year',
            postLimit = 50,
            commentLimit = 50
        } = options;

        const allPosts = [];
        const sourceLog = [];
        let totalProgress = 0;
        const totalWork = subreddits.length * postLimit;

        for (const subreddit of subreddits) {
            if (progressCallback) {
                progressCallback({
                    phase: 'posts',
                    subreddit,
                    message: `Fetching posts from r/${subreddit}...`,
                    progress: Math.round((totalProgress / totalWork) * 100)
                });
            }

            const posts = await this.getPosts(subreddit, { sort, timeFilter, limit: postLimit });

            for (let i = 0; i < posts.length; i++) {
                const post = posts[i];

                if (progressCallback) {
                    progressCallback({
                        phase: 'comments',
                        subreddit,
                        postIndex: i + 1,
                        totalPosts: posts.length,
                        message: `Fetching comments for post ${i + 1}/${posts.length} in r/${subreddit}...`,
                        progress: Math.round((totalProgress / totalWork) * 100)
                    });
                }

                post.comments = await this.getComments(post.permalink, commentLimit);

                sourceLog.push({
                    index: sourceLog.length + 1,
                    url: post.url,
                    subreddit: `r/${subreddit}`,
                    title: post.title.length > 80 ? post.title.substring(0, 80) + '...' : post.title,
                    score: post.score,
                    numComments: post.numComments,
                    value: this.assessPostValue(post)
                });

                totalProgress++;
            }

            allPosts.push(...posts);
        }

        return {
            metadata: {
                scrapedAt: new Date().toISOString(),
                subreddits,
                sort,
                timeFilter,
                totalPosts: allPosts.length,
                totalComments: allPosts.reduce((sum, p) => sum + p.comments.length, 0)
            },
            posts: allPosts,
            sourceLog
        };
    }
}

module.exports = new RedditService();
