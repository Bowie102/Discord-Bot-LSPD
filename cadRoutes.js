const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// --- CITIZENS ---
router.get('/citizens', async (req, res) => {
  try {
    const citizens = await prisma.citizen.findMany({
      include: { vehicles: true, incidents: true, warrants: true }
    });
    res.json(citizens);
  } catch (err) {
    res.status(500).json({ error: 'Błąd bazy danych' });
  }
});

router.post('/citizens', async (req, res) => {
  try {
    const data = req.body;
    const citizen = await prisma.citizen.create({ data });
    res.json(citizen);
  } catch (err) {
    console.error('Błąd tworzenia obywatela:', err);
    res.status(500).json({ error: 'Błąd tworzenia obywatela', details: err.message });
  }
});

router.put('/citizens/:id', async (req, res) => {
  try {
    const data = req.body;
    const citizen = await prisma.citizen.update({
      where: { id: parseInt(req.params.id) },
      data
    });
    res.json(citizen);
  } catch (err) {
    res.status(500).json({ error: 'Błąd edycji obywatela' });
  }
});

// --- VEHICLES ---
router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({ include: { owner: true } });
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

router.post('/vehicles', async (req, res) => {
  try {
    const data = req.body;
    const v = await prisma.vehicle.create({ data });
    res.json(v);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

router.put('/vehicles/:id', async (req, res) => {
  try {
    const data = req.body;
    const v = await prisma.vehicle.update({ where: { id: parseInt(req.params.id) }, data });
    res.json(v);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

// --- INCIDENTS ---
router.get('/incidents', async (req, res) => {
  try {
    const incidents = await prisma.incident.findMany({ 
      include: { officer: true, citizen: true },
      orderBy: { date: 'desc' }
    });
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

router.post('/incidents', async (req, res) => {
  try {
    const data = req.body;
    const inc = await prisma.incident.create({ data });
    res.json(inc);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

// --- WARRANTS ---
router.get('/warrants', async (req, res) => {
  try {
    const warrants = await prisma.warrant.findMany({ 
      include: { citizen: true, author: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(warrants);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

router.post('/warrants', async (req, res) => {
  try {
    const data = req.body;
    const w = await prisma.warrant.create({ data });
    
    // Ustaw flagę isWanted na true dla obywatela
    if(data.citizenId) {
      await prisma.citizen.update({
        where: { id: parseInt(data.citizenId) },
        data: { isWanted: true }
      });
    }
    res.json(w);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

router.put('/warrants/:id/resolve', async (req, res) => {
  try {
    const w = await prisma.warrant.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: false }
    });
    // Zdejmij flagę isWanted jeśli obywatel nie ma już innych aktywnych warrants
    const activeCount = await prisma.warrant.count({
      where: { citizenId: w.citizenId, isActive: true }
    });
    if (activeCount === 0 && w.citizenId) {
      await prisma.citizen.update({
        where: { id: w.citizenId },
        data: { isWanted: false }
      });
    }
    res.json(w);
  } catch (err) {
    res.status(500).json({ error: 'Błąd' });
  }
});

module.exports = router;
