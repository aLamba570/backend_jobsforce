const cron = require('node-cron');
const axios = require('axios');
const User = require('../models/User');
const Job = require('../models/Job');

// Function to get all unique skills from users
async function getAllUserSkills() {
  try {
    const users = await User.find({ skills: { $exists: true, $ne: [] } });
    
    // Collect all unique skills across users
    const allSkills = new Set();
    users.forEach(user => {
      if (user.skills && user.skills.length) {
        user.skills.forEach(skill => allSkills.add(skill));
      }
    });
    
    return Array.from(allSkills);
  } catch (error) {
    console.error('Error getting user skills:', error);
    return [];
  }
}

// Function to sync jobs from ML service
async function syncJobsFromML(skills, limit = 200) {
  try {
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
    
    console.log(`Syncing jobs from ML service for ${skills.length} skills...`);
    
    // Use only first 10 skills to avoid overwhelming the ML service
    const limitedSkills = skills.slice(0, 10);
    
    const response = await axios.post(`${mlServiceUrl}/api/job-match`, {
      skills: limitedSkills,
      limit: limit
    });
    
    if (!response.data || !response.data.jobs) {
      console.log('No jobs returned from ML service');
      return { added: 0, updated: 0 };
    }
    
    const jobs = response.data.jobs;
    console.log(`Received ${jobs.length} jobs from ML service`);
    
    let added = 0;
    let updated = 0;
    
    // Process each job
    for (const job of jobs) {
      // Generate a source ID if not provided
      const sourceId = job._id || 
                      `${job.source || 'ml'}-${job.title?.replace(/\s+/g, '-')}-${Date.now()}`;
      
      // Clean up the match score
      const matchScore = typeof job.matchScore === 'number' ? job.matchScore : 
                        (parseFloat(job.matchScore) || 0);
      
      // Parse dates
      const postedAt = job.postedAt ? new Date(job.postedAt) : new Date();
      const scrapedAt = job.scrapedAt ? new Date(job.scrapedAt) : new Date();
      
      // Check if job already exists
      const existingJob = await Job.findOne({ 
        $or: [
          { sourceId: sourceId },
          { url: job.url && job.url.length > 0 ? job.url : null }
        ]
      });
      
      if (existingJob) {
        // Update existing job
        existingJob.matchScore = matchScore;
        existingJob.skills = job.skills || skills;
        existingJob.scrapedAt = scrapedAt;
        await existingJob.save();
        updated++;
      } else {
        // Create new job
        await Job.create({
          title: job.title || 'Unknown Position',
          company: job.company || 'Unknown Company',
          location: job.location || 'Remote',
          description: job.description || '',
          skills: job.skills || skills,
          url: job.url || '',
          source: job.source || 'ml-service',
          sourceId: sourceId,
          postedAt: postedAt,
          scrapedAt: scrapedAt,
          type: job.type || 'Full-time',
          salary: job.salary || '',
          matchScore: matchScore
        });
        added++;
      }
    }
    
    return { added, updated };
  } catch (error) {
    console.error('Error syncing jobs from ML service:', error);
    throw error;
  }
}

// Schedule job sync every 4 hours
cron.schedule('0 */4 * * *', async () => {
  console.log('Running scheduled job sync...');
  
  try {
    // Get all unique skills from users
    const allSkills = await getAllUserSkills();
    
    if (allSkills.length === 0) {
      console.log('No skills found for job sync');
      return;
    }
    
    // Sync jobs for all skills with increased limit
    const result = await syncJobsFromML(allSkills, 200);
    
    console.log(`Scheduled job sync completed: Added ${result.added} jobs, updated ${result.updated} jobs`);
  } catch (error) {
    console.error(`Error in scheduled job sync: ${error.message}`);
  }
});

// Export functions for use elsewhere
module.exports = {
  getAllUserSkills,
  syncJobsFromML
};