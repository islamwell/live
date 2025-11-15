const { Sequelize } = require('sequelize');
const config = require('../config/database');

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.User = require('./User')(sequelize, Sequelize);
db.Broadcast = require('./Broadcast')(sequelize, Sequelize);
db.Recording = require('./Recording')(sequelize, Sequelize);
db.Reminder = require('./Reminder')(sequelize, Sequelize);
db.Session = require('./Session')(sequelize, Sequelize);
db.Reaction = require('./Reaction')(sequelize, Sequelize);
db.ChatMessage = require('./ChatMessage')(sequelize, Sequelize);
db.Follow = require('./Follow')(sequelize, Sequelize);

// Define associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
