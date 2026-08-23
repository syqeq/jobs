const form = document.getElementById("applicationForm");
const message = document.getElementById("message");

const fileInputs = [
  ["idFile", "idFileName"],
  ["cvFile", "cvFileName"],
  ["qualificationFile", "qualificationFileName"],
  ["experienceFile", "experienceFileName"]
];

const MAX_SIZE = 2 * 1024 * 1024;
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];

fileInputs.forEach(([inputId, nameId]) => {
  const input = document.getElementById(inputId);
  const name = document.getElementById(nameId);

  input.addEventListener("change", () => {
    if (!input.files.length) {
      name.textContent = "لم يتم اختيار أي ملف";
      return;
    }

    const file = input.files[0];

    if (!allowedTypes.includes(file.type)) {
      input.value = "";
      name.textContent = "لم يتم اختيار أي ملف";
      showMessage("الرجاء رفع ملف بصيغة PDF أو JPG أو PNG.", "error");
      return;
    }

    if (file.size > MAX_SIZE) {
      input.value = "";
      name.textContent = "لم يتم اختيار أي ملف";
      showMessage("حجم الملف يجب ألا يتجاوز 2 ميجا.", "error");
      return;
    }

    name.textContent = file.name;
    hideMessage();
  });
});

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`;
}

function hideMessage() {
  message.textContent = "";
  message.className = "message";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  if (!form.checkValidity()) {
    form.reportValidity();
    showMessage("تم استلام طلبك بنجاح، وستتم مراجعته والتواصل معك.", "success");
    return;
  }

  const submitButton = form.querySelector(".submit-button");
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.innerHTML = "جاري الإرسال...";

  const data = new FormData(form);

  try {
    const response = await fetch("/api/applications", {
      method: "POST",
      body: data
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "تعذر إرسال الطلب.");
    }

    showMessage(
      `تم إرسال الطلب بنجاح. رقم الطلب: ${result.applicationId}`,
      "success"
    );

    form.reset();
    fileInputs.forEach(([, nameId]) => {
      document.getElementById(nameId).textContent = "لم يتم اختيار أي ملف";
    });
  } catch (error) {
    showMessage(error.message || "حدث خطأ أثناء إرسال الطلب.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalText;
  }
});
