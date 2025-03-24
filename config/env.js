require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb+srv://alamba570:ankush@cluster0.opvl6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
  JWT_SECRET: process.env.JWT_SECRET || 'jobsforce_secret_key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://localhost:5000/api'
};