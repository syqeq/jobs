document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("jobApplicationForm");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");
  const messageBox = document.getElementById("messageBox");

  const defaultLabels = {
    idFile: "اختر ملف الهوية...",
    cvFile: "اختر ملف السيرة الذاتية...",
    qualificationFile: "اختر وثيقة المؤهل...",
    experienceFile: "اختر ملف الشهادة..."
  };

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

      const job = form.job?.value?.trim() || "";
      const trainingCourse = form.trainingCourse?.value?.trim() || "";
      const idNumber = form.idNumber?.value?.trim() || "";
      const phone = form.phone?.value?.trim() || "";
      const email = form.email?.value?.trim() || "";
      const idFile = form.idFile?.files?.[0];

      if (!job) {
        showMessage("يرجى تحديد المسار المطلوب.", true);
        return;
      }

      if (!trainingCourse) {
        showMessage("يرجى تحديد المسار التدريبي المجتاز.", true);
        return;
      }

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

        fileInputs.forEach(input => {
          const label = input.nextElementSibling;
          if (label) {
            label.textContent = defaultLabels[input.id] || "اختر ملفاً...";
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
