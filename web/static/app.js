let auth0Client = null;

const processingStages = [
  "Byte Whispering", "Qubit Juggling", "Syntax Gymnastics",
  "Pixel Wrangling", "Neuron Tickling", "Algorithm Disco",
  "Data Origami", "Bit Barbecue", "Logic Limbo",
  "Quantum Knitting"
];
let currentStageIndex = 0;
let processingStageInterval;

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
        console.log("Auth0 client initialized successfully");

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

function updateUIStatus(status, errorMessage = "") {
  console.log(`Updating UI status: ${status}`);
  const inputSection = document.getElementById("input-section");
  const statusSection = document.getElementById("status-section");
  const errorSection = document.getElementById("error-section");
  const doneSection = document.getElementById("done-section");
  const processingStage = document.getElementById("processing-stage");

  [inputSection, statusSection, errorSection, doneSection].forEach(section => {
    if (section) {
      section.classList.add("hidden");
    } else {
      console.warn(`Section not found: ${section}`);
    }
  });

  switch (status) {
    case "running":
      if (statusSection && processingStage) {
        statusSection.classList.remove("hidden");
        updateProcessingStage();
        if (!processingStageInterval) {
          processingStageInterval = setInterval(updateProcessingStage, 3000);
        }
      } else {
        console.error("Status section or processing stage element not found");
      }
      break;
    case "done":
      clearProcessingStageInterval();
      if (doneSection) {
        doneSection.classList.remove("hidden");
      } else {
        console.error("Done section not found");
      }
      break;
    case "idle":
      clearProcessingStageInterval();
      if (inputSection) {
        inputSection.classList.remove("hidden");
      } else {
        console.error("Input section not found");
      }
      break;
    case "error":
      clearProcessingStageInterval();
      if (errorSection) {
        errorSection.classList.remove("hidden");
        const errorParagraph = errorSection.querySelector("p");
        if (errorParagraph) {
          errorParagraph.textContent = errorMessage || "An error occurred. Please try again.";
        } else {
          console.error("Error paragraph not found in error section");
        }
      } else {
        console.error("Error section not found");
      }
      break;
    default:
      clearProcessingStageInterval();
      console.error(`Unknown status: ${status}`);
  }
}

function clearProcessingStageInterval() {
  if (processingStageInterval) {
    console.log("Clearing processing stage interval");
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
    console.log("Logged in as:", user.email);
  }
}

async function reset() {
  try {
    if (!auth0Client) throw new Error("Auth0 client not initialized");

    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });

    const response = await fetch("/reset", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error("Failed to reset");

    const urlInput = document.getElementById("url-input");
    const fileUpload = document.getElementById("file-upload");
    const fileName = document.getElementById("file-name");

    if (urlInput) urlInput.value = "";
    if (fileUpload) fileUpload.value = "";
    if (fileName) fileName.textContent = "";

    pollStatus(token);
  } catch (error) {
    console.error("Error resetting:", error);
    updateUIStatus("error", "Failed to reset. Please try again.");
  }
}

function onDonateClick() {
  window.open("https://buy.stripe.com/eVa29p3PK5OXbq84gl", "_blank");
}

async function onConvertClick(event) {
    event.preventDefault();
    console.log("Convert button clicked");

    try {
        if (!auth0Client) throw new Error("Auth0 client not initialized");

        const inputData = getInputData();
        if (!inputData.url && !inputData.file) {
            showErrorMessage("Please provide a URL or upload a file");
            return;
        }

        if (await auth0Client.isAuthenticated()) {
            showLanguageSelectionModal(inputData);
        } else {
            login();
        }
    } catch (error) {
        console.error("Error in onConvertClick:", error);
        updateUIStatus("error", error.message);
    }
}

function showErrorMessage(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    } else {
        console.error("Error message element not found");
    }
}

