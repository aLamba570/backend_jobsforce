const express = require('express');
const router = express.Router();
const { register, login, getMe, logout } = require('../controllers/auth');
const { protect } = require('../middleware/auth');

// Register route
router.post('/register', register);

// Login route
router.post('/login', login);

// Get current user
router.get('/me', protect, getMe);

// Logout route
router.get('/logout', protect, logout);

module.exports = router;