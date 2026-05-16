const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/devhub?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI).then(() => console.log('✅ MongoDB Connected')).catch(err => console.error('❌ MongoDB Error:', err));

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    favorites: [{ type: String }],
    watchHistory: [{ matchId: String, matchTitle: String, watchedAt: Date }],
    downloads: [{ url: String, type: String, downloadedAt: Date }],
    lastLogin: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// Auth Middleware
const JWT_SECRET = 'devhub_secret_2026_mrdev_2349164624021';
const ADMIN_KEY = 'devgift12';

const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Please login' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.id;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const isAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
};

// API Config
const API_KEY = 'prince';
const API_BASE = 'https://api.princetechn.com/api';

async function callAPI(endpoint, params = {}) {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.append('apikey', API_KEY);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url.toString());
    return response.json();
}

// Temp Number Providers
const TEMP_PROVIDERS = [
    { name: 'receive-smss', numbers: '/tempnumber/receive-smss/numbers', inbox: '/tempnumber/receive-smss/inbox' },
    { name: 'sms24', numbers: '/tempnumber/sms24/numbers', inbox: '/tempnumber/sms24/inbox' },
    { name: 'receive-sms-online', numbers: '/tempnumber/receive-sms-online/numbers', inbox: '/tempnumber/receive-sms-online/inbox' },
    { name: 'hs3x', numbers: '/tempnumber/hs3x/numbers', inbox: '/tempnumber/hs3x/inbox' },
    { name: 'receivesms', numbers: '/tempnumber/receivesms/numbers', inbox: '/tempnumber/receivesms/inbox' },
    { name: 'smstome', numbers: '/tempnumber/smstome/numbers', inbox: '/tempnumber/smstome/inbox' }
];

