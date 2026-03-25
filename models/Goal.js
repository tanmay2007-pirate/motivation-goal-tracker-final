// models/Goal.js
const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a goal name'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  category: {
    type: String,
    enum: ['health', 'learning', 'career', 'personal', 'finance'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  done: {
    type: Boolean,
    default: false
  },
  deadline: {
    type: Date
  },
  // Reminder tracking — which notifications have been sent
  reminders: {
    day3: { type: Boolean, default: false },   // 3 days before
    day2: { type: Boolean, default: false },   // 2 days before
    day1: { type: Boolean, default: false },   // 1 day before
    day0: { type: Boolean, default: false },   // due today
    overdue: { type: Boolean, default: false } // past due
  },
  // Legacy field kept for backward compat
  reminderSent: {
    type: Boolean,
    default: false
  },
  // Whether the overdue star penalty has already been applied
  overduePenaltyApplied: {
    type: Boolean,
    default: false
  },
  starsEarned: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

module.exports = mongoose.model('Goal', goalSchema);
