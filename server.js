const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Performance Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public', { maxAge: '1y' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ============ MONGODB CONNECTION ============
const MONGODB_URI = 'mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/devhub?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ============ DATABASE MODELS ============
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '' },
    favorites: [{ type: String }],
    history: [{
        action: String,
        tool: String,
        data: mongoose.Schema.Types.Mixed,
        timestamp: { type: Date, default: Date.now }
    }],
    lastLogin: Date,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const MatchSchema = new mongoose.Schema({
    matchId: { type: String, unique: true },
    homeTeam: String,
    awayTeam: String,
    homeScore: String,
    awayScore: String,
    league: String,
    status: String,
    startTime: Date,
    streams: [{
        title: String,
        url: String
    }],
    updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Match = mongoose.model('Match', MatchSchema);

// ============ AUTH MIDDLEWARE ============
const JWT_SECRET = 'devhub_super_secret_key_2026_mrdev_gift_2349164624021';

const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied. Please login.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

const isAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};

// ============ API CONFIG ============
const API_KEY = 'prince';
const API_BASE = 'https://api.princetechn.com/api';

// Helper function for API calls
const callAPI = async (endpoint, params = {}) => {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.append('apikey', API_KEY);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    
    const response = await fetch(url.toString());
    return response.json();
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            email,
            password: hashedPassword,
            lastLogin: new Date()
        });
        
        await user.save();
        
        const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                bio: user.bio
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        user.lastLogin = new Date();
        await user.save();
        
        const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                bio: user.bio,
                favorites: user.favorites
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user
app.get('/api/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update profile
app.put('/api/profile', authenticate, async (req, res) => {
    try {
        const { username, bio, avatar } = req.body;
        const user = await User.findById(req.user.id);
        
        if (username) user.username = username;
        if (bio !== undefined) user.bio = bio;
        if (avatar !== undefined) user.avatar = avatar;
        
        await user.save();
        res.json({ success: true, user: { username: user.username, bio: user.bio, avatar: user.avatar } });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Change password
app.put('/api/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add favorite
app.post('/api/favorites', authenticate, async (req, res) => {
    try {
        const { matchId } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user.favorites.includes(matchId)) {
            user.favorites.push(matchId);
            await user.save();
        }
        
        res.json({ success: true, favorites: user.favorites });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove favorite
app.delete('/api/favorites/:matchId', authenticate, async (req, res) => {
    try {
        const { matchId } = req.params;
        const user = await User.findById(req.user.id);
        
        user.favorites = user.favorites.filter(id => id !== matchId);
        await user.save();
        
        res.json({ success: true, favorites: user.favorites });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ FOOTBALL API ROUTES ============

// Get live matches with streams
app.get('/api/matches', async (req, res) => {
    try {
        const { league } = req.query;
        const data = await callAPI('/football/streaming', league ? { league } : {});
        
        if (data.success && data.result) {
            // Cache matches in database
            for (const match of data.result.matches) {
                await Match.findOneAndUpdate(
                    { matchId: match.id },
                    {
                        matchId: match.id,
                        homeTeam: match.homeTeam,
                        awayTeam: match.awayTeam,
                        homeScore: match.homeScore,
                        awayScore: match.awayScore,
                        league: match.league,
                        status: match.status,
                        startTime: new Date(match.startTime),
                        streams: match.streams,
                        updatedAt: new Date()
                    },
                    { upsert: true }
                );
            }
        }
        
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        const data = await callAPI('/football/livescore');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live scores' });
    }
});

// Get standings by league
app.get('/api/standings/:league', async (req, res) => {
    try {
        const { league } = req.params;
        const endpoints = {
            epl: '/football/epl/standings',
            laliga: '/football/laliga/standings',
            bundesliga: '/football/bundesliga/standings',
            seriea: '/football/seriea/standings',
            ligue1: '/football/ligue1/standings',
            ucl: '/football/ucl/standings'
        };
        
        const endpoint = endpoints[league];
        if (!endpoint) {
            return res.status(400).json({ error: 'Invalid league' });
        }
        
        const data = await callAPI(endpoint);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch standings' });
    }
});

// Get top scorers
app.get('/api/scorers/:league', async (req, res) => {
    try {
        const { league } = req.params;
        const endpoints = {
            epl: '/football/epl/scorers',
            laliga: '/football/laliga/scorers',
            bundesliga: '/football/bundesliga/scorers',
            seriea: '/football/seriea/scorers',
            ligue1: '/football/ligue1/scorers',
            ucl: '/football/ucl/scorers'
        };
        
        const endpoint = endpoints[league];
        if (!endpoint) {
            return res.status(400).json({ error: 'Invalid league' });
        }
        
        const data = await callAPI(endpoint);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scorers' });
    }
});

// Get match predictions
app.get('/api/predictions', async (req, res) => {
    try {
        const data = await callAPI('/football/predictions');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch predictions' });
    }
});

// Get football news
app.get('/api/news', async (req, res) => {
    try {
        const data = await callAPI('/football/news');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

// Search player
app.get('/api/search/player', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) {
            return res.status(400).json({ error: 'Player name required' });
        }
        const data = await callAPI('/football/player-search', { name });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to search player' });
    }
});

// Search team
app.get('/api/search/team', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) {
            return res.status(400).json({ error: 'Team name required' });
        }
        const data = await callAPI('/football/team-search', { name });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to search team' });
    }
});

// ============ TEMP NUMBER ROUTES ============

// Get available temporary numbers
app.get('/api/temp-numbers', authenticate, async (req, res) => {
    try {
        const response = await fetch('https://apis.davidcyril.name.ng/tempnumber/receive-smss/numbers');
        const data = await response.json();
        
        // Log to user history
        await User.findByIdAndUpdate(req.user.id, {
            $push: {
                history: {
                    action: 'get_temp_numbers',
                    tool: 'temp_number',
                    timestamp: new Date()
                }
            }
        });
        
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch temporary numbers' });
    }
});

// ============ MEDIA DOWNLOADER ROUTES ============

// YouTube downloader
app.get('/api/download/youtube', authenticate, async (req, res) => {
    try {
        const { url, type } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }
        
        const endpoint = type === 'audio' ? '/football/ytmp3' : '/football/ytmp4';
        const data = await callAPI(endpoint, { url });
        
        await User.findByIdAndUpdate(req.user.id, {
            $push: {
                history: {
                    action: 'download',
                    tool: 'youtube',
                    data: { url, type },
                    timestamp: new Date()
                }
            }
        });
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// Instagram downloader
app.get('/api/download/instagram', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }
        
        const data = await callAPI('/football/instadl', { url });
        
        await User.findByIdAndUpdate(req.user.id, {
            $push: {
                history: {
                    action: 'download',
                    tool: 'instagram',
                    data: { url },
                    timestamp: new Date()
                }
            }
        });
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// TikTok downloader
app.get('/api/download/tiktok', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }
        
        const data = await callAPI('/football/tiktokdlv2', { url });
        
        await User.findByIdAndUpdate(req.user.id, {
            $push: {
                history: {
                    action: 'download',
                    tool: 'tiktok',
                    data: { url },
                    timestamp: new Date()
                }
            }
        });
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============ UTILITY ROUTES ============

// URL Shortener
app.get('/api/shorten', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }
        
        const data = await callAPI('/football/shorten', { url });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to shorten URL' });
    }
});

// QR Code Generator
app.get('/api/qr', async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) {
            return res.status(400).json({ error: 'Text required' });
        }
        
        const response = await fetch(`${API_BASE}/football/qr?apikey=${API_KEY}&text=${encodeURIComponent(text)}`);
        const buffer = await response.buffer();
        
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// ============ ADMIN ROUTES ============

// Get all users (admin only)
app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Make admin (admin only)
app.put('/api/admin/users/:id/make-admin', authenticate, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { role: 'admin' });
        res.json({ success: true, message: 'User is now admin' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Get stats (admin only)
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        const activeUsers = await User.countDocuments({
            lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        
        res.json({
            totalUsers,
            newUsersToday,
            activeUsers,
            totalMatches: await Match.countDocuments()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============ SERVE FRONTEND ============
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 API Key: ${API_KEY}`);
    console.log(`✅ Admin access: Register first user then manually set role to 'admin' in MongoDB`);
});
