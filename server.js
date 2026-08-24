const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// الاتصال بـ Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "https://rwdrwcqkpljiopruhjty.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_secret_ENJJT...";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// تخزين الملفات في الذاكرة المؤقتة (Memory) لرفعها للسحابة فوراً
const storage = multer.memoryStorage();
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

// دالة مساعدة لرفع الملف مباشرة إلى Supabase Storage
async function uploadToSupabase(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;

  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (error) {
    console.error("Supabase Storage Error:", error);
    return null;
  }

  // توليد الرابط الدائم للملف
  const { data: publicUrlData } = supabase.storage
    .from("uploads")
    .getPublicUrl(filename);

  return publicUrlData.publicUrl;
}

// استقبال وحفظ طلب التوظيف
app.post("/api/applications", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const idFileObj = req.files?.idFile?.[0];
      const cvFileObj = req.files?.cvFile?.[0];
      const qualFileObj = req.files?.qualificationFile?.[0];
      const expFileObj = req.files?.experienceFile?.[0];

      if (!clean(req.body.job) || !clean(req.body.idNumber) || !clean(req.body.fullName) || !idFileObj) {
        return res.status(400).json({ message: "فضلاً أكمل الحقول الإلزامية وأرفق الهوية." });
      }

      // رفع الملفات إلى التخزين السحابي والحصول على روابط دائمة
      const [idUrl, cvUrl, qualUrl, expUrl] = await Promise.all([
        uploadToSupabase(idFileObj),
        uploadToSupabase(cvFileObj),
        uploadToSupabase(qualFileObj),
        uploadToSupabase(expFileObj)
      ]);

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
        id_file: idUrl,
        cv_file: cvUrl,
        qualification_file: qualUrl,
        experience_file: expUrl,
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
          الجوال: record.phone,
          رابط_الهوية: idUrl || "لا يوجد",
          رابط_السيرة: cvUrl || "لا يوجد"
        })
      }).catch(mailErr => console.error("Email error:", mailErr));

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
    res.status(500).json({ message: "فشل في جلب البيانات من السحابة." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
