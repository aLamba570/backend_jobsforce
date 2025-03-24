const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ extended: false }));

// Mock functions for testing
const mockProtect = (req, res, next) => next();
const mockController = {
  extractSkills: (req, res) => res.json({ message: 'extractSkills works' }),
  getRecommendedJobs: (req, res) => res.json({ message: 'getRecommendedJobs works' }),
  updateSkills: (req, res) => res.json({ message: 'updateSkills works' }),
  uploadResume: (req, res) => res.json({ message: 'uploadResume works' })
};

// Create recommendations router
const recommendationsRouter = express.Router();
recommendationsRouter.post('/extract-skills', mockProtect, mockController.extractSkills);
recommendationsRouter.get('/jobs', mockProtect, mockController.getRecommendedJobs);
recommendationsRouter.put('/skills', mockProtect, mockController.updateSkills);
recommendationsRouter.post('/upload-resume', mockProtect, mockController.uploadResume);

// Register the router
app.use('/api/recommendations', recommendationsRouter);

// Print all routes
console.log('Routes:');
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log(`${Object.keys(r.route.methods)} ${r.route.path}`);
  } else if (r.name === 'router'){
    r.handle.stack.forEach(function(layer){
      if (layer.route){
        const methods = Object.keys(layer.route.methods).join(',');
        const basePath = r.regexp.toString().split('\\')[1].replace('\\/?(?=\\/|$)', '');
        console.log(`${methods.toUpperCase()} ${basePath}${layer.route.path}`);
      }
    });
  }
});

// Start test server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Try: curl -X POST http://localhost:3001/api/recommendations/upload-resume');
});