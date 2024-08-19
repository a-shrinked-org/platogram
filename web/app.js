let auth0Client = null;

const processingStages = [
  "Byte Whispering", "Qubit Juggling", "Syntax Gymnastics",
  "Pixel Wrangling", "Neuron Tickling", "Algorithm Disco",
  "Data Origami", "Bit Barbecue", "Logic Limbo",
  "Quantum Knitting"
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

function updateUIStatus(status, errorMessage = "") {
  debugLog(`Updating UI status: ${status}`);
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
    const fileNameElement = document.getElementById("file-name");

    if (urlInput) urlInput.value = "";
    if (fileNameElement) fileNameElement.textContent = "";

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
    if (event) event.preventDefault();
    debugLog("Convert button clicked");

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

  const maxSizeMB = 50; // Adjust based on server limit

  if (inputData.file) {
    const fileSizeMB = inputData.file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      updateUIStatus("error", `File size exceeds ${maxSizeMB}MB limit. Please choose a smaller file.`);
      return;
    }
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
    debugLog("Obtained token for convert");

    headers.Authorization = `Bearer ${token}`;

    const response = await fetch("/convert", {
      method: "POST",
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server error response:", errorText);
      if (response.status === 413) {
        throw new Error("File size too large. Please choose a smaller file or use a URL for large audio files.");
      }
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.json();
    debugLog("Convert response: " + JSON.stringify(result));

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
  const fileNameElement = document.getElementById("file-name");
  const maxSizeMB = 10; // Adjust based on server limit

  if (fileNameElement && fileNameElement.file) {
    const fileSizeMB = fileNameElement.file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      throw new Error(`File size exceeds ${maxSizeMB}MB limit. Please choose a smaller file.`);
    }
  }

  return {
    url: urlInput ? urlInput.value.trim() : '',
    file: fileNameElement && fileNameElement.file ? fileNameElement.file : null
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
    console.error("Language modal not found in the DOM");
    return;
  }

  modal.classList.remove('hidden');
  modal.style.display = 'block'; // or 'flex', depending on your layout

  const handleLanguageSelection = async (lang) => {
    debugLog(`Language selected: ${lang}`);
    modal.classList.add('hidden');
    await postToConvert(inputData, lang);
  };

  document.getElementById('en-btn').onclick = () => handleLanguageSelection('en');
  document.getElementById('es-btn').onclick = () => handleLanguageSelection('es');
  document.getElementById('cancel-btn').onclick = () => {
    debugLog("Language selection cancelled");
    modal.classList.add('hidden');
  };
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
    debugLog("Polling status response: " + JSON.stringify(result));

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
    debugLog("Updated processing stage to: " + processingStages[currentStageIndex]);
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
    if (document.readyState === 'complete') {
      updateProcessingStage();
    } else {
      window.addEventListener('load', updateProcessingStage);
    }
  } catch (error) {
    console.error("Error in safeUpdateProcessingStage:", error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  debugLog("DOM Content Loaded");

  const uploadIcon = document.querySelector('.upload-icon');
  const fileNameElement = document.getElementById('file-name');
  const urlInput = document.getElementById('url-input');

  if (uploadIcon && fileNameElement && urlInput) {
    uploadIcon.addEventListener('click', () => {
      // Remove any existing file input
      const existingFileInput = document.getElementById('temp-file-input');
      if (existingFileInput) {
        document.body.removeChild(existingFileInput);
      }

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'temp-file-input';
      fileInput.accept = '.srt,.wav,.ogg,.vtt,.mp3,.mp4,.m4a';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.click();

      fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
          fileNameElement.textContent = file.name;
          fileNameElement.file = file; // Store the File object
          urlInput.value = ''; // Clear URL input when file is selected
          debugLog("File selected: " + file.name);
        } else {
          fileNameElement.textContent = '';
          fileNameElement.file = null; // Clear the stored File object
          debugLog("No file selected");
        }
        document.body.removeChild(fileInput);
      });
    }, { once: true }); // Ensure the event listener is only added once

    urlInput.addEventListener('input', () => {
      if (urlInput.value.trim() !== '') {
        fileNameElement.textContent = ''; // Clear file name when URL is entered
        fileNameElement.file = null; // Clear the stored File object
      }
    });
  } else {
    console.error("One or more elements for file upload not found");
  }

  // Initialize other parts of your application
  initAuth0().catch((error) => console.error("Error initializing app:", error));
});

// Ensure all functions are in global scope
window.onConvertClick = onConvertClick;
window.login = login;
window.logout = logout;
window.onDonateClick = onDonateClick;
window.reset = reset;
window.updateProcessingStage = updateProcessingStage;