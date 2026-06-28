const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token, authorization denied' 
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find user
        const user = await User.findById(decoded.userId).select('-passwordHash -pinHash');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Token is not valid' 
            });
        }

        if (!user.isActive) {
            return res.status(401).json({ 
                success: false, 
                message: 'Account is deactivated' 
            });
        }

        // Attach user to request
        req.user = user;
        req.userId = user._id;
        next();

    } catch (error) {
        console.error('Auth middleware error:', error.message);
        res.status(401).json({ 
            success: false, 
            message: 'Token is not valid' 
        });
    }
};

module.exports = auth;