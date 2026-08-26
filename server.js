const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// تفعيل قراءة الـ IP الحقيقي خلف بروكسي Vercel لحل خطأ X-Forwarded-For
app.set("trust proxy", 1);

const JWT_SECRET = process.env.JWT_SECRET || "seera-secure-token-secret-key-2026";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://rwdrwcqkpljiopruhjty.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.warn("تنبيه أمني: لم يتم العثور على SUPABASE_KEY في متغيرات البيئة.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY || "");

const UPLOAD_DIR = process.env.VERCEL 
  ? path.join('/tmp', 'uploads') 
  : path.join(__dirname, 'data', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.warn('Could not create upload directory:', err.message);
  }
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

// ضبط الـ Rate Limit ليتوافق تماماً مع Vercel
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 30, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تم تجاوز عدد محاولات الدخول المسموحة. يرجى الانتظار قليلاً." }
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تم تجاوز الحد الأقصى لإرسال الطلبات من هذا الجهاز." }
});

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "غير مصرح: يرجى تسجيل الدخول" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "جلسة الدخول منتهية أو غير صالحة" });
  }
}

function isValidFileSignature(buffer) {
  if (!buffer || buffer.length < 4) return false;
  
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

  return isPdf || isJpg || isPng;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedMimes.includes(file.mimetype)) {
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
    "phone", "email", "city", "education", "trainingCourse"
  ];

  for (const field of required) {
    if (!clean(body[field])) return "فضلاً أكمل جميع الحقول المطلوبة.";
  }

  if (!files?.idFile?.length) {
    return "إرفاق الهوية / الإقامة مطلوب.";
  }

  return null;
}

async function uploadToSupabase(file) {
  if (!file) return null;
  
  if (!isValidFileSignature(file.buffer)) {
    throw new Error("محتوى الملف غير صالح أو تم التلاعب به.");
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;

  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    console.error("خطأ أثناء رفع الملف إلى Supabase:", error);
    return null;
  }
  return filename;
}

// 1. استقبال الطلبات
app.post("/api/applications", submitLimiter, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const error = validate(req.body, req.files);
      if (error) return res.status(400).json({ message: error });

      const idFile = req.files?.idFile?.[0] ? await uploadToSupabase(req.files.idFile[0]) : null;
      const cvFile = req.files?.cvFile?.[0] ? await uploadToSupabase(req.files.cvFile[0]) : null;
      const qualificationFile = req.files?.qualificationFile?.[0] ? await uploadToSupabase(req.files.qualificationFile[0]) : null;
      const experienceFile = req.files?.experienceFile?.[0] ? await uploadToSupabase(req.files.experienceFile[0]) : null;

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
        training_course: clean(req.body.trainingCourse) || "لا يوجد",
        id_file: idFile,
        cv_file: cvFile,
        qualification_file: qualificationFile,
        experience_file: experienceFile,
        status: "جديد"
      };

      const { data, error: dbError } = await supabase
        .from("applications")
        .insert([record])
        .select();

      if (dbError) throw dbError;

      fetch("https://formsubmit.co/ajax/Ahmed.Zahrani@Almosafer.com", {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: `طلب توظيف جديد: ${record.full_name} (${record.job})`,
          الاسم: record.full_name,
          الهوية: record.id_number,
          المسار: record.job,
          المسار_التدريبي: record.training_course,
          الجوال: record.phone
        })
      }).catch(mailErr => console.error("Email error:", mailErr));

      res.json({
        success: true,
        applicationId: data[0].id
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: e.message || "حدث خطأ في حفظ الطلب." });
    }
  });
});

// 2. تسجيل الدخول
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "يرجى إدخال اسم المستخدم وكلمة المرور" });
    }

    const { data: user, error } = await supabase
      .from("admin_users")
      .select("username, full_name, allowed_track")
      .eq("username", username)
      .eq("password", password)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
    }

    const token = jwt.sign(
      { username: user.username, name: user.full_name, role: user.allowed_track },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      success: true,
      token: token,
      user: {
        username: user.username,
        name: user.full_name,
        role: user.allowed_track
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم أثناء التحقق" });
  }
});

// 3. جلب الطلبات
app.get("/api/admin/applications", authenticateAdmin, async (req, res) => {
  try {
    const userRole = req.admin.role;

    let query = supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (userRole && userRole !== "all") {
      query = query.eq("job", userRole);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "فشل في جلب البيانات." });
  }
});

// 4. تحديث حالة الطلب
app.patch("/api/admin/applications/:id/status", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "الحالة مطلوبة" });
    }

    const { data, error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Update status error:", err);
    return res.status(500).json({ success: false, message: "فشل تحديث الحالة" });
  }
});

// 5. حذف الطلب
app.delete("/api/admin/applications/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return res.json({ success: true, message: "تم حذف الطلب بنجاح" });
  } catch (err) {
    console.error("Delete application error:", err);
    return res.status(500).json({ success: false, message: "فشل حذف الطلب" });
  }
});

// 6. تحميل الملفات بروابط مؤقتة وآمنة (يدعم الهيدر والرابط المباشر)
app.get("/api/uploads/:filename", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith("Bearer ")) 
      ? authHeader.split(" ")[1] 
      : req.query.token;

    if (!token) {
      return res.status(401).json({ success: false, message: "غير مصرح: يرجى تسجيل الدخول" });
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ success: false, message: "جلسة الدخول منتهية أو غير صالحة" });
    }

    const { filename } = req.params;
    
    const { data, error } = await supabase.storage
      .from('uploads')
      .createSignedUrl(filename, 60);
    
    if (data && data.signedUrl) {
      return res.redirect(data.signedUrl);
    }

    res.status(404).send("الملف غير موجود.");
  } catch (err) {
    console.error(err);
    res.status(500).send("حدث خطأ أثناء جلب الملف.");
  }
});

// 7. توجيه الصفحات الثابتة لضمان عمل الموقع
app.get('/logo.jpeg', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.jpeg'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
