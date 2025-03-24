const mongoose = require('mongoose');

const JobListingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a job title'],
    trim: true
  },
  company: {
    type: String,
    required: [true, 'Please provide a company name']
  },
  location: {
    type: String,
    required: [true, 'Please provide a location']
  },
  description: {
    type: String,
    required: [true, 'Please provide a job description']
  },
  skills: {
    type: [String],
    default: []
  },
  type: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'],
    default: 'Full-time'
  },
  salary: {
    type: String
  },
  url: {
    type: String
  },
  source: {
    type: String,
    required: true
  },
  sourceId: {
    type: String,
    required: true
  },
  postedAt: {
    type: Date,
    default: Date.now
  },
  scrapedAt: {
    type: Date,
    default: Date.now
  },
  // Add match score field (not required as it's dynamic)
  matchScore: {
    type: Number,
    default: 0
  }
});

// Create compound index for source and sourceId to avoid duplicates
JobListingSchema.index({ source: 1, sourceId: 1 }, { unique: true });

module.exports = mongoose.model('JobListing', JobListingSchema);