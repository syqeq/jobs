const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

// الاتصال بالسحابة الدائمة Supabase
const SUPABASE_URL = "https://rwdrwcqkpljiopruhjty.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

// استقبال وحفظ الطلب في سحابة Supabase
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

      res.json({
        success: true,
        applicationId: data[0].id
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "حدث خطأ في حفظ الطلب بالسحابة." });
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

// قراءة البيانات مباشرة من سحابة Supabase
app.get("/api/applications", adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("id", { ascending: false });

    if (error) throw error;

    // تهيئة مسميات الحقول لتتوافق تلقائياً مع لوحة التحكم
    const formatted = data.map(row => ({
      id: row.id,
      job: row.job,
      idNumber: row.id_number,
      fullName: row.full_name,
      birthDate: row.birth_date,
      gender: row.gender,
      nationality: row.nationality,
      phone: row.phone,
      email: row.email,
      city: row.city,
      education: row.education,
      major: row.major,
      experience: row.experience,
      languages: row.languages,
      idFile: row.id_file,
      cvFile: row.cv_file,
      qualificationFile: row.qualification_file,
      experienceFile: row.experience_file,
      status: row.status,
      createdAt: row.created_at
    }));

    res.json({ applications: formatted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "فشل جلب البيانات من السحابة." });
  }
});

// حذف الطلب من السحابة
app.delete("/api/applications/:id", adminAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "فشل الحذف من السحابة." });
  }
});

app.get("/api/files/:filename", adminAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
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