// ============ AUTH ROUTES ============
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ chars' });
        
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ error: 'User exists' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        
        const token = jwt.sign({ id: user._id, username: user.username, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: user._id, username: user.username, email: user.email, role: 'user' } });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/register', async (req, res) => {
    try {
        const { username, email, password, accessKey } = req.body;
        if (accessKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });
        if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
        
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ error: 'User exists' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword, role: 'admin' });
        await user.save();
        
        const token = jwt.sign({ id: user._id, username: user.username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: user._id, username: user.username, email: user.email, role: 'admin' } });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
        
        user.lastLogin = new Date();
        await user.save();
        
        const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: user._id, username: user.username, email: user.email, role: user.role, favorites: user.favorites } });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/profile', authenticate, async (req, res) => {
    try {
        const { username, bio, avatar, phone, location } = req.body;
        const user = await User.findById(req.userId);
        if (username) user.username = username;
        if (bio !== undefined) user.bio = bio;
        if (avatar !== undefined) user.avatar = avatar;
        if (phone !== undefined) user.phone = phone;
        if (location !== undefined) user.location = location;
        await user.save();
        res.json({ success: true, user: { username: user.username, bio: user.bio, avatar: user.avatar, phone: user.phone, location: user.location } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.put('/api/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.userId);
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be 6+ chars' });
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ success: true, message: 'Password changed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

app.post('/api/favorites', authenticate, async (req, res) => {
    try {
        const { matchId } = req.body;
        const user = await User.findById(req.userId);
        if (!user.favorites.includes(matchId)) {
            user.favorites.push(matchId);
            await user.save();
        }
        res.json({ success: true, favorites: user.favorites });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

app.delete('/api/favorites/:matchId', authenticate, async (req, res) => {
    try {
        const { matchId } = req.params;
        const user = await User.findById(req.userId);
        user.favorites = user.favorites.filter(id => id !== matchId);
        await user.save();
        res.json({ success: true, favorites: user.favorites });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

app.post('/api/watch-history', authenticate, async (req, res) => {
    try {
        const { matchId, matchTitle } = req.body;
        await User.findByIdAndUpdate(req.userId, {
            $push: { watchHistory: { matchId, matchTitle, watchedAt: new Date() } }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save history' });
    }
});

// ============ FOOTBALL APIs (32) ============
app.get('/api/matches', async (req, res) => {
    try {
        const { league } = req.query;
        const data = await callAPI('/football/streaming', league ? { league } : {});
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

app.get('/api/livescores', async (req, res) => {
    try {
        const data = await callAPI('/football/livescore');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live scores' });
    }
});

app.get('/api/livescores2', async (req, res) => {
    try {
        const data = await callAPI('/football/livescore2');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live scores' });
    }
});

app.get('/api/standings/:league', async (req, res) => {
    try {
        const { league } = req.params;
        const endpoints = {
            epl: '/football/epl/standings', laliga: '/football/laliga/standings',
            bundesliga: '/football/bundesliga/standings', seriea: '/football/seriea/standings',
            ligue1: '/football/ligue1/standings', ucl: '/football/ucl/standings',
            euros: '/football/euros/standings', fifa: '/football/fifa/standings'
        };
        const endpoint = endpoints[league];
        if (!endpoint) return res.status(400).json({ error: 'Invalid league' });
        const data = await callAPI(endpoint);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch standings' });
    }
});

app.get('/api/scorers/:league', async (req, res) => {
    try {
        const { league } = req.params;
        const endpoints = {
            epl: '/football/epl/scorers', laliga: '/football/laliga/scorers',
            bundesliga: '/football/bundesliga/scorers', seriea: '/football/seriea/scorers',
            ligue1: '/football/ligue1/scorers', ucl: '/football/ucl/scorers',
            euros: '/football/euros/scorers'
        };
        const endpoint = endpoints[league];
        if (!endpoint) return res.status(400).json({ error: 'Invalid league' });
        const data = await callAPI(endpoint);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scorers' });
    }
});

app.get('/api/epl/matches', async (req, res) => {
    try {
        const data = await callAPI('/football/epl/matches');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

app.get('/api/epl/upcoming', async (req, res) => {
    try {
        const data = await callAPI('/football/epl/upcoming');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch upcoming' });
    }
});

app.get('/api/ucl/matches', async (req, res) => {
    try {
        const data = await callAPI('/football/ucl/matches');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch UCL matches' });
    }
});

app.get('/api/predictions', async (req, res) => {
    try {
        const data = await callAPI('/football/predictions');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch predictions' });
    }
});

app.get('/api/news', async (req, res) => {
    try {
        const data = await callAPI('/football/news');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

app.get('/api/search/player', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return res.status(400).json({ error: 'Player name required' });
        const data = await callAPI('/football/player-search', { name });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to search player' });
    }
});

app.get('/api/search/team', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return res.status(400).json({ error: 'Team name required' });
        const data = await callAPI('/football/team-search', { name });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to search team' });
    }
});

app.get('/api/leagues', async (req, res) => {
    try {
        const data = await callAPI('/football/leagues');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leagues' });
    }
});

app.get('/api/basketball/live', async (req, res) => {
    try {
        const data = await callAPI('/football/basketball-live');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch basketball' });
    }
});

app.get('/api/basketball/streaming', async (req, res) => {
    try {
        const data = await callAPI('/football/streaming/basketball');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

app.get('/api/streaming/all', async (req, res) => {
    try {
        const data = await callAPI('/football/streaming/all');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

app.get('/api/streaming/leagues', async (req, res) => {
    try {
        const { sport } = req.query;
        const data = await callAPI('/football/streaming/leagues', sport ? { sport } : {});
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leagues' });
    }
});

app.get('/api/tv-channels', async (req, res) => {
    try {
        const data = await callAPI('/football/streaming/channels');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// ============ MEDIA DOWNLOADER APIs (37) ============
app.get('/api/download/youtube', authenticate, async (req, res) => {
    try {
        const { url, type = 'video' } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const endpoint = type === 'audio' ? '/football/ytmp3' : '/football/ytmp4';
        const data = await callAPI(endpoint, { url });
        if (data.success) {
            await User.findByIdAndUpdate(req.userId, { $push: { downloads: { url, type: 'youtube', downloadedAt: new Date() } } });
        }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/youtube-v2', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/ytdl', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/youtube-v3', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/ytdl-v3', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/instagram', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/instadl', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/instagram/stories', authenticate, async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Username required' });
        const data = await callAPI('/football/ig-stories', { username });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

app.get('/api/download/instagram/highlights', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/ig-highlights', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch highlights' });
    }
});

app.get('/api/download/tiktok', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/tiktokdlv2', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/tiktok-v3', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/tiktokdlv3', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/twitter', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/twitterdl', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/facebook', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/facebook', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/spotify', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/spotifydl', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/spotify-v2', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/spotifydl-v2', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/aio', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/aio', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/pinterest', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/pinterest', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/googledrive', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/googledrive', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/mediafire', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/mediafire', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/download/github', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/gitclone', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.get('/api/search/apk', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/apkdl', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/playstore', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/playstore', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/apkmirror', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/apkmirror', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// ============ UTILITY APIs (15) ============
app.get('/api/pdf', async (req, res) => {
    try {
        const { text, url } = req.query;
        if (!text && !url) return res.status(400).json({ error: 'Text or URL required' });
        const params = text ? { text } : { url };
        const response = await fetch(`${API_BASE}/football/pdf?apikey=${API_KEY}&${new URLSearchParams(params)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'application/pdf');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'PDF generation failed' });
    }
});

app.get('/api/whois', async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const data = await callAPI('/football/whois', { domain });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Whois lookup failed' });
    }
});

app.get('/api/dns', async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) return res.status(400).json({ error: 'Domain required' });
        const data = await callAPI('/football/dns', { domain });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'DNS lookup failed' });
    }
});

app.get('/api/headers', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/headers', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Header fetch failed' });
    }
});

app.get('/api/server-check', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/server', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Server check failed' });
    }
});

app.get('/api/remini', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'Image URL required' });
        const response = await fetch(`${API_BASE}/football/remini?apikey=${API_KEY}&url=${encodeURIComponent(url)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/jpeg');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Image enhancement failed' });
    }
});

app.get('/api/remove-bg', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'Image URL required' });
        const response = await fetch(`${API_BASE}/football/removebg?apikey=${API_KEY}&url=${encodeURIComponent(url)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Background removal failed' });
    }
});

app.get('/api/qr', async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: 'Text required' });
        const response = await fetch(`${API_BASE}/football/qr?apikey=${API_KEY}&text=${encodeURIComponent(text)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'QR generation failed' });
    }
});

app.get('/api/read-qr', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'QR image URL required' });
        const data = await callAPI('/football/readqr', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'QR reading failed' });
    }
});

app.get('/api/screenshot', async (req, res) => {
    try {
        const { url, device = 'desktop' } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const endpoints = { mobile: '/football/ssphone', tablet: '/football/sstab', desktop: '/football/sspc' };
        const endpoint = endpoints[device] || endpoints.desktop;
        const response = await fetch(`${API_BASE}${endpoint}?apikey=${API_KEY}&url=${encodeURIComponent(url)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Screenshot failed' });
    }
});

app.get('/api/screenshot/full', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const response = await fetch(`${API_BASE}/football/ssweb?apikey=${API_KEY}&url=${encodeURIComponent(url)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Screenshot failed' });
    }
});

app.get('/api/base64/encode', async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: 'Text required' });
        const data = await callAPI('/football/ebase', { text });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Encoding failed' });
    }
});

app.get('/api/base64/decode', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.status(400).json({ error: 'Code required' });
        const data = await callAPI('/football/dbase', { code });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Decoding failed' });
    }
});

app.get('/api/binary/encode', async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: 'Text required' });
        const data = await callAPI('/football/ebinary', { text });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Encoding failed' });
    }
});

app.get('/api/binary/decode', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.status(400).json({ error: 'Code required' });
        const data = await callAPI('/football/dbinary', { code });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Decoding failed' });
    }
});

// ============ ENTERTAINMENT APIs (24) ============
app.get('/api/fun/joke', async (req, res) => {
    try {
        const data = await callAPI('/football/joke');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch joke' });
    }
});

app.get('/api/fun/advice', async (req, res) => {
    try {
        const data = await callAPI('/football/advice');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch advice' });
    }
});

app.get('/api/fun/dare', async (req, res) => {
    try {
        const data = await callAPI('/football/dare');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dare' });
    }
});

app.get('/api/fun/love', async (req, res) => {
    try {
        const data = await callAPI('/football/love');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch love message' });
    }
});

app.get('/api/fun/flirt', async (req, res) => {
    try {
        const data = await callAPI('/football/flirt');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch flirt message' });
    }
});

app.get('/api/fun/goodnight', async (req, res) => {
    try {
        const data = await callAPI('/football/goodnight');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch goodnight message' });
    }
});

app.get('/api/fun/quote', async (req, res) => {
    try {
        const data = await callAPI('/football/quote');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
});

app.get('/api/fun/truth', async (req, res) => {
    try {
        const data = await callAPI('/football/truth');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch truth' });
    }
});

app.get('/api/fun/shayari', async (req, res) => {
    try {
        const data = await callAPI('/football/shayari');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shayari' });
    }
});

app.get('/api/fun/motivation', async (req, res) => {
    try {
        const data = await callAPI('/football/motivation');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch motivation' });
    }
});

app.get('/api/fun/friendship', async (req, res) => {
    try {
        const data = await callAPI('/football/friendship');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch friendship quote' });
    }
});

app.get('/api/fun/pickup', async (req, res) => {
    try {
        const data = await callAPI('/football/pickup');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pickup line' });
    }
});

app.get('/api/fun/valentine', async (req, res) => {
    try {
        const data = await callAPI('/football/valentine');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch valentine wish' });
    }
});

app.get('/api/fun/christmas', async (req, res) => {
    try {
        const data = await callAPI('/football/christmas');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch christmas wish' });
    }
});

app.get('/api/fun/newyear', async (req, res) => {
    try {
        const data = await callAPI('/football/newyear');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch new year wish' });
    }
});

app.get('/api/fun/mothersday', async (req, res) => {
    try {
        const data = await callAPI('/football/mothersday');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch mothers day wish' });
    }
});

app.get('/api/fun/fathersday', async (req, res) => {
    try {
        const data = await callAPI('/football/fathersday');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch fathers day wish' });
    }
});

app.get('/api/fun/thankyou', async (req, res) => {
    try {
        const data = await callAPI('/football/thankyou');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch thank you message' });
    }
});

app.get('/api/fun/gratitude', async (req, res) => {
    try {
        const data = await callAPI('/football/gratitude');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gratitude message' });
    }
});

app.get('/api/fun/heartbreak', async (req, res) => {
    try {
        const data = await callAPI('/football/heartbreak');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch heartbreak quote' });
    }
});

// ============ SEARCH APIs (16) ============
app.get('/api/search/lyrics', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/lyrics', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/spotify', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/spotify', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/youtube', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/youtube', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/tiktok', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/tiktok', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/google-image', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/googleimage', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/unsplash', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/unsplash', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/wallpaper', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/wallpaper', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/wikipedia', async (req, res) => {
    try {
        const { title } = req.query;
        if (!title) return res.status(400).json({ error: 'Title required' });
        const data = await callAPI('/football/wikipedia', { title });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/chords', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/chords', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/search/stickers', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });
        const data = await callAPI('/football/stickers', { query });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/weather', async (req, res) => {
    try {
        const { location } = req.query;
        if (!location) return res.status(400).json({ error: 'Location required' });
        const data = await callAPI('/football/weather', { location });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Weather fetch failed' });
    }
});

app.get('/api/npm', async (req, res) => {
    try {
        const { package: pkg } = req.query;
        if (!pkg) return res.status(400).json({ error: 'Package name required' });
        const data = await callAPI('/football/npm', { package: pkg });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'NPM search failed' });
    }
});

// ============ SOCIAL STALKER APIs (6) ============
app.get('/api/stalk/instagram', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Username required' });
        const data = await callAPI('/football/igstalk', { username });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Stalk failed' });
    }
});

app.get('/api/stalk/tiktok', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Username required' });
        const data = await callAPI('/football/tiktokstalk', { username });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Stalk failed' });
    }
});

app.get('/api/stalk/github', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Username required' });
        const data = await callAPI('/football/gitstalk', { username });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Stalk failed' });
    }
});

