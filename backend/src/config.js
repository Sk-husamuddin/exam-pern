require('dotenv').config();

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  BASE_URL: process.env.BASE_URL || 'http://localhost:5000',

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  DATABASE_URL: process.env.DATABASE_URL,

  STUDENT_JWT_SECRET: process.env.STUDENT_JWT_SECRET || 'dev_secret_change_me',

  MAX_DOCX_SIZE: parseInt(process.env.MAX_DOCX_SIZE, 10) || 5 * 1024 * 1024,
  MAX_XLSX_SIZE: parseInt(process.env.MAX_XLSX_SIZE, 10) || 2 * 1024 * 1024,

  DEBUG: process.env.DEBUG === 'true',
};
