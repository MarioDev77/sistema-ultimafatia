const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { isValidDateString } = require('../utils/validators');
const { getMenuForDate } = require('../services/availabilityService');

const router = express.Router();

// GET /api/menu?date=YYYY-MM-DD
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const dateStr = req.query.date;
    if (!isValidDateString(dateStr)) {
      return res.status(400).json({ error: 'Data inválida.' });
    }
    const data = await getMenuForDate(dateStr);
    res.json(data);
  })
);

module.exports = router;
