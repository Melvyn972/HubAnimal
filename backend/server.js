import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const PG_URL =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  "";
const USE_POSTGRES = PG_URL.length > 0;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
const DB_PATH = IS_VERCEL
  ? path.join("/tmp", "hubanimal-db.json")
  : path.join(__dirname, "data", "db.json");

function makeId(length = 12) {
  // base64url ne contient pas de caractères problématiques pour une URL.
  const bytesNeeded = Math.ceil((length * 3) / 4);
  return randomBytes(bytesNeeded).toString("base64url").slice(0, length);
}

let pgInitPromise = null;
async function getPgPool() {
  if (!USE_POSTGRES) return null;
  if (pgInitPromise) return pgInitPromise;

  pgInitPromise = (async () => {
    const mod = await import("pg");
    const { Pool } = mod;

    const pool = new Pool({
      connectionString: PG_URL,
      max: 1, // évite les pics de connexions en serverless
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hubanimal_patients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        species TEXT NOT NULL,
        date_of_birth TEXT NULL,
        owner_contact TEXT NOT NULL,
        allergies_critical TEXT NOT NULL,
        treatments_critiques TEXT NOT NULL,
        timeline_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS hubanimal_tokens (
        token TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES hubanimal_patients(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    return pool;
  })();

  return pgInitPromise;
}

function mapPatientRow(row) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    dateOfBirth: row.date_of_birth,
    ownerContact: row.owner_contact,
    allergiesCritical: row.allergies_critical,
    treatmentsCritiques: row.treatments_critiques,
    timelineEntries: Array.isArray(row.timeline_entries) ? row.timeline_entries : [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

async function pgCreatePatient(input) {
  const pool = await getPgPool();
  const id = makeId(12);

  await pool.query(
    `
    INSERT INTO hubanimal_patients
      (id, name, species, date_of_birth, owner_contact, allergies_critical, treatments_critiques, timeline_entries)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, '[]'::jsonb)
    `,
    [
      id,
      input.name,
      input.species,
      input.dateOfBirth || null,
      input.ownerContact || "",
      input.allergiesCritical || "",
      input.treatmentsCritiques || "",
    ],
  );

  const { rows } = await pool.query(`SELECT * FROM hubanimal_patients WHERE id = $1`, [id]);
  return mapPatientRow(rows[0]);
}

async function pgGetPatient(patientId) {
  const pool = await getPgPool();
  const { rows } = await pool.query(`SELECT * FROM hubanimal_patients WHERE id = $1`, [patientId]);
  if (!rows.length) return null;
  return mapPatientRow(rows[0]);
}

async function pgCreateToken(patientId, expiresInMinutes) {
  const pool = await getPgPool();
  const token = makeId(18);
  const minutes = Number(expiresInMinutes || 15);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  const { rows } = await pool.query(
    `
    INSERT INTO hubanimal_tokens (token, patient_id, expires_at, used_at)
    VALUES ($1, $2, $3, NULL)
    RETURNING token, expires_at
    `,
    [token, patientId, expiresAt.toISOString()],
  );

  return {
    token: rows[0].token,
    expiresAt: new Date(rows[0].expires_at).toISOString(),
  };
}

async function pgValidateToken(token) {
  const pool = await getPgPool();

  const { rows } = await pool.query(
    `
    SELECT
      t.token,
      t.patient_id,
      t.expires_at,
      t.used_at,
      p.*
    FROM hubanimal_tokens t
    JOIN hubanimal_patients p ON p.id = t.patient_id
    WHERE t.token = $1
    `,
    [token],
  );

  if (!rows.length) return null;
  const row = rows[0];

  if (row.used_at) {
    return { ok: false, error: "token_already_used" };
  }
  if (Date.now() > new Date(row.expires_at).getTime()) {
    return { ok: false, error: "token_expired" };
  }

  return {
    ok: true,
    patient: mapPatientRow(row),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

async function pgSubmitConsultation(token, entry) {
  const pool = await getPgPool();

  const timelineEntry = {
    id: makeId(12),
    createdAt: new Date().toISOString(),
    date: entry && entry.date ? entry.date : new Date().toISOString().slice(0, 10),
    weight: entry && entry.weight ? Number(entry.weight) : null,
    diagnosis: entry && entry.diagnosis ? String(entry.diagnosis) : "",
    treatment: entry && entry.treatment ? String(entry.treatment) : "",
    prescriptionText: entry && entry.prescriptionText ? String(entry.prescriptionText) : "",
    notes: entry && entry.notes ? String(entry.notes) : "",
  };

  const result = await pool.query(
    `
    WITH tok AS (
      SELECT token, patient_id, expires_at, used_at
      FROM hubanimal_tokens
      WHERE token = $1
      FOR UPDATE
    )
    SELECT 1 as exists
    FROM tok
    `,
    [token],
  );

  // Si le token n'existe pas, on répond avec la même erreur que le mode fichier
  if (!result.rowCount) {
    return { ok: false, statusCode: 400, error: "token_invalid" };
  }

  // Transaction propre (validation + écriture atomique)
  await pool.query("BEGIN");
  try {
    const { rows } = await pool.query(
      `
      SELECT token, patient_id, expires_at, used_at
      FROM hubanimal_tokens
      WHERE token = $1
      FOR UPDATE
      `,
      [token],
    );

    if (!rows.length) {
      await pool.query("ROLLBACK");
      return { ok: false, statusCode: 400, error: "token_invalid" };
    }

    const tok = rows[0];
    if (tok.used_at) {
      await pool.query("ROLLBACK");
      return { ok: false, statusCode: 400, error: "token_already_used" };
    }
    if (Date.now() > new Date(tok.expires_at).getTime()) {
      await pool.query("ROLLBACK");
      return { ok: false, statusCode: 400, error: "token_expired" };
    }

    const patientId = tok.patient_id;
    const patientCheck = await pool.query(`SELECT id FROM hubanimal_patients WHERE id = $1`, [patientId]);
    if (!patientCheck.rows.length) {
      await pool.query("ROLLBACK");
      return { ok: false, statusCode: 404, error: "patient_not_found" };
    }

    await pool.query(
      `
      UPDATE hubanimal_patients
      SET timeline_entries = jsonb_build_array($1::jsonb) || timeline_entries
      WHERE id = $2
      `,
      [JSON.stringify(timelineEntry), patientId],
    );

    await pool.query(`UPDATE hubanimal_tokens SET used_at = now() WHERE token = $1`, [token]);

    await pool.query("COMMIT");
    return { ok: true, patientId };
  } catch (err) {
    await pool.query("ROLLBACK");
    return { ok: false, statusCode: 500, error: err instanceof Error ? err.message : "server_error" };
  }
}

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
  const dir = path.dirname(DB_PATH);
  await fs.mkdir(dir, { recursive: true });
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

function healthHandler(_req, res) {
  res.json({ ok: true, storage: USE_POSTGRES ? "postgres" : "file" });
}

async function createPatientHandler(req, res) {
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

    if (USE_POSTGRES) {
      const patient = await pgCreatePatient({
        name,
        species,
        dateOfBirth,
        ownerContact,
        allergiesCritical,
        treatmentsCritiques,
      });
      return res.json({ ok: true, patient });
    }

    const patient = await withDbMutator(async (db) => {
      const newPatient = {
        id: makeId(12),
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
}

async function getPatientHandler(req, res) {
  const patientId = req.params.patientId;

  if (USE_POSTGRES) {
    const patient = await pgGetPatient(patientId);
    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }
    return res.json({ ok: true, patient });
  }

  const db = await readDb();
  const patient = findPatient(db, patientId);
  if (!patient) {
    return res.status(404).json({ ok: false, error: "patient_not_found" });
  }
  return res.json({ ok: true, patient });
}

async function createTokenHandler(req, res) {
  try {
    const { patientId, expiresInMinutes } = req.body || {};
    const minutes = Number(expiresInMinutes || 15);

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    if (Number.isNaN(minutes) || minutes <= 0 || minutes > 24 * 60) {
      return res.status(400).json({ ok: false, error: "invalid_expiresInMinutes" });
    }

    if (USE_POSTGRES) {
      const result = await pgCreateToken(patientId, minutes);
      return res.json({ ok: true, ...result });
    }

    const result = await withDbMutator(async (db) => {
      const patient = findPatient(db, patientId);
      if (!patient) {
        const err = new Error("patient_not_found");
        err.statusCode = 404;
        throw err;
      }

      const token = makeId(18);
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
}

// Deux possibilités existent selon la façon dont Vercel “monte” le routePrefix :
// - soit le backend reçoit /api/...
// - soit le backend reçoit directement /...
// On gère les deux pour éviter les 404 de routage.
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

app.post("/api/patients", createPatientHandler);
app.post("/patients", createPatientHandler);

app.get("/api/patients/:patientId", getPatientHandler);
app.get("/patients/:patientId", getPatientHandler);

app.post("/api/consultation/tokens", createTokenHandler);
app.post("/consultation/tokens", createTokenHandler);

async function validateTokenHandler(req, res) {
  const token = req.query.token;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ ok: false, error: "token_required" });
  }

  if (USE_POSTGRES) {
    const validated = await pgValidateToken(token);
    if (!validated) {
      return res.status(400).json({ ok: false, error: "token_invalid" });
    }
    if (!validated.ok) {
      return res.status(400).json({ ok: false, error: validated.error });
    }
    return res.json({
      ok: true,
      token: { token, expiresAt: validated.expiresAt },
      patient: validated.patient,
    });
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
}

async function submitConsultationHandler(req, res) {
  try {
    const { token, entry } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ ok: false, error: "token_required" });
    }

    if (USE_POSTGRES) {
      const result = await pgSubmitConsultation(token, entry);
      if (!result.ok) {
        const statusCode = result.statusCode || 500;
        return res.status(statusCode).json({ ok: false, error: result.error });
      }
      return res.json({ ok: true, patientId: result.patientId });
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
        id: makeId(12),
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
}

app.get("/api/consultation/validate", validateTokenHandler);
app.get("/consultation/validate", validateTokenHandler);

app.post("/api/consultation/submit", submitConsultationHandler);
app.post("/consultation/submit", submitConsultationHandler);

app.listen(PORT, "0.0.0.0", () => {
  // Simple log for local testing
  // eslint-disable-next-line no-console
  console.log(`HubAnimal backend listening on http://localhost:${PORT}`);
});

