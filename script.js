document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("jobApplicationForm");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");
  const messageBox = document.getElementById("messageBox");

  // تحسين تفاعل رفع الملفات لإظهار اسم الملف المختار
  const fileInputs = document.querySelectorAll('input[type="file"]');
  fileInputs.forEach(input => {
    input.addEventListener("change", (e) => {
      const fileName = e.target.files[0]?.name;
      const label = input.nextElementSibling;
      if (label && fileName) {
        label.textContent = `تم اختيار: ${fileName}`;
        label.style.borderColor = "#0c594f";
        label.style.color = "#0c594f";
      }
    });
  });

  // دوال إظهار وإخفاء رسائل التنبيه
  function showMessage(text, isError = false) {
    if (!messageBox) return;
    messageBox.textContent = text;
    messageBox.className = `alert-box ${isError ? "alert-error" : "alert-success"}`;
    messageBox.style.display = "block";
    messageBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideMessage() {
    if (!messageBox) return;
    messageBox.style.display = "none";
    messageBox.textContent = "";
  }

  function setSubmitting(isSubmitting) {
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    if (btnSpinner) btnSpinner.style.display = isSubmitting ? "inline-block" : "none";
    if (btnText) btnText.textContent = isSubmitting ? "جاري الإرسال وحفظ الطلب..." : "إرسال الطلب";
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideMessage();

      // التحقق من صحة المدخلات
      const idNumber = form.idNumber?.value?.trim() || "";
      const phone = form.phone?.value?.trim() || "";
      const email = form.email?.value?.trim() || "";
      const idFile = form.idFile?.files?.[0];

      if (!/^\d{10}$/.test(idNumber)) {
        showMessage("رقم الهوية / الإقامة يجب أن يتكون من 10 أرقام.", true);
        return;
      }

      if (!/^05\d{8}$/.test(phone)) {
        showMessage("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.", true);
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("البريد الإلكتروني المدخل غير صحيح.", true);
        return;
      }

      if (!idFile) {
        showMessage("يرجى إرفاق صورة أو ملف الهوية / الإقامة.", true);
        return;
      }

      setSubmitting(true);

      try {
        const formData = new FormData(form);

        // 1. إرسال الطلب وحفظه في السحابة
        const response = await fetch("/api/applications", {
          method: "POST",
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "تعذر حفظ الطلب بالسيرفر.");
        }

        // 2. إرسال إشعار فوري إلى basbastal@gmail.com ونسخة إلى bastal1137@gmail.com
        fetch("https://formsubmit.co/ajax/basbastal@gmail.com", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            _subject: `طلب توظيف جديد: ${form.fullName?.value || ""} (${form.job?.value || ""})`,
            _cc: "bastal1137@gmail.com",
            "الاسم الرباعي": form.fullName?.value || "",
            "رقم الهوية / الإقامة": form.idNumber?.value || "",
            "المسار / الوظيفة": form.job?.value || "",
            "رقم الجوال": form.phone?.value || "",
            "البريد الإلكتروني": form.email?.value || "",
            "المدينة": form.city?.value || "",
            "المؤهل التعليمي": form.education?.value || "",
            "التخصص": form.major?.value || "غير محدد",
            "سنوات الخبرة": form.experience?.value || "0",
            "اللغات المتقنة": form.languages?.value || "غير محدد",
            "تاريخ التقديم": new Date().toLocaleString("ar-SA")
          })
        }).catch(mailErr => console.error("Email notification error:", mailErr));

        // 3. نجاح العملية
        showMessage("تم استلام طلبك وتوثيقه بنجاح! شكراً لتقديمك.", false);
        form.reset();

        // إعادة ضبط أسماء الملفات
        fileInputs.forEach(input => {
          const label = input.nextElementSibling;
          if (label) {
            label.textContent = "اختر ملفاً...";
            label.style.borderColor = "";
            label.style.color = "";
          }
        });

      } catch (err) {
        console.error(err);
        showMessage(err.message || "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.", true);
      } finally {
        setSubmitting(false);
      }
    });
  }
});
