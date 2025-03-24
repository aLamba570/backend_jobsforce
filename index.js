const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
// Add this line near the top with other requires
const jobScheduler = require('./utils/JobScheduler');
const { forceSyncJobs } = require('./utils/syncJobsFromML');
// The rest of your app.js remains the same
require('dotenv').config();

const {initScheduler} = require('./scheduler');

// Initialize app
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Middleware
app.use(cors({
  origin: '*', // For development only, tighten this in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// app.use(express.json({ extended: false }));

// Default route
app.get('/', (req, res) => res.json({ message: 'JobsForce API is running' }));

// Add this after other middleware setup
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
// In your main index.js, update the recommendations route import:
app.use('/api/recommendations', require('./routes/recommendations'));

// Connect to MongoDB
const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alamba570:ankush@cluster0.opvl6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // Exit process with failure
    process.exit(1);
  }
};

// Connect to database
connectDB();

initScheduler();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error', message: err.message });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// Initialize jobs on startup
const initializeJobs = async () => {
  try {
    // Check if we need to populate jobs
    const jobCount = await JobListing.countDocuments();
    
    if (jobCount < 20) {
      console.log('Low job count in database, initializing jobs...');
      
      // Get all user skills
      const users = await User.find({ skills: { $exists: true, $ne: [] } });
      
      if (users.length > 0) {
        // Collect all unique skills from users
        const allSkills = [...new Set(users.flatMap(user => user.skills || []))];
        
        if (allSkills.length > 0) {
          console.log(`Found ${allSkills.length} unique skills across all users`);
          
          // Use top 10 skills max to avoid overwhelming ML service
          const limitedSkills = allSkills.slice(0, 10);
          
          // Sync a large number of jobs
          const result = await syncJobsFromML(limitedSkills, 200);
          console.log('Initial job sync completed:', result);
        } else {
          console.log('No skills found for job initialization');
        }
      } else {
        console.log('No users with skills found');
      }
    } else {
      console.log(`Database already has ${jobCount} jobs. Skipping initial sync.`);
    }
  } catch (error) {
    console.error('Error in job initialization:', error);
  }
};

// Call after database connection is established
// Add this after your server starts listening
if (process.env.NODE_ENV !== 'test') {
  initializeJobs();
}

if (process.env.NODE_ENV !== 'test') {
  // Get all user skills from database
  const User = require('./models/User');
  User.find({ skills: { $exists: true, $ne: [] } })
    .then(users => {
      const allSkills = [...new Set(users.flatMap(user => user.skills || []))];
      if (allSkills.length > 0) {
        console.log(`Found ${allSkills.length} unique skills across all users`);
        // Force sync a large number of jobs on startup
        forceSyncJobs(allSkills.slice(0, 10), 200) // Use top 10 skills, get up to 200 jobs
          .then(result => console.log('Initial job sync completed:', result))
          .catch(err => console.error('Initial job sync failed:', err));
      }
    })
    .catch(err => console.error('Error getting user skills for initial job sync:', err));
}