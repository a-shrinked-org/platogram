let auth0Client = null;
let stripePromise = null;
let elements;

const processingStages = [
  "Byte Whispering",
  "Qubit Juggling",
  "Syntax Gymnastics",
  "Pixel Wrangling",
  "Neuron Tickling",
  "Algorithm Disco",
  "Data Origami",
  "Bit Barbecue",
  "Logic Limbo",
  "Quantum Knitting",
];
let currentStageIndex = 0;
let processingStageInterval;

function debugLog(message) {
  console.log(`[DEBUG] ${message}`);
}

async function initAuth0() {
  try {
    auth0Client = await auth0.createAuth0Client({
      domain: "dev-w0dm4z23pib7oeui.us.auth0.com",
      clientId: "iFAGGfUgqtWx7VuuQAVAgABC1Knn7viR",
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: "https://platogram.vercel.app/",
        scope: "openid profile email",
      },
      cacheLocation: "localstorage",
    });
    debugLog("Auth0 client initialized successfully");

    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, "/");
    }

    await updateUI();
  } catch (error) {
    console.error("Error initializing Auth0:", error);
  }
}

function updateUIStatus(status, message = "") {
  debugLog(`Updating UI status: ${status}`);
  const inputSection = document.getElementById("input-section");

  if (!inputSection) {
    console.error("Input section not found");
    return;
  }

  // Clear the current content of the input section
  inputSection.innerHTML = '';

  // Show the appropriate section based on status
  switch (status) {
    case "idle":
      if (inputSection) {
        inputSection.classList.remove("hidden");
      } else {
        console.error("Input section not found");
      }
      break;
    case "running":
      if (statusSection) {
        statusSection.classList.remove("hidden");
        updateProcessingStage();
        if (!processingStageInterval) {
          processingStageInterval = setInterval(updateProcessingStage, 3000);
        }
      } else {
        console.error("Status section not found");
      }
      break;
    case "done":
      if (doneSection) {
        doneSection.classList.remove("hidden");
      } else {
        console.error("Done section not found");
      }
      clearProcessingStageInterval();
      break;
    case "error":
      if (errorSection) {
        errorSection.classList.remove("hidden");
        const errorMessage = errorSection.querySelector("p");
        if (errorMessage) {
          errorMessage.textContent = message || "An error occurred. Please try again.";
        } else {
          console.error("Error message element not found");
        }
      } else {
        console.error("Error section not found");
      }
      clearProcessingStageInterval();
      break;
    default:
      console.error(`Unknown status: ${status}`);
  }
}

function clearProcessingStageInterval() {
  if (processingStageInterval) {
    debugLog("Clearing processing stage interval");
    clearInterval(processingStageInterval);
    processingStageInterval = null;
  }
}

async function updateUI() {
  if (!auth0Client) {
    console.error("Auth0 client not initialized");
    return;
  }

  const isAuthenticated = await auth0Client.isAuthenticated();
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (loginButton) loginButton.classList.toggle("hidden", isAuthenticated);
  if (logoutButton) logoutButton.classList.toggle("hidden", !isAuthenticated);

  if (isAuthenticated) {
    const user = await auth0Client.getUser();
    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });
    pollStatus(token);
    debugLog("Logged in as: " + user.email);

    // Add this line to update the UI with the new design
    window.updateAuthUI(isAuthenticated, user);
} else {
    // Add this line to update the UI when not authenticated
    window.updateAuthUI(false, null);
  }
}

async function reset() {
  try {
    if (!auth0Client) throw new Error("Auth0 client not initialized");

    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });

    const response = await fetch("https://temporary.name/reset", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error("Failed to reset");

    const urlInput = document.getElementById("url-input");
    const fileNameElement = document.getElementById("file-name");

    if (urlInput) urlInput.value = "";
    if (fileNameElement) fileNameElement.textContent = "";

    pollStatus(token);
  } catch (error) {
    console.error("Error resetting:", error);
    updateUIStatus("error", "Failed to reset. Please try again.");
  }
}

function initStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

function getPriceFromUI() {
  const coffeePrice = document.getElementById('coffee-price').textContent;
  const price = parseFloat(coffeePrice.replace('$', '')) * 100; // Convert to cents
  return price;
}

async function createCheckoutSession(price, lang) {
  const stripe = await initStripe();

  const response = await fetch('https://platogram.vercel.app/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await auth0Client.getTokenSilently()}`,
    },
    body: JSON.stringify({ price, lang }),
  });

  const session = await response.json();

  if (session.error) {
    console.error('Error creating checkout session:', session.error);
    updateUIStatus('error', 'Failed to create checkout session');
    return null;
  }

  return session;
}

async function handleSubmit(event) {
  event.preventDefault();
  const price = getPriceFromUI();
  const language = document.getElementById('lang-select').value;
  const inputData = getInputData();

  if (price === 0) {
    document.getElementById('language-modal').classList.add('hidden');
    updateUIStatus("running");
    await postToConvert(inputData, language, null, 0);
  } else {
    const session = await createCheckoutSession(price, language);
    if (session) {
      const stripe = await initStripe();
      const result = await stripe.redirectToCheckout({
        sessionId: session.id
      });
      if (result.error) {
        console.error(result.error.message);
        updateUIStatus('error', result.error.message);
      }
    }
  }
}

function handleStripeSuccess() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  const lang = urlParams.get('lang');

  if (sessionId && lang) {
    // Payment was successful, start the conversion
    postToConvert(getInputData(), lang, sessionId, null);
  } else {
    updateUIStatus('error', 'Invalid success parameters');
  }
}

function handleStripeCancel() {
  updateUIStatus('idle');
}

// Add these to your initialization code
if (window.location.pathname === '/success') {
  handleStripeSuccess();
} else if (window.location.pathname === '/cancel') {
  handleStripeCancel();
}

async function onConvertClick(event) {
  if (event) event.preventDefault();
  debugLog("Convert button clicked");

  try {
    if (!auth0Client) throw new Error("Auth0 client not initialized");

    const inputData = getInputData();
    const price = getPriceFromUI();

    if (await auth0Client.isAuthenticated()) {
      showLanguageSelectionModal(inputData, price);
    } else {
      login();
    }
  } catch (error) {
    console.error("Error in onConvertClick:", error);
    updateUIStatus("error", error.message);
  }
}

function showLanguageSelectionModal(inputData, price) {
  const modal = document.getElementById("language-modal");
  if (!modal) {
    console.error("Language modal not found in the DOM");
    return;
  }

  modal.classList.remove("hidden");
  modal.style.display = "block";

  // Update modal content with inputData and price if needed

  document.getElementById("submit-btn").onclick = handleSubmit;
  document.getElementById("cancel-btn").onclick = () => {
    debugLog("Language selection cancelled");
    modal.classList.add("hidden");
  };
}

async function postToConvert(inputData, lang, sessionId, price) {
  let body;
  let headers = {
    Authorization: `Bearer ${await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    })}`,
  };

  const formData = new FormData();
  formData.append("lang", lang);

  if (sessionId) {
    formData.append('session_id', sessionId);
  } else {
    formData.append('price', price);
  }

  if (inputData instanceof File) {
    formData.append("file", inputData);
  } else {
    formData.append("payload", inputData);
  }

  body = formData;

  try {
    const response = await fetch("https://temporary.name/convert", {
      method: "POST",
      headers: headers,
      body: body,
    });
    const result = await response.json();

    if (result.message === "Conversion started" || result.status === "processing") {
      updateUIStatus("running");
      pollStatus(await auth0Client.getTokenSilently());
    } else {
      updateUIStatus("error", "Unexpected response from server");
    }
  } catch (error) {
    console.error("Error:", error);
    updateUIStatus("error", error.message);
  }
}


function getInputData() {
  const urlInput = document.getElementById("url-input").value;
  const fileInput = document.getElementById("file-upload").files[0];
  return urlInput || fileInput;
}