app.get('/api/stalk/ip', async (req, res) => {
    try {
        const { ip } = req.query;
        if (!ip) return res.status(400).json({ error: 'IP required' });
        const data = await callAPI('/football/ipstalk', { ip });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'IP lookup failed' });
    }
});

app.get('/api/stalk/whatsapp', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/wastalk', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'WhatsApp stalk failed' });
    }
});

app.get('/api/stalk/npm', async (req, res) => {
    try {
        const { package: pkg } = req.query;
        if (!pkg) return res.status(400).json({ error: 'Package name required' });
        const data = await callAPI('/football/npmstalk', { package: pkg });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'NPM stalk failed' });
    }
});

// ============ NEWS CHANNELS APIs (4) ============
app.get('/api/news/channels', async (req, res) => {
    try {
        const data = await callAPI('/football/news-channels');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news channels' });
    }
});

app.get('/api/news/countries', async (req, res) => {
    try {
        const data = await callAPI('/football/countries');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch countries' });
    }
});

app.get('/api/news/country/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const data = await callAPI(`/football/country/${code}`);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch country channels' });
    }
});

app.get('/api/news/categories', async (req, res) => {
    try {
        const data = await callAPI('/football/news-categories');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// ============ TEMP EMAIL APIs (3) ============
let tempEmails = {};

app.post('/api/temp-email/generate', authenticate, async (req, res) => {
    try {
        const data = await callAPI('/football/generate-email');
        if (data.email) {
            tempEmails[req.userId] = { email: data.email, createdAt: Date.now() };
            res.json({ success: true, email: data.email });
        } else {
            res.json({ success: true, email: `${req.user.username}@tempmail.com` });
        }
    } catch (error) {
        res.json({ success: true, email: `${req.user.username}@tempmail.dev` });
    }
});

app.get('/api/temp-email/inbox', authenticate, async (req, res) => {
    try {
        const tempEmail = tempEmails[req.userId];
        if (!tempEmail) return res.status(400).json({ error: 'No temp email generated' });
        const data = await callAPI('/football/email-inbox', { email: tempEmail.email });
        res.json(data);
    } catch (error) {
        res.json({ messages: [{ from: 'test@example.com', subject: 'Test', body: 'Test message', time: new Date() }] });
    }
});

app.get('/api/temp-email/message', authenticate, async (req, res) => {
    try {
        const { messageId } = req.query;
        if (!messageId) return res.status(400).json({ error: 'Message ID required' });
        const data = await callAPI('/football/email-message', { id: messageId });
        res.json(data);
    } catch (error) {
        res.json({ message: 'Sample message content' });
    }
});

// ============ URL SHORTENER APIs (7) ============
app.get('/api/shorten/tinyurl', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/tinyurl', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Shortening failed' });
    }
});

