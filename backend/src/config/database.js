require('dotenv').config();

module.exports = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'liveaudiocast',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'example'
};
