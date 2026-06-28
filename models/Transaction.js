const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['topup', 'sent', 'received']
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        required: true,
        enum: ['USD', 'NGN', 'AUD', 'CAD']
    },
    fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    toUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fromUsername: {
        type: String,
        required: true
    },
    toUsername: {
        type: String,
        required: true
    },
    note: {
        type: String,
        default: '',
        maxlength: 200
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    }
}, {
    timestamps: true
});

// Index for faster queries
transactionSchema.index({ fromUser: 1, createdAt: -1 });
transactionSchema.index({ toUser: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);