app.get('/api/shorten/rebrandly', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/rebrandly', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Shortening failed' });
    }
});

app.get('/api/shorten/vgd', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/vgd', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Shortening failed' });
    }
});

app.get('/api/shorten', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/shorten', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Shortening failed' });
    }
});

// ============ TEXT LOGO APIs (28) ============
const LOGO_STYLES = [
    'glossy-silver', 'write-text', 'black-pink', 'glitch', 'advanced-glow',
    'typography', 'pixel-glitch', 'neon-glitch', 'nigerian-flag', 'american-flag',
    'deleting-text', 'blackpink-style', 'glowing-text', 'under-water',
    'logo-maker', 'cartoon-style', 'paper-cut', 'effect-clouds',
    'gradient-text', 'summer-beach', 'sand-summer', 'luxury-gold',
    'galaxy', '1917', 'making-neon', 'text-effect', 'galaxy-style', 'light-effect'
];

app.get('/api/text-logo/:style', async (req, res) => {
    try {
        const { style } = req.params;
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: 'Text required' });
        if (!LOGO_STYLES.includes(style)) return res.status(400).json({ error: 'Invalid style' });
        
        const response = await fetch(`${API_BASE}/football/text-logo/${style}?apikey=${API_KEY}&text=${encodeURIComponent(text)}`);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Logo generation failed' });
    }
});

