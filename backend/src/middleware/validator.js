const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.validatedData = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(6).required(),
    displayName: Joi.string().max(100),
    role: Joi.string().valid('admin', 'host', 'listener').default('listener')
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  }),

  createBroadcast: Joi.object({
    title: Joi.string().required(),
    description: Joi.string().allow('', null),
    scheduledStartTime: Joi.date().iso(),
    timezone: Joi.string().default('UTC'),
    coverImage: Joi.string().uri().allow('', null),
    maxListeners: Joi.number().integer().min(1).max(10000).default(1000),
    isPublic: Joi.boolean().default(true),
    requiresApproval: Joi.boolean().default(false),
    chatEnabled: Joi.boolean().default(true),
    reactionsEnabled: Joi.boolean().default(true),
    raiseHandEnabled: Joi.boolean().default(true),
    isRecurring: Joi.boolean().default(false),
    recurrenceRule: Joi.object().when('isRecurring', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.allow(null)
    }),
    reminderOffsets: Joi.array().items(Joi.number().integer().min(0)).default([1440, 60, 15]),
    tags: Joi.array().items(Joi.string()),
    category: Joi.string().allow('', null)
  }),

  updateBroadcast: Joi.object({
    title: Joi.string(),
    description: Joi.string().allow('', null),
    scheduledStartTime: Joi.date().iso(),
    timezone: Joi.string(),
    coverImage: Joi.string().uri().allow('', null),
    maxListeners: Joi.number().integer().min(1).max(10000),
    isPublic: Joi.boolean(),
    requiresApproval: Joi.boolean(),
    chatEnabled: Joi.boolean(),
    reactionsEnabled: Joi.boolean(),
    raiseHandEnabled: Joi.boolean(),
    tags: Joi.array().items(Joi.string()),
    category: Joi.string().allow('', null)
  }).min(1),

  chatMessage: Joi.object({
    message: Joi.string().required().max(500),
    replyToId: Joi.string().uuid().allow(null)
  }),

  reaction: Joi.object({
    emoji: Joi.string().required().max(10)
  })
};

module.exports = {
  validate,
  schemas
};
