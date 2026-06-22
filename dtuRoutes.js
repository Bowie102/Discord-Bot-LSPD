const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Pobieranie wszystkich raportów
router.get('/reports', async (req, res) => {
  try {
    const reports = await prisma.dtuReport.findMany({
      orderBy: { date: 'desc' }
    });
    res.json(reports);
  } catch (error) {
    console.error('Błąd pobierania raportów DTU:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Dodawanie nowego raportu
router.post('/reports', async (req, res) => {
  const { title, suspect, detective, content } = req.body;
  if (!title || !suspect || !detective || !content) {
    return res.status(400).json({ error: 'Brak wymaganych pól' });
  }

  try {
    const report = await prisma.dtuReport.create({
      data: {
        title,
        suspect,
        detective,
        content
      }
    });
    res.status(201).json(report);
  } catch (error) {
    console.error('Błąd tworzenia raportu DTU:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Edycja raportu
router.put('/reports/:id', async (req, res) => {
  const { id } = req.params;
  const { title, suspect, detective, content } = req.body;
  if (!title || !suspect || !detective || !content) {
    return res.status(400).json({ error: 'Brak wymaganych pól' });
  }

  try {
    const report = await prisma.dtuReport.update({
      where: { id: parseInt(id) },
      data: { title, suspect, detective, content }
    });
    res.status(200).json(report);
  } catch (error) {
    console.error('Błąd edycji raportu DTU:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Usuwanie raportu
router.delete('/reports/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.dtuReport.delete({
      where: { id: parseInt(id) }
    });
    res.status(200).json({ message: 'Raport usunięty' });
  } catch (error) {
    console.error('Błąd usuwania raportu DTU:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
