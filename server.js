const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// الاتصال بـ Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "https://rwdrwcqkpljiopruhjty.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3ZHJ3Y3FrcGxqaW9wcnVoanR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUxMzAwMywiZXhwIjoyMTAzMDg5MDAzfQ.YUFQIf-pNMi80Lnd4Py3ZTmbl3XsxANdU4kXVdmfIdo";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// حفظ الملفات على القرص المحلي لضمان وجود الرابط دائماً
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

  if (!files?.idFile?.length) {
    return "إرفاق الهوية / الإقامة مطلوب.";
  }

  return null;
}

// استقبال وحفظ طلب التوظيف
app.post("/api/applications", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const error = validate(req.body, req.files);
      if (error) return res.status(400).json({ message: error });

      const f = name => req.files?.[name]?.[0]?.filename || null;

      const record = {
        job: clean(req.body.job),
        id_number: clean(req.body.idNumber),
        full_name: clean(req.body.fullName),
        birth_date: clean(req.body.birthDate),
        gender: clean(req.body.gender),
        nationality: clean(req.body.nationality),
        phone: clean(req.body.phone),
        email: clean(req.body.email),
        city: clean(req.body.city),
        education: clean(req.body.education),
        major: clean(req.body.major) || "بدون تخصص",
        experience: Number(req.body.experience) || 0,
        languages: clean(req.body.languages) || "غير محدد",
        id_file: f("idFile"),
        cv_file: f("cvFile"),
        qualification_file: f("qualificationFile"),
        experience_file: f("experienceFile"),
        status: "new"
      };

      const { data, error: dbError } = await supabase
        .from("applications")
        .insert([record])
        .select();

      if (dbError) throw dbError;

      // إشعار البريد
      fetch("https://formsubmit.co/ajax/Ahmed.Zahrani@Almosafer.com", {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: `طلب توظيف جديد: ${record.full_name} (${record.job})`,
          الاسم: record.full_name,
          الهوية: record.id_number,
          المسار: record.job,
          الجوال: record.phone
        })
      }).catch(mailErr => console.error("Email error:", mailErr));

      res.json({
        success: true,
        applicationId: data[0].id
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "حدث خطأ في حفظ الطلب." });
    }
  });
});

// مسار جلب جميع الطلبات للوحة التحكم
app.get("/api/admin/applications", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "فشل في جلب البيانات." });
  }
});

// مسار استعراض وتحميل الملفات المرفوعة
app.get("/api/uploads/:filename", (req, res) => {
  const file = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send("الملف غير موجود.");
  }
});

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
