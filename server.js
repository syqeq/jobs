const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const upload = multer({
  storage: multer.memoryStorage(),
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
    console.error("خطأ أثناء رفع الملف إلى Supabase:", error);
    return null;
  }
  return filename;
}

app.post("/api/applications", (req, res) => {
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

app.post("/api/admin/login", async (req, res) => {
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

    return res.json({
      success: true,
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

app.get("/api/admin/applications", async (req, res) => {
  try {
    const requestedTrack = req.headers["x-user-role"];

    let query = supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (requestedTrack && requestedTrack !== "all") {
      query = query.eq("job", requestedTrack);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "فشل في جلب البيانات." });
  }
});

app.patch("/api/admin/applications/:id/status", async (req, res) => {
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
    return res.status(500).json({ success: false, message: "فشل تحديث الحالة في قاعدة البيانات" });
  }
});

app.delete("/api/admin/applications/:id", async (req, res) => {
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

app.get("/api/uploads/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    
    const { data } = supabase.storage.from('uploads').getPublicUrl(filename);
    
    if (data && data.publicUrl) {
      return res.redirect(data.publicUrl);
    }

    const localFile = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(localFile)) {
      return res.sendFile(localFile);
    }

    res.status(404).send("الملف غير موجود.");
  } catch (err) {
    console.error(err);
    res.status(500).send("حدث خطأ أثناء جلب الملف.");
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
