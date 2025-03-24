const axios = require('axios');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const JobListing = require('../models/JobListing');
const fs = require('fs');
const FormData = require('form-data');

// @desc    Extract skills from resume text
// @route   POST /api/recommendations/extract-skills
// @access  Private
exports.extractSkills = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'Please provide resume text' });
    }

    // Call ML service to extract skills
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000/api';
    console.log(`Calling ML service at: ${mlServiceUrl}/extract-skills`);
    
    const response = await axios.post(`${mlServiceUrl}/extract-skills`, { text });
    console.log('Raw ML service response:', JSON.stringify(response.data));
    
    let skills = [];
    if (response.data && response.data.skills) {
      // Check if the skills is a string (JSON object) and parse it if needed
      if (typeof response.data.skills === 'string') {
        try {
          const parsedData = JSON.parse(response.data.skills);
          // Extract the technical_skills array from the parsed data
          if (Array.isArray(parsedData) && parsedData[0] && Array.isArray(parsedData[0].technical_skills)) {
            skills = parsedData[0].technical_skills;
          } else if (parsedData && Array.isArray(parsedData.technical_skills)) {
            skills = parsedData.technical_skills;
          }
        } catch (parseError) {
          console.error('Error parsing skills string:', parseError);
          // If parsing fails, split by common delimiters
          skills = response.data.skills
            .replace(/[\[\]{}'"]/g, '')  // Remove brackets, braces, quotes
            .split(/,\s*/)               // Split by comma and optional whitespace
            .filter(skill => skill.trim().length > 0); // Filter empty entries
        }
      } else if (Array.isArray(response.data.skills)) {
        // If it's already an array, use it directly
        skills = response.data.skills;
      }

      console.log('Extracted skills:', skills);
      
      // Update user skills
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { skills },
        { new: true }
      ).select('-password');

      return res.json({
        success: true,
        skills,
        user
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Failed to extract skills'
      });
    }
  } catch (err) {
    console.error(`Error in extractSkills: ${err.message}`);
    if (err.response) {
      console.error(`ML Service Error: ${JSON.stringify(err.response.data)}`);
    }
    return res.status(500).json({
      success: false, 
      error: 'Server error',
      details: err.message
    });
  }
};

