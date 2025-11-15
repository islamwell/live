const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    username: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('admin', 'host', 'listener'),
      defaultValue: 'listener',
      allowNull: false
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isSuspended: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fcmToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    apnsToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    webPushSubscription: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    emailNotificationsEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    pushNotificationsEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'users',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  User.prototype.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.password;
    return values;
  };

  User.associate = (models) => {
    User.hasMany(models.Broadcast, {
      foreignKey: 'hostId',
      as: 'broadcasts'
    });
    User.hasMany(models.Session, {
      foreignKey: 'userId',
      as: 'sessions'
    });
    User.hasMany(models.Reaction, {
      foreignKey: 'userId',
      as: 'reactions'
    });
    User.hasMany(models.ChatMessage, {
      foreignKey: 'userId',
      as: 'messages'
    });
    // Following relationships
    User.belongsToMany(models.User, {
      through: models.Follow,
      as: 'following',
      foreignKey: 'followerId'
    });
    User.belongsToMany(models.User, {
      through: models.Follow,
      as: 'followers',
      foreignKey: 'followingId'
    });
  };

  return User;
};