async function login() {
  try {
    if (!auth0Client) throw new Error("Auth0 client not initialized");
    await auth0Client.loginWithRedirect({
      authorizationParams: { redirect_uri: window.location.origin },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    updateUIStatus("error", "Failed to log in. Please try again.");
  }
}

async function logout() {
  try {
    if (!auth0Client) throw new Error("Auth0 client not initialized");
    await auth0Client.logout({
      logoutParams: { returnTo: window.location.origin },
    });
  } catch (error) {
    console.error("Error logging out:", error);
    updateUIStatus("error", "Failed to log out. Please try again.");
  }
}

function showLanguageSelectionModal(inputData, price) {
  const modal = document.getElementById("language-modal");
  if (!modal) {
    console.error("Language modal not found in the DOM");
    return;
  }

  modal.classList.remove("hidden");
  modal.style.display = "block";

  const handleLanguageSelection = async (lang) => {
    debugLog(`Language selected: ${lang}`);
    modal.classList.add("hidden");
    await handlePaymentAndConversion(inputData, lang, price);
  };

  document.getElementById("en-btn").onclick = () => handleLanguageSelection("en");
  document.getElementById("es-btn").onclick = () => handleLanguageSelection("es");
  document.getElementById("cancel-btn").onclick = () => {
    debugLog("Language selection cancelled");
    modal.classList.add("hidden");
  };
}

async function pollStatus(token) {
  try {
    console.log("Polling status with token:", token);
    const response = await fetch("https://temporary.name/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Status response:", response);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    console.log("Raw response text:", text);
    let result;
    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      throw new Error("Invalid JSON response from server");
    }
    console.log("Polling status response:", result);

  } catch (error) {
    console.error("Error polling status:", error);
    updateUIStatus(
      "error",
      `An error occurred while checking status: ${error.message}`
    );
  }
}
function updateUIStatus(status, message = "") {
  debugLog(`Updating UI status: ${status}`);
  const inputSection = document.getElementById("input-section");
  const statusSection = document.getElementById("status-section");
  const errorSection = document.getElementById("error-section");
  const doneSection = document.getElementById("done-section");
  const processingStage = document.getElementById("processing-stage");

  // Hide all sections
  [inputSection, statusSection, doneSection, errorSection].forEach(section => {
    if (section) {
      section.classList.add("hidden");
    } else {
      console.warn(`Section not found: ${section}`);
    }
  });

   // Show the appropriate section based on status
  switch (status) {
    case "idle":
      if (inputSection) {
        inputSection.classList.remove("hidden");
      } else {
        console.error("Input section not found");
      }
      break;
    case "running":
      if (statusSection) {
        statusSection.classList.remove("hidden");
        updateProcessingStage();
        if (!processingStageInterval) {
          processingStageInterval = setInterval(updateProcessingStage, 3000);
        }
      } else {
        console.error("Status section not found");
      }
      break;
    case "done":
      if (doneSection) {
        doneSection.classList.remove("hidden");
      } else {
        console.error("Done section not found");
      }
      clearProcessingStageInterval();
      break;
    case "error":
      if (errorSection) {
        errorSection.classList.remove("hidden");
        const errorMessage = errorSection.querySelector("p");
        if (errorMessage) {
          errorMessage.textContent = message || "An error occurred. Please try again.";
        } else {
          console.error("Error message element not found");
        }
      } else {
        console.error("Error section not found");
      }
      clearProcessingStageInterval();
      break;
    default:
      console.error(`Unknown status: ${status}`);
  }
}

function clearProcessingStageInterval() {
  if (processingStageInterval) {
    debugLog("Clearing processing stage interval");
    clearInterval(processingStageInterval);
    processingStageInterval = null;
  }
}

function updateProcessingStage() {
  const statusSection = document.getElementById("status-section");
  const processingStage = document.getElementById("processing-stage");

  if (!statusSection) {
    console.warn("Status section not found");
    return;
  }
  if (!processingStage) {
    console.warn("Processing stage element not found");
    return;
  }
  if (!Array.isArray(processingStages) || processingStages.length === 0) {
    console.error("processingStages is not properly defined");
    return;
  }
  if (currentStageIndex < 0 || currentStageIndex >= processingStages.length) {
    console.error("Invalid currentStageIndex:", currentStageIndex);
    currentStageIndex = 0; // Reset to a valid index
  }

  if (!statusSection.classList.contains("hidden")) {
    processingStage.textContent = processingStages[currentStageIndex];
    currentStageIndex = (currentStageIndex + 1) % processingStages.length;
    debugLog(
      "Updated processing stage to: " + processingStages[currentStageIndex]
    );
  } else {
    console.warn("Status section is hidden. Skipping update.");
  }
}

function initializeProcessingStage() {
  debugLog("Initializing processing stage");
  updateProcessingStage();
  processingStageInterval = setInterval(updateProcessingStage, 3000);
}

function safeUpdateProcessingStage() {
  try {
    if (document.readyState === "complete") {
      updateProcessingStage();
    } else {
      window.addEventListener("load", updateProcessingStage);
    }
  } catch (error) {
    console.error("Error in safeUpdateProcessingStage:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  debugLog("DOM Content Loaded");

  const uploadIcon = document.querySelector(".upload-icon");
  const fileNameElement = document.getElementById("file-name");
  const urlInput = document.getElementById("url-input");

  if (uploadIcon && fileNameElement && urlInput) {
    // Add the event listener to the upload icon only once
    uploadIcon.addEventListener("click", handleFileUpload);

    urlInput.addEventListener("input", () => {
      if (urlInput.value.trim() !== "") {
        fileNameElement.textContent = ""; // Clear file name when URL is entered
        fileNameElement.file = null; // Clear the stored File object
      }
    });
  } else {
    console.error("One or more elements for file upload not found");
  }

  const submitBtn = document.getElementById("submit-job");
  if (submitBtn) {
    submitBtn.addEventListener("click", handleSubmit);
  } else {
    console.error("Submit button not found");
  }

  const cancelBtn = document.getElementById("cancel-job");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      document.getElementById("language-modal").classList.add("hidden");
    });
  } else {
    console.error("Cancel button not found");
  }

  // Initialize other parts of your application
  initAuth0().catch((error) => console.error("Error initializing app:", error));
});

