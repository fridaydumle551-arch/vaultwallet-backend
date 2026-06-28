const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters'),
    body('pin').isLength({ min: 4, max: 4 }).isNumeric().withMessage('PIN must be exactly 4 digits')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                message: errors.array()[0].msg 
            });
        }

        const { username, password, pin, email, phone } = req.body;
        const cleanUsername = username.trim().toLowerCase();

        // Check if user exists
        let user = await User.findOne({ username: cleanUsername });
        if (user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username already taken' 
            });
        }

        // Hash password and PIN
        const passwordHash = await User.hashPassword(password);
        const pinHash = await User.hashPin(pin);

        // Create user
        user = new User({
            username: cleanUsername,
            passwordHash,
            pinHash,
            balance: 0,
            currency: 'USD',
            email: email || '',
            phone: phone || ''
        });

        await user.save();

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                balance: user.balance,
                currency: user.currency,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during signup' 
        });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                message: errors.array()[0].msg 
            });
        }

        const { username, password } = req.body;
        const cleanUsername = username.trim().toLowerCase();

        // Find user
        const user = await User.findOne({ username: cleanUsername });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Incorrect password' 
            });
        }

        // Update login stats
        user.lastLogin = new Date();
        user.loginCount += 1;
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                balance: user.balance,
                currency: user.currency,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

// @route   GET /api/auth/verify
// @desc    Verify token validity
// @access  Private
router.get('/verify', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.json({ success: false, message: 'No token' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-passwordHash -pinHash');

        if (!user || !user.isActive) {
            return res.json({ success: false, message: 'Invalid token' });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                balance: user.balance,
                currency: user.currency,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar
            }
        });

    } catch (error) {
        res.json({ success: false, message: 'Invalid token' });
    }
});

module.exports = router;