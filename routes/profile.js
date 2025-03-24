const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

/**
 * @desc    Update user profile
 * @route   PUT /api/profile
 * @access  Private
 */
router.put('/', protect, async (req, res) => {
  try {
    const {
      name,
      skills,
      jobPreferences
    } = req.body;

    // Build profile object
    const profileFields = {};
    if (name) profileFields.name = name;
    if (skills) profileFields.skills = skills;
    if (jobPreferences) profileFields.jobPreferences = jobPreferences;

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: profileFields },
      { new: true }
    );

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;