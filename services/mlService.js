// backend/services/mlService.js
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000/api';

const mlService = {
  async extractSkills(resumeText) {
    try {
      const response = await axios.post(`${ML_SERVICE_URL}/extract-skills`, {
        text: resumeText
      });
      return response.data.skills;
    } catch (error) {
      console.error('Error extracting skills:', error);
      throw error;
    }
  },

  async uploadResumeAndExtractSkills(resumeBuffer, filename) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([resumeBuffer]), filename);
      
      const response = await axios.post(`${ML_SERVICE_URL}/extract-skills`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data.skills;
    } catch (error) {
      console.error('Error uploading resume and extracting skills:', error);
      throw error;
    }
  },

  async getJobRecommendations(skills, limit = 10) {
    try {
      const response = await axios.post(`${ML_SERVICE_URL}/match-jobs`, {
        skills,
        limit
      });
      return response.data.matches;
    } catch (error) {
      console.error('Error getting job recommendations:', error);
      throw error;
    }
  }
};

module.exports = mlService;