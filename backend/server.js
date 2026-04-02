const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const cors = require("cors");
const { nanoid } = require("nanoid");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = path.join(__dirname, "data", "db.json");

let writeQueue = Promise.resolve();

async function readDb() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      patients: Array.isArray(parsed.patients) ? parsed.patients : [],
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
    };
  } catch (err) {
    return { patients: [], tokens: [] };
  }
}

async function writeDb(db) {
  const tmpPath = DB_PATH + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmpPath, DB_PATH);
}

function withDbMutator(mutator) {
  writeQueue = writeQueue.then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });
  return writeQueue;
}

function findPatient(db, patientId) {
  return db.patients.find((p) => p.id === patientId);
}

function findToken(db, token) {
  return db.tokens.find((t) => t.token === token);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/patients", async (req, res) => {
  try {
    const {
      name,
      species,
      dateOfBirth,
      ownerContact,
      allergiesCritical,
      treatmentsCritiques,
    } = req.body || {};

    if (!name || !species) {
      return res.status(400).json({ ok: false, error: "name_and_species_required" });
    }

    const patient = await withDbMutator(async (db) => {
      const newPatient = {
        id: nanoid(),
        name,
        species,
        dateOfBirth: dateOfBirth || null,
        ownerContact: ownerContact || "",
        allergiesCritical: allergiesCritical || "",
        treatmentsCritiques: treatmentsCritiques || "",
        timelineEntries: [],
        createdAt: new Date().toISOString(),
      };
      db.patients.push(newPatient);
      return newPatient;
    });

    return res.json({ ok: true, patient });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/api/patients/:patientId", async (req, res) => {
  const patientId = req.params.patientId;
  const db = await readDb();
  const patient = findPatient(db, patientId);
  if (!patient) {
    return res.status(404).json({ ok: false, error: "patient_not_found" });
  }
  return res.json({ ok: true, patient });
});

app.post("/api/consultation/tokens", async (req, res) => {
  try {
    const { patientId, expiresInMinutes } = req.body || {};
    const minutes = Number(expiresInMinutes || 15);

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    if (Number.isNaN(minutes) || minutes <= 0 || minutes > 24 * 60) {
      return res.status(400).json({ ok: false, error: "invalid_expiresInMinutes" });
    }

    const result = await withDbMutator(async (db) => {
      const patient = findPatient(db, patientId);
      if (!patient) {
        const err = new Error("patient_not_found");
        err.statusCode = 404;
        throw err;
      }

      const token = nanoid(18);
      const now = Date.now();
      const expiresAt = new Date(now + minutes * 60 * 1000).toISOString();

      db.tokens.push({
        token,
        patientId,
        expiresAt,
        usedAt: null,
        createdAt: new Date(now).toISOString(),
      });

      return { token, expiresAt };
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    const statusCode = err && err.statusCode ? err.statusCode : 500;
    return res.status(statusCode).json({ ok: false, error: err.message || "server_error" });
  }
});

app.get("/api/consultation/validate", async (req, res) => {
  const token = req.query.token;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ ok: false, error: "token_required" });
  }

  const db = await readDb();
  const tokenRow = findToken(db, token);
  if (!tokenRow) {
    return res.status(400).json({ ok: false, error: "token_invalid" });
  }

  if (tokenRow.usedAt) {
    return res.status(400).json({ ok: false, error: "token_already_used" });
  }

  if (Date.now() > new Date(tokenRow.expiresAt).getTime()) {
    return res.status(400).json({ ok: false, error: "token_expired" });
  }

  const patient = findPatient(db, tokenRow.patientId);
  if (!patient) {
    return res.status(404).json({ ok: false, error: "patient_not_found" });
  }

  return res.json({
    ok: true,
    token: { token: tokenRow.token, expiresAt: tokenRow.expiresAt },
    patient,
  });
});

app.post("/api/consultation/submit", async (req, res) => {
  try {
    const { token, entry } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ ok: false, error: "token_required" });
    }

    const result = await withDbMutator(async (db) => {
      const tokenRow = findToken(db, token);
      if (!tokenRow) {
        const err = new Error("token_invalid");
        err.statusCode = 400;
        throw err;
      }
      if (tokenRow.usedAt) {
        const err = new Error("token_already_used");
        err.statusCode = 400;
        throw err;
      }
      if (Date.now() > new Date(tokenRow.expiresAt).getTime()) {
        const err = new Error("token_expired");
        err.statusCode = 400;
        throw err;
      }

      const patient = findPatient(db, tokenRow.patientId);
      if (!patient) {
        const err = new Error("patient_not_found");
        err.statusCode = 404;
        throw err;
      }

      const timelineEntry = {
        id: nanoid(),
        createdAt: new Date().toISOString(),
        date: entry && entry.date ? entry.date : new Date().toISOString().slice(0, 10),
        weight: entry && entry.weight ? Number(entry.weight) : null,
        diagnosis: entry && entry.diagnosis ? String(entry.diagnosis) : "",
        treatment: entry && entry.treatment ? String(entry.treatment) : "",
        prescriptionText: entry && entry.prescriptionText ? String(entry.prescriptionText) : "",
        notes: entry && entry.notes ? String(entry.notes) : "",
      };

      patient.timelineEntries = [timelineEntry, ...(patient.timelineEntries || [])];
      tokenRow.usedAt = new Date().toISOString();

      return { patientId: patient.id };
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    const statusCode = err && err.statusCode ? err.statusCode : 500;
    return res.status(statusCode).json({ ok: false, error: err.message || "server_error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  // Simple log for local testing
  // eslint-disable-next-line no-console
  console.log(`HubAnimal backend listening on http://localhost:${PORT}`);
});

