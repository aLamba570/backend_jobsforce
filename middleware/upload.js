const multer = require('multer');
const path = require('path');

// Storage configuration
const storage = multer.memoryStorage();

// File filter - only allow PDF and DOCX
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = ['.pdf', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedFileTypes.includes(ext)) {
    return cb(null, true);
  }
  
  cb(new Error('Only PDF and DOCX files are allowed'));
};

// Configure upload settings
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: fileFilter
});

module.exports = upload;