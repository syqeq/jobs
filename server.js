const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const NOTIFY_EMAIL = "Ahmed.Zahrani@Almosafer.com";

// إعداد خدمة الإرسال (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

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
app.use(express.static(__dirname));

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

// دالة إرسال الإيميل
async function sendApplicationEmail(appData, files) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("SMTP credentials not set, email skipped.");
    return;
  }

  const attachments = [];
  const fileKeys = ["idFile", "cvFile", "qualificationFile", "experienceFile"];
  for (const key of fileKeys) {
    if (files?.[key]?.[0]) {
      attachments.push({
        filename: files[key][0].originalname,
        path: files[key][0].path
      });
    }
  }

  const htmlContent = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
      <h2 style="color: #0c594f; border-bottom: 2px solid #0c594f; padding-bottom: 8px;">طلب توظيف جديد - #${appData.id}</h2>
      <p><strong>الوظيفة المطلوبة:</strong> ${appData.job}</p>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <p><strong>الاسم الرباعي:</strong> ${appData.fullName}</p>
      <p><strong>رقم الهوية / الإقامة:</strong> ${appData.idNumber}</p>
      <p><strong>الجنسية:</strong> ${appData.nationality} | <strong>الجنس:</strong> ${appData.gender}</p>
      <p><strong>تاريخ الميلاد:</strong> ${appData.birthDate}</p>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <p><strong>رقم الجوال:</strong> <a href="tel:${appData.phone}">${appData.phone}</a></p>
      <p><strong>البريد الإلكتروني:</strong> ${appData.email}</p>
      <p><strong>مدينة الإقامة:</strong> ${appData.city}</p>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <p><strong>المستوى التعليمي:</strong> ${appData.education}</p>
      <p><strong>التخصص:</strong> ${appData.major || "بدون تخصص"}</p>
      <p><strong>سنوات الخبرة:</strong> ${appData.experience} سنة</p>
      <p><strong>اللغات:</strong> ${appData.languages || "غير محدد"}</p>
      <p style="margin-top: 15px; font-size: 12px; color: #777;">* الملفات المرفقة موجودة كمرفقات مع هذه الرسالة.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"بوابة التوظيف" <${process.env.SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `طلب تقديم جديد: ${appData.fullName} - ${appData.job}`,
    html: htmlContent,
    attachments
  });
}

app.post("/api/applications", (req, res) => {
  upload(req, res, async (err) => {
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

      const appData = {
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
      };

      const result = stmt.run(appData);
      appData.id = result.lastInsertRowid;

      // إرسال الإيميل في الخلفية
      sendApplicationEmail(appData, req.files).catch(console.error);

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