// @desc    Get job recommendations based on user skills
// @route   GET /api/recommendations/jobs
// @access  Private
// Find the getRecommendedJobs function and update it:
// Replace the getRecommendedJobs function with this updated version
exports.getRecommendedJobs = async (req, res) => {
  try {
    const user = req.user;
    
    // Get user skills or default to empty array
    const userSkills = user.skills || [];
    
    if (!userSkills.length) {
      return res.status(200).json({
        success: true,
        jobs: [],
        total: 0,
        page: 1,
        pages: 0,
        message: 'Add skills to your profile to get job recommendations'
      });
    }

    // Parse query parameters
    const limit = parseInt(req.query.limit || '100');  // Increased default to 100
    const page = parseInt(req.query.page || '1');
    const skip = (page - 1) * limit;
    const minMatchScore = parseFloat(req.query.minMatchScore || '0');
    const location = req.query.location;
    const searchTerm = req.query.searchTerm;
    const refresh = req.query.refresh === 'true';

    console.log(`Getting jobs with params: page=${page}, limit=${limit}, refresh=${refresh}`);

    // If refresh requested or jobs count is low, fetch from ML service
    let totalJobs = await JobListing.countDocuments({});
    if (refresh || totalJobs < 20) {
      try {
        console.log('Fetching fresh jobs from ML service');
        const { syncJobsFromML } = require('../utils/syncJobsFromML');
        await syncJobsFromML(userSkills, Math.max(limit * 5, 100));
        console.log('Job sync from ML service completed');
      } catch (syncError) {
        console.error('Error syncing jobs:', syncError);
        // Continue with available jobs
      }
    }
    
    // Check if we need to fetch fresh data from ML service
    const needsFreshData = req.query.refresh === 'true';
    
    if (needsFreshData) {
      console.log('Force refreshing jobs from ML service');
      try {
        const fetchedJobs = await fetchJobsFromML(userSkills, limit * 2); // Fetch more to allow for filtering
        
        if (fetchedJobs && fetchedJobs.length) {
          // Save new jobs to database in background
          saveJobsToDatabase(fetchedJobs);
          
          // Apply filters
          let filteredJobs = fetchedJobs;
          
          if (minMatchScore > 0) {
            filteredJobs = filteredJobs.filter(job => job.matchScore >= minMatchScore);
          }
          
          if (location) {
            const locationRegex = new RegExp(location, 'i');
            filteredJobs = filteredJobs.filter(job => job.location && job.location.match(locationRegex));
          }
          
          if (searchTerm) {
            const searchRegex = new RegExp(searchTerm, 'i');
            filteredJobs = filteredJobs.filter(job => 
              (job.title && job.title.match(searchRegex)) || 
              (job.company && job.company.match(searchRegex)) ||
              (job.description && job.description.match(searchRegex))
            );
          }
          
          // Sort by match score
          filteredJobs.sort((a, b) => b.matchScore - a.matchScore);
          
          // Paginate
          const paginatedJobs = filteredJobs.slice(skip, skip + limit);
          
          return res.status(200).json({
            success: true,
            jobs: paginatedJobs,
            total: filteredJobs.length,
            page,
            pages: Math.ceil(filteredJobs.length / limit)
          });
        }
      } catch (mlError) {
        console.error('Error refreshing jobs from ML service:', mlError);
        // Continue with database jobs if ML service fails
      }
    }
    
    // Query database for jobs with filters
    let query = {};
    
    if (minMatchScore > 0) {
      query.matchScore = { $gte: minMatchScore };
    }
    
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }
    
    if (searchTerm) {
      query.$or = [
        { title: { $regex: searchTerm, $options: 'i' } },
        { company: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    
    // Get jobs from database with pagination
    const JobModel = JobListing; // Using JobListing model instead of Job
    
    // Count total matching documents
    const total = await JobModel.countDocuments(query);
    
    // Get paginated results
    const jobs = await JobModel.find(query)
      .sort({ matchScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Check if we have enough jobs, if not fetch from ML service
    if (jobs.length < limit/2) {
      console.log(`Only ${jobs.length} jobs in database matching filters. Fetching from ML service...`);
      
      try {
        const fetchedJobs = await fetchJobsFromML(userSkills, limit * 2);
        
        if (fetchedJobs && fetchedJobs.length) {
          // Save new jobs to database in background
          saveJobsToDatabase(fetchedJobs);
          
          // Apply filters
          let filteredJobs = fetchedJobs;
          
          if (minMatchScore > 0) {
            filteredJobs = filteredJobs.filter(job => job.matchScore >= minMatchScore);
          }
          
          if (location) {
            const locationRegex = new RegExp(location, 'i');
            filteredJobs = filteredJobs.filter(job => job.location && job.location.match(locationRegex));
          }
          
          if (searchTerm) {
            const searchRegex = new RegExp(searchTerm, 'i');
            filteredJobs = filteredJobs.filter(job => 
              (job.title && job.title.match(searchRegex)) || 
              (job.company && job.company.match(searchRegex)) ||
              (job.description && job.description.match(searchRegex))
            );
          }
          
          // Sort by match score
          filteredJobs.sort((a, b) => b.matchScore - a.matchScore);
          
          // Paginate
          const paginatedJobs = filteredJobs.slice(0, limit);
          
          return res.status(200).json({
            success: true,
            jobs: paginatedJobs,
            total: filteredJobs.length,
            page: 1,
            pages: Math.ceil(filteredJobs.length / limit)
          });
        }
      } catch (mlError) {
        console.error('Error fetching from ML service:', mlError);
        // Return whatever we have in the database
      }
    }
    
    return res.status(200).json({
      success: true,
      jobs,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error in getRecommendedJobs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get job recommendations'
    });
  }
};

// Update the fetchJobsFromML function to ensure it's including match scores
async function fetchJobsFromML(skills, limit = 100) {
  try {
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000/api';
    
    console.log(`Fetching jobs from ML service for skills: ${skills.join(', ')}`);
    console.log(`Using ML service URL: ${mlServiceUrl}/job-match`);
    
    // Log the exact request payload
    const requestPayload = { skills, limit };
    console.log('Request payload:', JSON.stringify(requestPayload));
    
    const response = await axios.post(`${mlServiceUrl}/job-match`, requestPayload, {
      timeout: 60000 // Increase timeout to 60 seconds
    });
    
    console.log(`ML service response status: ${response.status}`);
    
    if (!response.data) {
      console.error('No data returned from ML service');
      return [];
    }
    
    // Debug log
    console.log(`ML service response data type: ${typeof response.data}`);
    console.log(`ML service response contains jobs: ${response.data.jobs ? 'yes' : 'no'}`);
    if (response.data.jobs) {
      console.log(`Number of jobs returned: ${response.data.jobs.length}`);
      
      // Log a sample job to see its structure
      if (response.data.jobs.length > 0) {
        console.log('Sample job structure:', JSON.stringify(response.data.jobs[0], null, 2));
      }
    }
    
    if (response.data && response.data.jobs && response.data.jobs.length > 0) {
      // Process and format the job data
      return response.data.jobs.map(job => {
        // Make sure match score is always a number between 0 and 1
        let matchScore = 0;
        if (typeof job.matchScore === 'number') {
          matchScore = job.matchScore;
        } else if (typeof job.matchScore === 'string') {
          matchScore = parseFloat(job.matchScore) || 0;
        }
        
        // Ensure match score is between 0 and 1
        matchScore = Math.max(0, Math.min(1, matchScore));
        
        // Generate a unique source ID
        const sourceId = job._id || 
                        `${job.source || 'ml'}-${job.title?.replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        
        // Parse dates
        const postedAt = job.postedAt ? new Date(job.postedAt) : new Date();
        const scrapedAt = job.scrapedAt ? new Date(job.scrapedAt) : new Date();
        
        // Ensure skills are an array
        const jobSkills = Array.isArray(job.skills) ? job.skills : 
                         (typeof job.skills === 'string' ? job.skills.split(',').map(s => s.trim()) : skills);
        
        return {
          title: job.title || 'Unknown Position',
          company: job.company || 'Unknown Company',
          location: job.location || 'Remote',
          description: job.description || '',
          skills: jobSkills,
          url: job.url || '',
          source: job.source || 'ml-service',
          sourceId: sourceId,
          postedAt: postedAt,
          scrapedAt: scrapedAt,
          type: job.type || 'Full-time',
          salary: job.salary || '',
          matchScore: matchScore // Ensure match score is stored as a number
        };
      });
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching jobs from ML service:', error);
    if (error.response) {
      console.error('ML service response error:', error.response.data);
    }
    throw error;
  }
}

// Update the saveJobsToDatabase function to use JobListing model
async function saveJobsToDatabase(jobs) {
  try {
    console.log(`Saving ${jobs.length} jobs to database...`);
    
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const job of jobs) {
      try {
        // Check if job already exists in DB
        const existingJob = await JobListing.findOne({ 
          $or: [
            { sourceId: job.sourceId },
            { 
              title: job.title, 
              company: job.company,
              url: { $exists: true, $ne: "" }
            }
          ]
        });
        
        if (existingJob) {
          // Update existing job
          existingJob.matchScore = job.matchScore;
          existingJob.skills = job.skills;
          existingJob.scrapedAt = new Date();
          await existingJob.save();
          updated++;
        } else {
          // Create new job
          await JobListing.create({
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            skills: job.skills,
            url: job.url,
            source: job.source,
            sourceId: job.sourceId,
            postedAt: job.postedAt,
            scrapedAt: job.scrapedAt,
            type: job.type,
            salary: job.salary,
            matchScore: job.matchScore
          });
          created++;
        }
      } catch (err) {
        console.error(`Error saving job "${job.title}":`, err.message);
        errors++;
      }
    }
    
    console.log(`Database update complete: ${created} created, ${updated} updated, ${errors} errors`);
  } catch (error) {
    console.error('Error in bulk saving jobs to database:', error);
  }
}


// Set up multer storage for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, `resume-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// Create multer upload instance with proper configuration
// Update the multer configuration with a better file filter
const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5000000 }, // 5MB limit
  fileFilter: function(req, file, cb) {
    console.log('File received:', file);
    
    // Check both mimetype and extension
    const allowedMimetypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedExtensions = ['.pdf', '.docx'];
    
    // Extract the file extension
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Check if the mimetype is valid OR if the extension is valid
    if (allowedMimetypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      console.log('File accepted:', file.originalname);
      return cb(null, true);
    }
    
    console.log('File rejected:', file.originalname, 'Mimetype:', file.mimetype, 'Extension:', ext);
    cb(new Error('Only PDF and DOCX files are allowed'));
  }
});

// Export the upload middleware so it can be used in routes file
exports.uploadMiddleware = uploadMiddleware.single('resume');

// @desc    Upload resume and extract skills
// @route   POST /api/recommendations/upload-resume
// @access  Private
exports.uploadResume = async (req, res) => {
  try {
    console.log('Processing uploaded file in handler');
    console.log('Request file:', req.file);
    
    // Check if file exists after middleware processed it
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded. Please upload a resume file.' 
      });
    }

    const filePath = req.file.path;
    console.log(`File saved to: ${filePath}`);

    // Create form data to send to ML service
    const form = new FormData();
    // Change 'resume' to 'file' to match what ML service expects
    form.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: req.file.mimetype
    });

    // Make request to ML service
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000/api';
    console.log(`Calling ML service at: ${mlServiceUrl}/extract-skills`);
    
    const mlResponse = await axios.post(`${mlServiceUrl}/extract-skills`, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    console.log('ML service response:', JSON.stringify(mlResponse.data));

    if (!mlResponse.data || !mlResponse.data.skills) {
      return res.status(400).json({
        success: false,
        error: 'Failed to extract skills from resume'
      });
    }

    // Get skills from ML service response
    const skills = mlResponse.data.skills;

    // Update user skills
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { skills },
      { new: true }
    ).select('-password');

    // Clean up - remove the uploaded file
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Error removing file ${filePath}:`, err);
    });

    return res.json({
      success: true,
      skills,
      user
    });
  } catch (error) {
    console.error('Error processing resume:', error.message);
    
    if (error.response) {
      console.error('ML Service error response:', error.response.data);
    }
    
    // Clean up - remove the uploaded file if it exists
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error(`Error removing file ${req.file.path}:`, err);
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
};

// @desc    Update user skills
// @route   PUT /api/recommendations/skills
// @access  Private
exports.updateSkills = async (req, res) => {
  try {
    const { skills } = req.body;

    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of skills'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { skills },
      { new: true }
    ).select('-password');

    return res.json({
      success: true,
      user
    });
  } catch (err) {
    console.error(`Error in updateSkills: ${err.message}`);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error',
      details: err.message 
    });
  }
};

