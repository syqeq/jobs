const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "applications.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  idNumber TEXT NOT NULL,
  fullName TEXT NOT NULL,
  birthDate TEXT NOT NULL,
  gender TEXT NOT NULL,
  nationality TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT NOT NULL,
  education TEXT NOT NULL,
  major TEXT,
  experience INTEGER DEFAULT 0,
  languages TEXT,
  idFile TEXT,
  cvFile TEXT,
  qualificationFile TEXT,
  experienceFile TEXT,
  status TEXT DEFAULT 'new',
  createdAt TEXT NOT NULL
)
`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("نوع الملف غير مسموح. يرجى استخدام PDF أو JPG أو PNG."));
    }
    cb(null, true);
  }
}).fields([
  { name: "idFile", maxCount: 1 },
  { name: "cvFile", maxCount: 1 },
  { name: "qualificationFile", maxCount: 1 },
  { name: "experienceFile", maxCount: 1 }
]);

function clean(value) {
  return String(value ?? "").trim();
}

function validate(body, files) {
  const required = [
    "job", "idNumber", "fullName", "birthDate", "gender", "nationality",
    "phone", "email", "city", "education"
  ];

  for (const field of required) {
    if (!clean(body[field])) return "فضلاً أكمل جميع الحقول المطلوبة.";
  }

  if (!/^\d{10}$/.test(clean(body.idNumber))) {
    return "رقم الهوية / الإقامة يجب أن يتكون من 10 أرقام.";
  }

  if (!/^05\d{8}$/.test(clean(body.phone))) {
    return "رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email))) {
    return "البريد الإلكتروني غير صحيح.";
  }

  if (!files?.idFile?.length) {
    return "إرفاق الهوية / الإقامة مطلوب.";
  }

  return null;
}

app.post("/api/applications", (req, res) => {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const error = validate(req.body, req.files);
      if (error) return res.status(400).json({ message: error });

      const f = name => req.files?.[name]?.[0]?.filename || null;

      const stmt = db.prepare(`
        INSERT INTO applications (
          job, idNumber, fullName, birthDate, gender, nationality, phone, email, city,
          education, major, experience, languages, idFile, cvFile, qualificationFile,
          experienceFile, status, createdAt
        ) VALUES (
          @job, @idNumber, @fullName, @birthDate, @gender, @nationality, @phone, @email, @city,
          @education, @major, @experience, @languages, @idFile, @cvFile, @qualificationFile,
          @experienceFile, 'new', @createdAt
        )
      `);

      const result = stmt.run({
        job: clean(req.body.job),
        idNumber: clean(req.body.idNumber),
        fullName: clean(req.body.fullName),
        birthDate: clean(req.body.birthDate),
        gender: clean(req.body.gender),
        nationality: clean(req.body.nationality),
        phone: clean(req.body.phone),
        email: clean(req.body.email),
        city: clean(req.body.city),
        education: clean(req.body.education),
        major: clean(req.body.major) || "بدون تخصص",
        experience: Number(req.body.experience) || 0,
        languages: clean(req.body.languages) || "غير محدد",
        idFile: f("idFile"),
        cvFile: f("cvFile"),
        qualificationFile: f("qualificationFile"),
        experienceFile: f("experienceFile"),
        createdAt: new Date().toISOString()
      });

      res.json({
        success: true,
        applicationId: result.lastInsertRowid
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "حدث خطأ في حفظ الطلب." });
    }
  });
});

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = (header.startsWith("Bearer ") ? header.slice(7) : "") || req.query.token || "";
  if (!token) return res.status(401).json({ message: "غير مصرح." });

  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString());
    if (payload.exp < Date.now() || payload.role !== "admin") {
      return res.status(401).json({ message: "انتهت الجلسة." });
    }
    next();
  } catch {
    res.status(401).json({ message: "جلسة غير صالحة." });
  }
}

app.post("/api/admin/login", (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "كلمة المرور غير صحيحة." });
  }

  const payload = {
    role: "admin",
    exp: Date.now() + 24 * 60 * 60 * 1000
  };

  const token = Buffer.from(JSON.stringify(payload)).toString("base64url");
  res.json({ token });
});

app.get("/api/applications", adminAuth, (req, res) => {
  const applications = db.prepare(`
    SELECT * FROM applications ORDER BY id DESC
  `).all();

  res.json({ applications });
});

app.delete("/api/applications/:id", adminAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(req.params.id);

  if (!row) return res.status(404).json({ message: "الطلب غير موجود." });

  const files = [row.idFile, row.cvFile, row.qualificationFile, row.experienceFile];

  for (const file of files) {
    if (file) {
      const full = path.join(UPLOAD_DIR, file);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
  }

  db.prepare("DELETE FROM applications WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.get("/api/files/:filename", adminAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const exists = db.prepare(`
    SELECT id FROM applications
    WHERE idFile = ? OR cvFile = ? OR qualificationFile = ? OR experienceFile = ?
  `).get(filename, filename, filename, filename);

  if (!exists) return res.status(404).send("الملف غير موجود في قاعدة البيانات.");

  const full = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(full)) return res.status(404).send("الملف غير موجود على السيرفر.");

  res.sendFile(full);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ message: err.message || "حدث خطأ غير متوقع." });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});
