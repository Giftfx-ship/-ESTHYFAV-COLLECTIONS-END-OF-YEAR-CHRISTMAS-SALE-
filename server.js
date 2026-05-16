const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads folder if not exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload config
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// MongoDB
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
    tempNumbers: [{ number: String, provider: String, createdAt: Date }],
    aiChats: [{ message: String, response: String, createdAt: Date }],
    uploads: [{ filename: String, url: String, size: Number, createdAt: Date }],
    lastLogin: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// Auth
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

// API Config
const API_KEY = 'prince';
const API_BASE = 'https://api.princetechn.com/api';

async function callAPI(endpoint, params = {}) {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.append('apikey', API_KEY);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    try {
        const response = await fetch(url.toString(), { timeout: 10000 });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============ FOOTBALL APIS ============
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
        res.status(500).json({ error: 'Failed to fetch scores' });
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

app.get('/api/news', async (req, res) => {
    try {
        const data = await callAPI('/football/news');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news' });
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

// ============ TEMP NUMBER APIS ============
const TEMP_PROVIDERS = [
    { name: 'receive-sms-online', baseUrl: 'https://apis.davidcyril.name.ng/tempnumber/receive-sms-online' },
    { name: 'hs3x', baseUrl: 'https://apis.davidcyril.name.ng/tempnumber/hs3x' },
    { name: 'sms24', baseUrl: 'https://apis.davidcyril.name.ng/tempnumber/sms24' },
    { name: 'smstome', baseUrl: 'https://apis.davidcyril.name.ng/tempnumber/smstome' }
];

app.get('/api/temp-numbers', authenticate, async (req, res) => {
    try {
        const allNumbers = [];
        for (const provider of TEMP_PROVIDERS) {
            try {
                const response = await fetch(`${provider.baseUrl}/numbers`, { timeout: 8000 });
                const data = await response.json();
                if (data.success && data.result?.numbers?.length > 0) {
                    const numbers = data.result.numbers.map(num => ({
                        number: num.number,
                        country: num.country || 'Unknown',
                        provider: provider.name,
                        slug: num.slug
                    }));
                    allNumbers.push(...numbers);
                }
            } catch (e) {}
        }
        if (allNumbers.length > 0) {
            await User.findByIdAndUpdate(req.userId, {
                $push: { tempNumbers: { $each: allNumbers.slice(0, 10), $slice: -50 } }
            });
            res.json({ success: true, count: allNumbers.length, numbers: allNumbers });
        } else {
            res.json({ success: false, message: 'No numbers available', numbers: [] });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch numbers' });
    }
});

app.get('/api/temp-inbox', authenticate, async (req, res) => {
    try {
        const { number, provider, slug } = req.query;
        if (!number || !provider) return res.status(400).json({ error: 'Number and provider required' });
        const providerConfig = TEMP_PROVIDERS.find(p => p.name === provider);
        if (!providerConfig) return res.status(400).json({ error: 'Invalid provider' });
        let inboxUrl = `${providerConfig.baseUrl}/inbox`;
        if (slug) inboxUrl = `${providerConfig.baseUrl}/inbox/${slug}`;
        else inboxUrl = `${providerConfig.baseUrl}/inbox?number=${encodeURIComponent(number)}`;
        const response = await fetch(inboxUrl, { timeout: 10000 });
        const data = await response.json();
        res.json({ success: true, number, provider, messages: data.result?.messages || data.messages || [] });
    } catch (error) {
        res.json({ success: true, number, provider, messages: [] });
    }
});

// ============ CATBOX FILE UPLOADER ============
app.post('/api/upload/catbox', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const formData = new FormData();
        formData.append('fileToUpload', fs.createReadStream(req.file.path));
        formData.append('reqtype', 'fileupload');
        
        const response = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });
        
        const result = await response.text();
        fs.unlinkSync(req.file.path); // Delete temp file
        
        if (result.startsWith('http')) {
            await User.findByIdAndUpdate(req.userId, {
                $push: { uploads: { filename: req.file.originalname, url: result, size: req.file.size, createdAt: new Date() } }
            });
            res.json({ success: true, url: result, filename: req.file.originalname, size: req.file.size });
        } else {
            res.status(500).json({ error: 'Upload failed: ' + result });
        }
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

app.get('/api/uploads/history', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('uploads');
        res.json(user.uploads || []);
    } catch (error) {
        res.json([]);
    }
});

// ============ AI DEEPSEEK-V3 API ============
app.post('/api/ai/chat', authenticate, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });
        
        const response = await fetch('https://apis.davidcyril.name.ng/ai/deepseek-v3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, apikey: 'prince' })
        });
        const data = await response.json();
        
        await User.findByIdAndUpdate(req.userId, {
            $push: { aiChats: { message, response: data.response || data.result || data.message, createdAt: new Date() } }
        });
        
        res.json({ success: true, response: data.response || data.result || data.message || 'AI response received' });
    } catch (error) {
        res.status(500).json({ error: 'AI request failed' });
    }
});

app.get('/api/ai/history', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('aiChats');
        res.json(user.aiChats || []);
    } catch (error) {
        res.json([]);
    }
});

// ============ UTILITY APIS ============
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

app.get('/api/base64/encode', async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: 'Text required' });
        const encoded = Buffer.from(text).toString('base64');
        res.json({ success: true, encoded });
    } catch (error) {
        res.status(500).json({ error: 'Encoding failed' });
    }
});

app.get('/api/base64/decode', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.status(400).json({ error: 'Code required' });
        const decoded = Buffer.from(code, 'base64').toString('utf-8');
        res.json({ success: true, decoded });
    } catch (error) {
        res.status(500).json({ error: 'Decoding failed' });
    }
});

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
        res.json({ success: true, token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
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

// ============ ADMIN ROUTES ============
app.get('/api/admin/users', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.delete('/api/admin/users/:id', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

app.get('/api/admin/stats', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const totalUsers = await User.countDocuments();
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        res.json({ totalUsers, newUsersToday });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 SERVER: http://localhost:${PORT}`);
    console.log(`🔑 Admin Key: ${ADMIN_KEY}`);
    console.log(`✅ MongoDB Connected\n`);
});