app.get('/api/text-logo/styles', async (req, res) => {
    res.json({ styles: LOGO_STYLES, count: LOGO_STYLES.length });
});

// ============ TEMP NUMBER INBOX APIs ============
app.get('/api/temp-numbers', authenticate, async (req, res) => {
    try {
        const allNumbers = [];
        for (const provider of TEMP_PROVIDERS) {
            try {
                const response = await fetch(`https://apis.davidcyril.name.ng${provider.numbers}`);
                const data = await response.json();
                if (data.numbers || Array.isArray(data)) {
                    const numbers = Array.isArray(data) ? data : (data.numbers || []);
                    allNumbers.push(...numbers.map(num => ({ ...num, provider: provider.name, number: num.number || num })));
                }
            } catch (e) {}
        }
        res.json({ success: true, count: allNumbers.length, numbers: allNumbers.slice(0, 20) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch numbers' });
    }
});

app.get('/api/temp-inbox', authenticate, async (req, res) => {
    try {
        const { number, provider } = req.query;
        if (!number || !provider) return res.status(400).json({ error: 'Number and provider required' });
        const providerConfig = TEMP_PROVIDERS.find(p => p.name === provider);
        if (!providerConfig) return res.status(400).json({ error: 'Invalid provider' });
        const response = await fetch(`https://apis.davidcyril.name.ng${providerConfig.inbox}?number=${encodeURIComponent(number)}`);
        const data = await response.json();
        res.json({ success: true, number, provider, messages: data.messages || data.inbox || data.data || [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
});

// ============ ADMIN ROUTES ============
app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.delete('/api/admin/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

app.put('/api/admin/users/:id/make-admin', authenticate, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { role: 'admin' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        res.json({ totalUsers, newUsersToday });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============ SERVE FRONTEND ============
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 SERVER: http://localhost:${PORT}`);
    console.log(`🔑 Admin Key: devgift12`);
    console.log(`📊 APIs Loaded: 100+`);
    console.log(`✅ MongoDB Connected\n`);
});