let fileInput; // Объявляем переменную для хранения элемента fileInput
function handleFileUpload() {
  const fileNameElement = document.getElementById("file-name");
  const urlInput = document.getElementById("url-input");
  if (!fileInput) {
    // Создаем элемент fileInput только один раз
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".srt,.wav,.ogg,.vtt,.mp3,.mp4,.m4a";
    fileInput.style.display = "none";
    // Добавляем элемент в body
    document.body.appendChild(fileInput);
    // Добавляем обработчик изменения только один раз
    fileInput.addEventListener(
      "change",
      (event) => {
        const file = event.target.files[0];
        if (file) {
          fileNameElement.textContent = file.name;
          fileNameElement.file = file; // Сохраняем объект File
          urlInput.value = ""; // Очищаем URL input при выборе файла
          debugLog("File selected: " + file.name);
        } else {
          fileNameElement.textContent = "";
          fileNameElement.file = null; // Очищаем сохраненный объект File
          debugLog("No file selected");
        }
      },
      { once: true }
    ); // Обработчик с опцией { once: true } для удаления после первого вызова
  }
  fileInput.click();
}

function initializeProcessingStage() {
  debugLog("Initializing processing stage");
  updateProcessingStage();
  processingStageInterval = setInterval(updateProcessingStage, 3000);
}

// Ensure all functions are in global scope
window.onConvertClick = onConvertClick;
window.login = login;
window.logout = logout;
window.reset = reset;
window.updateProcessingStage = updateProcessingStage;
window.initializeProcessingStage = initializeProcessingStage;