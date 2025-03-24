const axios = require('axios');
const JobListing = require('../models/JobListing');

async function syncJobsFromML(skills, limit = 100) {
  try {
    console.log(`Syncing jobs for skills: ${skills}`);
    
    if (!skills || !skills.length) {
      console.log('No skills provided for job sync');
      return { success: false, error: 'No skills provided' };
    }
    
    // Call ML service to get jobs
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000/api';
    console.log(`Calling ML service at: ${mlServiceUrl}/job-match`);
    
    const response = await axios.post(`${mlServiceUrl}/job-match`, {
      skills,
      limit
    });
    
    if (!response.data || !response.data.jobs || !response.data.jobs.length) {
      console.log('No jobs returned from ML service');
      return { success: false, error: 'No jobs returned from ML service' };
    }
    
    const jobs = response.data.jobs;
    console.log(`Got ${jobs.length} jobs from ML service`);
    
    // Prepare jobs for database
    const jobsToSave = jobs.map(job => {
      // Convert ISO date strings back to Date objects if needed
      const postedAt = job.postedAt ? new Date(job.postedAt) : new Date();
      const scrapedAt = job.scrapedAt ? new Date(job.scrapedAt) : new Date();
      
      // Generate a sourceId if it doesn't exist
      const sourceId = job.sourceId || 
                      `${job.source || 'ml'}_${job.title?.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
      
      // Ensure matchScore is properly handled
      const matchScore = typeof job.matchScore === 'number' ? job.matchScore : 
                        (parseFloat(job.matchScore) || 0);
      
      return {
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
      };
    });
    
    // Save jobs to database
    let added = 0;
    let updated = 0;
    
    for (const job of jobsToSave) {
      try {
        // Check if job already exists
        const existingJob = await JobListing.findOne({
          $or: [
            { sourceId: job.sourceId },
            { 
              url: job.url, 
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
          await JobListing.create(job);
          added++;
        }
      } catch (err) {
        console.error(`Error saving job "${job.title}":`, err.message);
      }
    }
    
    console.log(`Sync complete: ${added} jobs added, ${updated} jobs updated`);
    
    return {
      success: true,
      added,
      updated,
      total: jobsToSave.length
    };
  } catch (error) {
    console.error(`Error syncing jobs: ${error.message}`);
    if (error.response) {
      console.error('ML service error:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

module.exports = { syncJobsFromML };