const express = require('express');
const router = express.Router();
const { getJobs, getJob } = require('../controllers/jobs');

// Get all jobs
router.get('/', getJobs);

// Get specific job by ID
router.get('/:id', getJob);

module.exports = router;