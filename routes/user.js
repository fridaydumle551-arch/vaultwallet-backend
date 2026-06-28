const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// @route   GET /api/user/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
    try {
        res.json({
            success: true,
            user: {
                id: req.user._id,
                username: req.user.username,
                balance: req.user.balance,
                currency: req.user.currency,
                email: req.user.email,
                phone: req.user.phone,
                avatar: req.user.avatar,
                createdAt: req.user.createdAt,
                lastLogin: req.user.lastLogin
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   PUT /api/user/update
// @desc    Update user profile (email, phone, avatar, currency)
// @access  Private
router.put('/update', auth, [
    body('currency').optional().isIn(['USD', 'NGN', 'AUD', 'CAD']).withMessage('Invalid currency')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: errors.array()[0].msg });
        }

        const { email, phone, avatar, currency } = req.body;
        const updates = {};

        if (email !== undefined) updates.email = email;
        if (phone !== undefined) updates.phone = phone;
        if (avatar !== undefined) updates.avatar = avatar;
        if (currency !== undefined) updates.currency = currency;

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: updates },
            { new: true }
        ).select('-passwordHash -pinHash');

        res.json({
            success: true,
            message: 'Profile updated',
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
        console.error('Update error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   PUT /api/user/change-pin
// @desc    Change transaction PIN
// @access  Private
router.put('/change-pin', auth, async (req, res) => {
    try {
        const { currentPin, newPin } = req.body;

        if (!currentPin || !newPin) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!/^\d{4}$/.test(newPin)) {
            return res.status(400).json({ success: false, message: 'PIN must be 4 digits' });
        }

        // Get full user (with pinHash)
        const user = await User.findById(req.userId);

        // Verify current PIN
        const isMatch = await user.comparePin(currentPin);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current PIN is incorrect' });
        }

        // Hash new PIN
        user.pinHash = await User.hashPin(newPin);
        await user.save();

        res.json({ success: true, message: 'PIN changed successfully' });

    } catch (error) {
        console.error('Change PIN error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/user/balance
// @desc    Get current balance
// @access  Private
router.get('/balance', auth, async (req, res) => {
    try {
        res.json({
            success: true,
            balance: req.user.balance,
            currency: req.user.currency
        });
    } catch (error) {
        console.error('Balance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/users/search
// @desc    Search users by username
// @access  Private
router.get('/search', auth, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 1) {
            return res.json({ success: true, users: [] });
        }

        const users = await User.find({
            username: { $regex: q.trim().toLowerCase(), $options: 'i' },
            _id: { $ne: req.userId }
        })
        .select('username email avatar')
        .limit(10);

        res.json({
            success: true,
            users: users.map(u => ({
                username: u.username,
                email: u.email,
                avatar: u.avatar
            }))
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/users/exists/:username
// @desc    Check if username exists
// @access  Private
router.get('/exists/:username', auth, async (req, res) => {
    try {
        const user = await User.findOne({ 
            username: req.params.username.toLowerCase() 
        });

        res.json({
            success: true,
            exists: !!user,
            user: user ? { username: user.username, email: user.email } : null
        });

    } catch (error) {
        console.error('Exists error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;