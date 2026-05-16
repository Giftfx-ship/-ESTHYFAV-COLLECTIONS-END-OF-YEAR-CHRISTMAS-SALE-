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
    favorites: [{ type: String }],
    watchHistory: [{ matchId: String, matchTitle: String, watchedAt: Date }],
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
        const { username, bio, avatar } = req.body;
        const user = await User.findById(req.userId);
        if (username) user.username = username;
        if (bio !== undefined) user.bio = bio;
        if (avatar !== undefined) user.avatar = avatar;
        await user.save();
        res.json({ success: true, user: { username: user.username, bio: user.bio, avatar: user.avatar } });
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

// ============ FOOTBALL APIs ============
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

app.get('/api/standings/:league', async (req, res) => {
    try {
        const { league } = req.params;
        const endpoints = {
            epl: '/football/epl/standings', laliga: '/football/laliga/standings',
            bundesliga: '/football/bundesliga/standings', seriea: '/football/seriea/standings',
            ligue1: '/football/ligue1/standings', ucl: '/football/ucl/standings'
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
            ligue1: '/football/ligue1/scorers', ucl: '/football/ucl/scorers'
        };
        const endpoint = endpoints[league];
        if (!endpoint) return res.status(400).json({ error: 'Invalid league' });
        const data = await callAPI(endpoint);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scorers' });
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

// ============ MEDIA DOWNLOADER APIs ============
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

app.get('/api/shorten', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const data = await callAPI('/football/shorten', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to shorten URL' });
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
        res.status(500).json({ error: 'Failed to generate QR' });
    }
});

// ============ TEMP NUMBER APIs ============
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

// ============ UTILITY APIs ============
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

// ============ ENTERTAINMENT APIs ============
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

app.get('/api/fun/quote', async (req, res) => {
    try {
        const data = await callAPI('/football/quote');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quote' });
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

// Serve Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 SERVER: http://localhost:${PORT}`);
    console.log(`🔑 Admin Key: devgift12`);
    console.log(`📢 Ads: Active (Popunder)`);
    console.log(`✅ MongoDB Connected\n`);
});
