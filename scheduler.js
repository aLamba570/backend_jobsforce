const cron = require('node-cron');
const { syncJobsFromML } = require('./utils/syncJobsFromML');
const User = require('./models/User');

// Function to get all unique skills from users
async function getAllUserSkills() {
  try {
    // Find all users with at least one skill
    const users = await User.find({ skills: { $exists: true, $ne: [] } }, 'skills');
    
    // Extract all skills and remove duplicates
    const allSkills = [...new Set(users.flatMap(user => user.skills))];
    
    return allSkills;
  } catch (error) {
    console.error(`Error fetching user skills: ${error.message}`);
    return [];
  }
}

// Schedule job to run every day at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled job sync...');
  
  try {
    // Get all unique skills from users
    const allSkills = await getAllUserSkills();
    
    if (allSkills.length === 0) {
      console.log('No skills found for job sync');
      return;
    }
    
    // Sync jobs for all skills
    const result = await syncJobsFromML(allSkills, 100);
    
    console.log(`Scheduled job sync completed: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`Error in scheduled job sync: ${error.message}`);
  }
});

module.exports = { initScheduler: () => console.log('Job scheduler initialized') };