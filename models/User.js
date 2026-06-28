const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    passwordHash: {
        type: String,
        required: true
    },
    pinHash: {
        type: String,
        required: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'NGN', 'AUD', 'CAD']
    },
    email: {
        type: String,
        default: '',
        trim: true
    },
    phone: {
        type: String,
        default: '',
        trim: true
    },
    avatar: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    loginCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for faster username lookups
userSchema.index({ username: 1 });

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method to compare PIN
userSchema.methods.comparePin = async function(candidatePin) {
    return await bcrypt.compare(candidatePin, this.pinHash);
};

// Static method to hash password
userSchema.statics.hashPassword = async function(password) {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(password, salt);
};

// Static method to hash PIN
userSchema.statics.hashPin = async function(pin) {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(pin, salt);
};

module.exports = mongoose.model('User', userSchema);