async function postToConvert(inputData, lang) {
  let body;
  let headers = {};
  const formData = new FormData();
  formData.append('lang', lang);

  if (inputData.file) {
    formData.append('file', inputData.file);
  } else if (inputData.url) {
    formData.append("payload", inputData.url);
  } else {
    updateUIStatus("error", "No input provided. Please enter a URL or upload a file.");
    return;
  }

  body = formData;

  try {
    updateUIStatus("running", "Starting conversion process...");

    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });
    console.log("Obtained token for convert");

    headers.Authorization = `Bearer ${token}`;

    const response = await fetch("/convert", {
      method: "POST",
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server error response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.json();
    console.log("Convert response:", result);

    if (result.message === "Conversion started") {
      updateUIStatus("running", "Conversion started. Processing your request...");
      await pollStatus(token);
    } else {
      throw new Error("Unexpected response from server");
    }
  } catch (error) {
    console.error("Error in postToConvert:", error);
    updateUIStatus("error", error.message || "An error occurred during conversion");
  }
}

function getInputData() {
    const urlInput = document.getElementById("url-input");
    const fileUpload = document.getElementById("file-upload");
    return {
        url: urlInput ? urlInput.value.trim() : '',
        file: fileUpload ? fileUpload.files[0] : null
    };
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

function showLanguageSelectionModal(inputData) {
  const modal = document.getElementById('language-modal');
  if (!modal) {
    console.error("Language modal not found");
    return;
  }

  modal.classList.remove('hidden');

  const handleLanguageSelection = async (lang) => {
    modal.classList.add('hidden');
    await postToConvert(inputData, lang);
  };

  document.getElementById('en-btn').onclick = () => handleLanguageSelection('en');
  document.getElementById('es-btn').onclick = () => handleLanguageSelection('es');
  document.getElementById('cancel-btn').onclick = () => modal.classList.add('hidden');
}

async function pollStatus(token) {
  try {
    const response = await fetch("/status", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Polling status response:", result);

    switch (result.status) {
      case "running":
        updateUIStatus("running", "Processing your request...");
        setTimeout(() => pollStatus(token), 5000);
        break;
      case "idle":
        updateUIStatus("idle", "Ready for new conversion");
        break;
      case "failed":
        let errorMessage = result.error || "An error occurred during processing";
        if (errorMessage.includes("YouTube requires authentication")) {
          errorMessage = "YouTube requires authentication for this video. Please try a different video or provide a direct audio file.";
        }
        console.error("Conversion failed:", errorMessage);
        updateUIStatus("error", errorMessage);
        break;
      case "done":
        updateUIStatus("done", "Your request has been processed successfully!");
        break;
      default:
        console.error("Unexpected status:", result.status);
        updateUIStatus("error", "Unexpected status response");
    }
  } catch (error) {
    console.error("Error polling status:", error);
    updateUIStatus("error", `An error occurred while checking status: ${error.message}`);
  }
}

function updateProcessingStage() {
  const statusSection = document.getElementById('status-section');
  const processingStage = document.getElementById('processing-stage');

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
    currentStageIndex = 0;  // Reset to a valid index
  }

  if (!statusSection.classList.contains('hidden')) {
    processingStage.textContent = processingStages[currentStageIndex];
    currentStageIndex = (currentStageIndex + 1) % processingStages.length;
    console.log("Updated processing stage to:", processingStages[currentStageIndex]);
  } else {
    console.warn("Status section is hidden. Skipping update.");
  }
}

function initializeProcessingStage() {
  console.log("Initializing processing stage");
  updateProcessingStage();
  processingStageInterval = setInterval(updateProcessingStage, 3000);
}

function safeUpdateProcessingStage() {
  try {
    if (document.readyState === 'complete') {
      updateProcessingStage();
    } else {
      window.addEventListener('load', updateProcessingStage);
    }
  } catch (error) {
    console.error("Error in safeUpdateProcessingStage:", error);
  }
}

