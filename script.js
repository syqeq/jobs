document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("applicationForm");
  const msgBox = document.getElementById("message");
  const submitBtn = form.querySelector('button[type="submit"]');

  // معالجة أسماء الملفات عند الاختيار
  const fileInputs = ["idFile", "cvFile", "qualificationFile", "experienceFile"];
  fileInputs.forEach(id => {
    const input = document.getElementById(id);
    const labelSpan = document.getElementById(id + "Name");
    if (input && labelSpan) {
      input.addEventListener("change", () => {
        labelSpan.textContent = input.files?.[0]?.name || "لم يتم اختيار أي ملف";
      });
    }
  });

  function showMessage(text, type = "error") {
    msgBox.textContent = text;
    msgBox.className = `message ${type}`;
    msgBox.style.display = "block";
    msgBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgBox.style.display = "none";

    const idNumber = form.idNumber.value.trim();
    if (!/^\d{10}$/.test(idNumber)) {
      return showMessage("رقم الهوية / الإقامة يجب أن يتكون من 10 أرقام.");
    }

    const phone = form.phone.value.trim();
    if (!/^05\d{8}$/.test(phone)) {
      return showMessage("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.");
    }

    if (!document.getElementById("agreement").checked) {
      return showMessage("يجب الموافقة على الإقرار والشروط قبل الإرسال.");
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>جاري الإرسال...</span>`;

    const formData = new FormData(form);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "حدث خطأ أثناء إرسال الطلب.");
      }

      // الرسالة الرسمية المحمية دون إظهار أي معرفات
      showMessage("تم استلام طلبك بنجاح، وستتم مراجعته والتواصل معك.", "success");
      form.reset();

      fileInputs.forEach(id => {
        const labelSpan = document.getElementById(id + "Name");
        if (labelSpan) labelSpan.textContent = "لم يتم اختيار أي ملف";
      });

    } catch (err) {
      showMessage(err.message || "تعذر الاتصال بالسيرفر. يرجى المحاولة لاحقاً.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>إرسال الطلب</span><span class="send-icon">➤</span>`;
    }
  });
});
