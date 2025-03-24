const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { 
  extractSkills, 
  getRecommendedJobs, 
  updateSkills,
  uploadMiddleware, 
  uploadResume 
} = require('../controllers/recommendations');
const { syncJobsFromML } = require('../utils/syncJobsFromML');

// Existing routes
router.post('/extract-skills', protect, extractSkills);
router.get('/jobs', protect, getRecommendedJobs);
router.put('/skills', protect, updateSkills);
router.post('/upload-resume', protect, uploadMiddleware, uploadResume);

// Add manual sync route
router.post('/sync-jobs', protect, async (req, res) => {
  try {
    const skills = req.user.skills || [];
    const limit = parseInt(req.query.limit || '200');
    
    if (!skills.length) {
      return res.status(400).json({
        success: false,
        error: 'No skills found in your profile'
      });
    }
    
    const result = await syncJobsFromML(skills, limit);
    
    return res.status(200).json({
      success: result.success,
      message: `Job sync completed: Added ${result.added || 0} jobs, updated ${result.updated || 0} jobs`,
      result
    });
  } catch (error) {
    console.error('Error in manual job sync:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync jobs'
    });
  }
});

module.exports = router;