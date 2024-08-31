let auth0Client = null;
let stripe = null;
let selectedLanguage = 'en'; // Default language
let pollingInterval;
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

function initStripe() {
  if (!stripe) {
    const stripePublishableKey = 'pk_live_51M7o8vFSngJcZDqfHcvpYSTIJ2TKO4SOlRKYrhkCe2HL8oXnoiCcKDuNluTjBwJsjIqBHHIONNAjFn1mC1qQ1HON00kuu0frmg'; // Replace with your actual publishable key
    if (!stripePublishableKey) {
      console.error('Stripe publishable key is not set');
      return null;
    }
    stripe = Stripe(stripePublishableKey);
  }
  return stripe;
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
  const statusSection = document.getElementById("status-section");
  const doneSection = document.getElementById("done-section");
  const errorSection = document.getElementById("error-section");

  const fileName = document.getElementById("file-name")?.textContent || "Unknown file";
  const userEmail = document.getElementById("user-email")?.textContent || "Unknown email";

  // Hide all sections first
  [inputSection, statusSection, doneSection, errorSection].forEach(section => {
    if (section) section.classList.add("hidden");
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
        statusSection.innerHTML = `
          <p>File: ${fileName}</p>
          <p>Email: ${userEmail}</p>
          <p>Status: ${status}</p>
          ${message ? `<p>${message}</p>` : ''}
          <div id="processing-stage"></div>
        `;
        initializeProcessingStage();
      } else {
        console.error("Status section not found");
      }
      break;
    case "done":
      if (doneSection) {
        doneSection.classList.remove("hidden");
        doneSection.innerHTML = `
          <p>File: ${fileName}</p>
          <p>Email: ${userEmail}</p>
          <p>Status: Completed</p>
          ${message ? `<p>${message}</p>` : ''}
        `;
      } else {
        console.error("Done section not found");
      }
      clearProcessingStageInterval();
      break;
    case "error":
      if (errorSection) {
        errorSection.classList.remove("hidden");
        errorSection.innerHTML = `
          <p>File: ${fileName}</p>
          <p>Email: ${userEmail}</p>
          <p>Status: Error</p>
          <p>${message || "An error occurred. Please try again."}</p>
        `;
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

function getPriceFromUI() {
  const coffeePrice = document.getElementById('coffee-price').textContent;
  const price = parseFloat(coffeePrice.replace('$', ''));
  return price;
}

async function createCheckoutSession(price, lang) {
  const stripeInstance = initStripe();
  if (!stripeInstance) {
    console.error('Stripe has not been initialized');
    return null;
  }

  try {
    const response = await fetch('https://platogram.vercel.app/api/create-checkout-session', {
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
  } catch (error) {
    console.error('Error creating checkout session:', error);
    updateUIStatus('error', 'Failed to create checkout session');
    return null;
  }
}

async function uploadFile(file) {
    console.log('Starting file upload process');
    console.log('File details:', file.name, file.type, file.size);

    const uploadProcessSection = document.getElementById('upload-process-section');
    if (!uploadProcessSection) {
        console.error('Upload process section not found');
        throw new Error('Upload process section not found');
    }

    // Trigger upload-process-section
    toggleSection('upload-process-section');

    try {
        const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/upload-handler',
            onProgress: (progress) => {
                const percentage = (progress.percent * 100).toFixed(2);
                console.log(`Upload progress: ${percentage}%`);
                updateUploadProgress(progress.percent * 100);
            },
        });

        console.log('File upload completed. Final URL:', blob.url);
        return blob.url;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
}

function updateUploadProgress(progress) {
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadProgressText = document.getElementById('upload-progress-text');
    if (uploadProgressBar && uploadProgressText) {
        uploadProgressBar.style.width = `${progress}%`;
        uploadProgressText.textContent = `Uploading: ${progress.toFixed(2)}%`;
    } else {
        console.error('Progress bar or text element not found');
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    console.log('handleSubmit called');
    const price = getPriceFromUI();
    const inputData = getInputData();
    const submitButton = document.getElementById('submit-btn');
    const submitButtonText = document.getElementById('submit-btn-text');
    const submitSpinner = document.getElementById('submit-spinner');
    const modal = document.getElementById('language-modal');

    if (!inputData) {
        console.error('No input data provided');
        updateUIStatus("error", "Please provide a URL or upload a file before submitting.");
        return;
    }

    try {
        submitButton.disabled = true;
        submitSpinner.classList.remove('hidden');

        let fileUrl;
        if (inputData instanceof File) {
            modal.classList.add('hidden'); // Close the modal before starting upload
            console.log('Starting file upload');
            try {
                fileUrl = await uploadFile(inputData);
                console.log('File uploaded successfully, URL:', fileUrl);
            } catch (uploadError) {
                throw new Error(`File upload failed: ${uploadError.message}`);
            }
        } else {
            fileUrl = inputData;
            console.log('Using provided URL:', fileUrl);
        }

        toggleSection('status-section'); // Switch to status section after upload
        updateUIStatus("running", "Starting conversion...");

        if (price > 0) {
            console.log('Non-zero price detected, initiating Stripe checkout');
            const user = await auth0Client.getUser();
            const email = user.email || user["https://platogram.com/user_email"];
            if (!email) {
                throw new Error('User email not available');
            }

            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    price: price,
                    lang: selectedLanguage,
                    email: email,
                    fileUrl: fileUrl
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to create checkout session');
            }

            const session = await response.json();
            const stripeInstance = initStripe();
            if (!stripeInstance) {
                throw new Error('Failed to initialize Stripe');
            }

            const result = await stripeInstance.redirectToCheckout({
                sessionId: session.id,
            });

            if (result.error) {
                throw new Error(result.error.message);
            }
        } else {
            console.log('Free conversion, proceeding with postToConvert');
            updateUIStatus("running", "Starting conversion...");
            await postToConvert(fileUrl, selectedLanguage, null, price);
        }
    } catch (error) {
        console.error('Error in handleSubmit:', error);
        updateUIStatus("error", "Error: " + error.message);
    } finally {
        submitButtonText.textContent = "Submit";
        submitButton.disabled = false;
        submitSpinner.classList.add('hidden');
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

function handleStripeRedirect() {
  const query = new URLSearchParams(window.location.search);
  if (query.get('success')) {
    console.log('Payment successful! You will receive an email confirmation.');
    updateUIStatus('done', 'Payment successful! You will receive an email confirmation.');
  }
  if (query.get('canceled')) {
    console.log('Order canceled -- continue to shop around and checkout when you are ready.');
    updateUIStatus('idle', 'Order canceled. You can try again when you are ready.');
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
    if (!inputData) {
      updateUIStatus("error", "Please provide a valid URL or upload a file to be converted");
      return;
    }

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

  const handleLanguageSelection = (lang) => {
    debugLog(`Language selected: ${lang}`);
    selectedLanguage = lang;
    // Update UI to show selected language if needed
  };
  // Update modal content with inputData and price if needed

  document.getElementById("submit-btn").onclick = handleSubmit;
  document.getElementById("cancel-btn").onclick = () => {
    debugLog("Language selection cancelled");
    modal.classList.add("hidden");
  };
}

async function postToConvert(inputData, lang, sessionId, price) {
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

  // inputData is now always a URL (either the original URL or the URL of the uploaded file)
  formData.append("payload", inputData);

  try {
    console.log("Sending data to Platogram for conversion");
    const response = await fetch("https://temporary.name/convert", {
      method: "POST",
      headers: headers,
      body: formData,
    });

    const result = await response.json();

    if (result.message === "Conversion started" || result.status === "processing") {
      updateUIStatus("running");
      pollStatus(await auth0Client.getTokenSilently());
      
     // Check if the inputData is a Blob URL and trigger cleanup
     if (inputData.includes('.public.blob.vercel-storage.com/')) {
        try {
          console.log("Attempting to delete temporary file");
          const cleanupResponse = await fetch('https://vercel.platogram.app/blob-upload', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await auth0Client.getTokenSilently()}`
            },
            body: JSON.stringify({ fileUrl: inputData })
          });

          if (cleanupResponse.ok) {
            console.log("Temporary file successfully deleted");
          } else {
            console.error("Failed to delete temporary file");
          }
        } catch (cleanupError) {
          console.error("Error during file cleanup:", cleanupError);
        }
      } else {
        console.log("Input is not a Blob URL, no cleanup needed");
      }
    } else {
      updateUIStatus("error", "Unexpected response from server");
    }
  } catch (error) {
    console.error("Error:", error);
    updateUIStatus("error", error.message);
  }
}

function getInputData() {
  const urlInput = document.getElementById("url-input").value.trim();
  const fileInput = document.getElementById("file-upload").files[0];
  return urlInput || fileInput || null;
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

function pollStatus(token) {
  clearInterval(pollingInterval);

  async function checkStatus() {
    try {
      const response = await fetch("https://temporary.name/status", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Polling status response:", result);

      updateUIStatus(result.status);

      if (result.status === "running") {
        pollingInterval = setTimeout(checkStatus, 5000); // Poll every 5 seconds
      } else {
        clearTimeout(pollingInterval);
      }
    } catch (error) {
      console.error("Error polling status:", error);
      updateUIStatus("error", `An error occurred while checking status: ${error.message}`);
      clearTimeout(pollingInterval);
    }
  }

  checkStatus();
}

function toggleSection(sectionToShow) {
  const sections = [
    "input-section",
    "file-upload-section",
    "status-section",
    "error-section",
    "done-section"
  ];

  sections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      if (sectionId === sectionToShow) {
        section.classList.remove("hidden");
      } else {
        section.classList.add("hidden");
      }
    } else {
      console.warn(`Section not found: ${sectionId}`);
    }
  });
}

function updateUIStatus(status, message = "") {
  debugLog(`Updating UI status: ${status}`);
  const statusSection = document.getElementById("status-section");
  const fileName = document.getElementById("file-name").textContent;
  const userEmail = document.getElementById("user-email").textContent;

  if (statusSection) {
    statusSection.innerHTML = `
      <p>File: ${fileName}</p>
      <p>Email: ${userEmail}</p>
      <p>Status: ${status}</p>
      ${message ? `<p>${message}</p>` : ''}
    `;
  }

  toggleSection(status === "running" ? "status-section" :
                status === "done" ? "done-section" :
                status === "error" ? "error-section" : "input-section");
}

function toggleSection(sectionToShow) {
  const sections = [
    "input-section",
    "file-upload-section",
    "upload-process-section",
    "status-section",
    "error-section",
    "done-section"
  ];

  sections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.classList.toggle("hidden", sectionId !== sectionToShow);
    } else {
      console.warn(`Section not found: ${sectionId}`);
    }
  });
}

// Update these functions to use toggleSection
function toggleSections(hiddenSection, visibleSection) {
  toggleSection(visibleSection.id);
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
  let processingStage = document.getElementById("processing-stage");

  if (!statusSection) {
    debugLog("Status section not found");
    return;
  }

  if (!processingStage) {
    processingStage = document.createElement("div");
    processingStage.id = "processing-stage";
    statusSection.appendChild(processingStage);
    debugLog("Created processing stage element");
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
    debugLog("Updated processing stage to: " + processingStages[currentStageIndex]);
  } else {
    debugLog("Status section is hidden. Skipping update.");
  }
}

function initializeProcessingStage() {
  debugLog("Initializing processing stage");
  const processingStage = document.getElementById("processing-stage");
  if (!processingStage) {
    debugLog("Processing stage element not found. Skipping initialization.");
    return;
  }
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
  initStripe();
  handleStripeRedirect();

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

  const submitBtn = document.getElementById("submit-btn"); // Changed from "submit-job" to "submit-btn"
  if (submitBtn) {
    submitBtn.addEventListener("click", handleSubmit);
    debugLog("Submit button listener added");
  } else {
    console.error("Submit button not found");
  }

  const cancelBtn = document.getElementById("cancel-btn"); // Changed from "cancel-job" to "cancel-btn"
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      debugLog("Cancel button clicked");
      document.getElementById("language-modal").classList.add("hidden");
    });
    debugLog("Cancel button listener added");
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
  const processingStage = document.getElementById("processing-stage");
  if (!processingStage) {
    debugLog("Processing stage element not found. Skipping initialization.");
    return;
  }
  updateProcessingStage();
  processingStageInterval = setInterval(updateProcessingStage, 3000);
}

// Ensure all functions are in global scope
window.onConvertClick = onConvertClick;
window.login = login;
window.logout = logout;
window.reset = reset;
window.handleSubmit = handleSubmit;
window.initializeProcessingStage = initializeProcessingStage;
window.updateProcessingStage = updateProcessingStage;
window.handleStripeRedirect = handleStripeRedirect;
window.handleStripeSuccess = handleStripeSuccess;
window.handleStripeCancel = handleStripeCancel;