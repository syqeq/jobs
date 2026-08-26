document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("jobApplicationForm");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");
  const messageBox = document.getElementById("messageBox");

  // معالجة اختيار وتغيير أسماء الملفات في الواجهة
  const fileInputs = document.querySelectorAll('input[type="file"]');
  fileInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const label = input.nextElementSibling;
      if (label) {
        if (file) {
          label.textContent = `تم اختيار: ${file.name}`;
          label.style.borderColor = "#0c594f";
          label.style.color = "#0c594f";
          label.style.backgroundColor = "#f0fdfa";
        } else {
          label.textContent = "اختر ملفاً...";
          label.style.borderColor = "";
          label.style.color = "";
          label.style.backgroundColor = "";
        }
      }
    });
  });

  function showMessage(text, isError = false) {
    if (!messageBox) {
      alert(text);
      return;
    }
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

      const job = form.querySelector('[name="job"]')?.value?.trim();
      const trainingCourse = form.querySelector('[name="trainingCourse"]')?.value?.trim();
      const fullName = form.querySelector('[name="fullName"]')?.value?.trim();
      const idNumber = form.querySelector('[name="idNumber"]')?.value?.trim();
      const phone = form.querySelector('[name="phone"]')?.value?.trim();
      const email = form.querySelector('[name="email"]')?.value?.trim();
      const idFile = form.querySelector('[name="idFile"]')?.files?.[0];

      if (!job) {
        showMessage("يرجى تحديد المسار المطلوب.", true);
        return;
      }

      if (!fullName) {
        showMessage("يرجى إدخال الاسم الرباعي.", true);
        return;
      }

      if (!idNumber || !/^\d{10}$/.test(idNumber)) {
        showMessage("رقم الهوية / الإقامة يجب أن يتكون من 10 أرقام.", true);
        return;
      }

      if (!phone || !/^05\d{8}$/.test(phone)) {
        showMessage("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.", true);
        return;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("البريد الإلكتروني المدخل غير صحيح.", true);
        return;
      }

      if (!trainingCourse) {
        showMessage("يرجى اختيار المسار التدريبي المجتاز.", true);
        return;
      }

      if (!idFile) {
        showMessage("يرجى إرفاق صورة أو ملف الهوية / الإقامة.", true);
        return;
      }

      setSubmitting(true);

      try {
        const formData = new FormData(form);

        const response = await fetch("/api/applications", {
          method: "POST",
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "تعذر حفظ الطلب بالسيرفر.");
        }

        showMessage("تم استلام طلبك وتوثيقه بنجاح! شكراً لتقديمك.", false);
        form.reset();

        // إعادة ضبط تسميات أزرار رفع الملفات
        fileInputs.forEach((input) => {
          const label = input.nextElementSibling;
          if (label) {
            if (input.name === "idFile") label.textContent = "اختر ملف الهوية...";
            else if (input.name === "cvFile") label.textContent = "اختر ملف السيرة الذاتية...";
            else if (input.name === "qualificationFile") label.textContent = "اختر وثيقة المؤهل...";
            else if (input.name === "experienceFile") label.textContent = "اختر ملف الشهادة...";
            else label.textContent = "اختر ملفاً...";

            label.style.borderColor = "";
            label.style.color = "";
            label.style.backgroundColor = "";
          }
        });

      } catch (err) {
        console.error("Submission error:", err);
        showMessage(err.message || "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.", true);
      } finally {
        setSubmitting(false);
      }
    });
  }
});
