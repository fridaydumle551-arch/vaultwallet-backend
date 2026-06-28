const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Currency conversion rates (same as frontend)
const CURRENCIES = {
    USD: { rate: 1 },
    NGN: { rate: 1500 },
    AUD: { rate: 1.52 },
    CAD: { rate: 1.36 }
};

// @route   POST /api/transaction/topup
// @desc    Add funds to account
// @access  Private
router.post('/topup', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { amount, currency } = req.body;
        const topupAmount = parseFloat(amount);

        if (!topupAmount || topupAmount <= 0) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const curr = CURRENCIES[currency] || CURRENCIES.USD;
        const usdAmount = topupAmount / curr.rate;

        // Update user balance
        const user = await User.findById(req.userId).session(session);
        user.balance = (user.balance || 0) + usdAmount;
        await user.save({ session });

        // Create transaction record
        const transaction = new Transaction({
            type: 'topup',
            amount: usdAmount,
            currency: currency || 'USD',
            fromUser: req.userId,
            toUser: req.userId,
            fromUsername: req.user.username,
            toUsername: req.user.username,
            note: 'Top up',
            status: 'completed'
        });
        await transaction.save({ session });

        await session.commitTransaction();

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.to(req.userId.toString()).emit('balance:update', {
                balance: user.balance,
                currency: user.currency
            });
        }

        res.json({
            success: true,
            message: 'Top up successful',
            balance: user.balance,
            transaction: {
                id: transaction._id,
                type: transaction.type,
                amount: transaction.amount,
                currency: transaction.currency,
                note: transaction.note,
                timestamp: transaction.createdAt
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Topup error:', error);
        res.status(500).json({ success: false, message: 'Server error during topup' });
    } finally {
        session.endSession();
    }
});

// @route   POST /api/transaction/send
// @desc    Send money to another user
// @access  Private
router.post('/send', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { toUsername, amount, currency, note, pin } = req.body;
        const sendAmount = parseFloat(amount);

        if (!toUsername || !sendAmount || sendAmount <= 0) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Invalid input' });
        }

        // Verify PIN
        const sender = await User.findById(req.userId).session(session);
        const pinMatch = await sender.comparePin(pin);
        if (!pinMatch) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Incorrect PIN' });
        }

        // Find recipient
        const recipient = await User.findOne({ 
            username: toUsername.toLowerCase() 
        }).session(session);

        if (!recipient) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Recipient not found' });
        }

        if (recipient._id.toString() === req.userId.toString()) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Cannot send to yourself' });
        }

        // Convert to USD
        const curr = CURRENCIES[currency] || CURRENCIES.USD;
        const usdAmount = sendAmount / curr.rate;

        // Check balance
        if (sender.balance < usdAmount) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }

        // Deduct from sender
        sender.balance -= usdAmount;
        await sender.save({ session });

        // Add to recipient
        recipient.balance = (recipient.balance || 0) + usdAmount;
        await recipient.save({ session });

        // Create transaction records
        const transaction = new Transaction({
            type: 'sent',
            amount: usdAmount,
            currency: currency || 'USD',
            fromUser: req.userId,
            toUser: recipient._id,
            fromUsername: sender.username,
            toUsername: recipient.username,
            note: note || 'Transfer',
            status: 'completed'
        });
        await transaction.save({ session });

        await session.commitTransaction();

        // Emit real-time updates
        const io = req.app.get('io');
        if (io) {
            // Notify sender
            io.to(req.userId.toString()).emit('balance:update', {
                balance: sender.balance,
                currency: sender.currency
            });
            io.to(req.userId.toString()).emit('transaction:new', {
                type: 'sent',
                amount: usdAmount,
                to: recipient.username,
                note: note || 'Transfer'
            });

            // Notify recipient
            io.to(recipient._id.toString()).emit('balance:update', {
                balance: recipient.balance,
                currency: recipient.currency
            });
            io.to(recipient._id.toString()).emit('transaction:new', {
                type: 'received',
                amount: usdAmount,
                from: sender.username,
                note: note || 'Transfer'
            });
        }

        res.json({
            success: true,
            message: `Sent ${sendAmount} ${currency} to @${recipient.username}`,
            balance: sender.balance,
            transaction: {
                id: transaction._id,
                type: transaction.type,
                amount: transaction.amount,
                currency: transaction.currency,
                to: recipient.username,
                note: transaction.note,
                timestamp: transaction.createdAt
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Send error:', error);
        res.status(500).json({ success: false, message: 'Server error during transfer' });
    } finally {
        session.endSession();
    }
});

// @route   GET /api/transaction/history
// @desc    Get transaction history
// @access  Private
router.get('/history', auth, async (req, res) => {
    try {
        const { type, limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = {
            $or: [
                { fromUser: req.userId },
                { toUser: req.userId }
            ]
        };

        if (type && type !== 'all') {
            query.type = type;
        }

        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('fromUser', 'username avatar')
            .populate('toUser', 'username avatar');

        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            transactions: transactions.map(tx => ({
                id: tx._id,
                type: tx.type,
                amount: tx.amount,
                currency: tx.currency,
                from: tx.fromUsername,
                to: tx.toUsername,
                note: tx.note,
                status: tx.status,
                timestamp: tx.createdAt
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/transaction/recent
// @desc    Get recent transactions (last 5)
// @access  Private
router.get('/recent', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({
            $or: [
                { fromUser: req.userId },
                { toUser: req.userId }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(5);

        res.json({
            success: true,
            transactions: transactions.map(tx => ({
                id: tx._id,
                type: tx.type,
                amount: tx.amount,
                currency: tx.currency,
                from: tx.fromUsername,
                to: tx.toUsername,
                note: tx.note,
                timestamp: tx.createdAt
            }))
        });

    } catch (error) {
        console.error('Recent error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;