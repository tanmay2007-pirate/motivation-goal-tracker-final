// routes/goals.js
const express = require('express');
const Goal = require('../models/Goal');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// ── GET all goals ──────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: goals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── CREATE goal ────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, category, priority, deadline } = req.body;

    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'Name and category required' });
    }

    const goal = await Goal.create({
      user: req.userId,
      name,
      description,
      category,
      priority: priority || 'low',
      deadline: deadline ? new Date(deadline) : null
    });

    await updateStreak(req.userId);
    res.status(201).json({ success: true, data: goal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── UPDATE goal ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, category, priority, progress, deadline, done } = req.body;

    let goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
    if (goal.user.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    if (name !== undefined) goal.name = name;
    if (description !== undefined) goal.description = description;
    if (category !== undefined) goal.category = category;
    if (priority !== undefined) goal.priority = priority;
    if (progress !== undefined) goal.progress = progress;
    if (deadline !== undefined) goal.deadline = deadline ? new Date(deadline) : null;
    if (done !== undefined) {
      goal.done = done;
      if (done) goal.completedAt = new Date();
    }
    goal.updatedAt = new Date();

    goal = await goal.save();
    res.status(200).json({ success: true, data: goal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── DELETE goal ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
    if (goal.user.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    await goal.deleteOne();
    res.status(200).json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── BATTLE WIN ─────────────────────────────────────────────────────
router.post('/:id/battle-win', auth, async (req, res) => {
  try {
    let goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
    if (goal.user.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    const priorityStars = { high: 5, medium: 3, low: 1 }[goal.priority || 'low'];
    goal.progress = Math.min(100, goal.progress + 25);
    goal.starsEarned += priorityStars;
    if (goal.progress === 100) {
      goal.done = true;
      goal.completedAt = new Date();
    }
    goal = await goal.save();

    const user = await User.findById(req.userId);
    const newHealth = Math.min(100, user.playerHealth + 20);
    const newStars = user.totalStars + priorityStars;

    await User.findByIdAndUpdate(req.userId, {
      playerHealth: newHealth,
      totalStars: newStars
    });

    await updateStreak(req.userId);

    res.status(200).json({
      success: true,
      data: {
        goal,
        playerHealth: newHealth,
        totalStars: newStars,
        starsEarned: priorityStars
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── BATTLE LOSE ────────────────────────────────────────────────────
router.post('/:id/battle-lose', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const newHealth = Math.max(0, user.playerHealth - 10);
    await User.findByIdAndUpdate(req.userId, { playerHealth: newHealth });

    res.status(200).json({ success: true, data: { playerHealth: newHealth } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── OVERDUE PENALTY ────────────────────────────────────────────────
// Called when frontend detects a goal is overdue — deducts 10 stars (min 0)
// Uses overduePenaltyApplied flag to ensure it only triggers once per goal
router.post('/overdue-penalty', auth, async (req, res) => {
  try {
    const { goalId } = req.body;
    if (!goalId) return res.status(400).json({ success: false, message: 'goalId required' });

    const goal = await Goal.findById(goalId);
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
    if (goal.user.toString() !== req.userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    // Only apply penalty once per goal
    if (goal.overduePenaltyApplied || goal.done) {
      const user = await User.findById(req.userId);
      return res.status(200).json({ success: true, data: { totalStars: user.totalStars, penaltyApplied: false } });
    }

    // Mark penalty as applied
    await Goal.findByIdAndUpdate(goalId, { overduePenaltyApplied: true });

    // Deduct 10 stars (minimum 0)
    const user = await User.findById(req.userId);
    const newStars = Math.max(0, user.totalStars - 10);
    await User.findByIdAndUpdate(req.userId, { totalStars: newStars });

    res.status(200).json({
      success: true,
      data: {
        totalStars: newStars,
        penaltyApplied: true,
        starsDeducted: user.totalStars - newStars
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── STATS SUMMARY ──────────────────────────────────────────────────
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.userId });
    const user = await User.findById(req.userId);

    const total = goals.length;
    const completed = goals.filter(g => g.done).length;
    const avgProgress = total ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / total) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalGoals: total,
        completedGoals: completed,
        avgProgress,
        playerHealth: user.playerHealth,
        totalStars: user.totalStars,
        streak: user.streak
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── HELPER: Update Streak ──────────────────────────────────────────
async function updateStreak(userId) {
  const user = await User.findById(userId);
  const today = new Date().toISOString().split('T')[0];

  if (!user.streak.days.includes(today)) {
    user.streak.days.push(today);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (user.streak.days.includes(yesterdayStr)) {
      user.streak.current += 1;
    } else {
      user.streak.current = 1;
    }

    if (user.streak.current > user.streak.best) {
      user.streak.best = user.streak.current;
    }

    await User.findByIdAndUpdate(userId, {
      'streak.days': user.streak.days,
      'streak.current': user.streak.current,
      'streak.best': user.streak.best
    });
  }
}

module.exports = router;
