import { loadSharedComponents } from "./components.js";
import { refreshGoogleTranslate } from "./translate.js";

const config = window.PRS_CONFIG || {};

function initContactForm() {
  const form = document.getElementById("contact-form");
  const feedback = document.getElementById("form-feedback");
  const submitButton = document.getElementById("contact-submit");
  const accessKeyInput = document.getElementById("web3forms-access-key");

  if (!form || !feedback || !submitButton || !accessKeyInput) {
    return;
  }

  const accessKey = config.contactForm?.web3formsAccessKey || "";
  accessKeyInput.value = accessKey;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      feedback.textContent = "Preenche todos os campos obrigatórios antes de enviar.";
      return;
    }

    if (!accessKey || accessKey.includes("COLOCA_AQUI")) {
      feedback.textContent = "Falta configurar a access key do Web3Forms em config/site.config.js.";
      return;
    }

    submitButton.disabled = true;
    feedback.textContent = "A enviar mensagem...";

    try {
      const formData = new FormData(form);
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Erro no envio");
      }

      feedback.textContent = "Mensagem enviada com sucesso.";
      form.reset();
    } catch (error) {
      feedback.textContent = "Não foi possível enviar. Tenta novamente dentro de alguns minutos.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function bootstrap() {
  await loadSharedComponents();
  initContactForm();
  refreshGoogleTranslate({ delay: 250 });
}

bootstrap();
