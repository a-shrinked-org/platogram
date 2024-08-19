let auth0Client = null;

const processingStages = [
  "Byte Whispering", "Qubit Juggling", "Syntax Gymnastics",
  "Pixel Wrangling", "Neuron Tickling", "Algorithm Disco",
  "Data Origami", "Bit Barbecue", "Logic Limbo",
  "Quantum Knitting"
];
let currentStageIndex = 0;

// Initialize Auth0
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

        // Check for the code and state parameters
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

  // Check if elements exist before manipulating them
  if (inputSection) inputSection.classList.add("hidden");
  if (statusSection) statusSection.classList.add("hidden");
  if (errorSection) errorSection.classList.add("hidden");
  if (doneSection) doneSection.classList.add("hidden");

  switch (status) {
    case "running":
      if (statusSection) {
        statusSection.classList.remove("hidden");
        if (processingStage) {
          try {
            processingStage.textContent = processingStages[currentStageIndex];
          } catch (error) {
            console.error("Error setting processing stage text:", error);
          }
        } else {
          console.warn("Processing stage element not found");
        }
      }
      break;
    case "done":
      if (doneSection) doneSection.classList.remove("hidden");
      break;
    case "idle":
      if (inputSection) inputSection.classList.remove("hidden");
      break;
    case "error":
      if (errorSection) {
        errorSection.classList.remove("hidden");
        const errorParagraph = errorSection.querySelector("p");
        if (errorParagraph) {
          try {
            errorParagraph.textContent = errorMessage || "An error occurred. Please try again.";
          } catch (error) {
            console.error("Error setting error message:", error);
          }
        } else {
          console.warn("Error paragraph not found");
        }
      }
      break;
  }
}

// Update UI based on authentication state
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
    if (!auth0Client) {
      throw new Error("Auth0 client not initialized");
    }

    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });

    // Call the /reset endpoint
    const response = await fetch("/reset", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to reset");
    }

    // Clear input fields
    const urlInput = document.getElementById("url-input");
    if (urlInput) urlInput.value = "";

    // Poll status after reset
    pollStatus(token);
  } catch (error) {
    console.error("Error resetting:", error);
    updateUIStatus("error", "Failed to reset. Please try again.");
  }
}

async function onDonateClick() {
  // Open Stripe payment link in a new tab
  window.open("https://buy.stripe.com/eVa29p3PK5OXbq84gl", "_blank");
}

// Handle the 'Convert' button click
async function onConvertClick(event) {
  event.preventDefault();
  console.log("Convert button clicked");

  try {
    if (!auth0Client) {
      throw new Error("Auth0 client not initialized");
    }

    const inputData = getInputData();
    if (!inputData.url && !inputData.file) {
      throw new Error("Please provide a URL or upload a file");
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

function showLanguageSelectionModal(inputData) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background-color: white;
    padding: 20px;
    border-radius: 5px;
    text-align: center;
  `;

  modalContent.innerHTML = `
    <h3>Select Language</h3>
    <button id="en-btn">English</button>
    <button id="es-btn">Spanish</button>
    <button id="cancel-btn">Cancel</button>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle language selection
  const handleLanguageSelection = async (lang) => {
    document.body.removeChild(modal);
    await postToConvert(inputData, lang);
  };

  document.getElementById('en-btn').onclick = () => handleLanguageSelection('en');
  document.getElementById('es-btn').onclick = () => handleLanguageSelection('es');
  document.getElementById('cancel-btn').onclick = () => document.body.removeChild(modal);
}

// Get input data (URL or File)
function getInputData() {
  const urlInput = document.getElementById("url-input");
  const fileInput = document.getElementById("file-upload");
  return {
    url: urlInput ? urlInput.value.trim() : '',
    file: fileInput ? fileInput.files[0] : null
  };
}
// Login
async function login() {
  try {
    if (!auth0Client) {
      throw new Error("Auth0 client not initialized");
    }
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: window.location.origin,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    updateUIStatus("error", "Failed to log in. Please try again.");
  }
}

// Logout
async function logout() {
  try {
    if (!auth0Client) {
      throw new Error("Auth0 client not initialized");
    }
    await auth0Client.logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  } catch (error) {
    console.error("Error logging out:", error);
    updateUIStatus("error", "Failed to log out. Please try again.");
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
    try {
      new URL(inputData.url); // This will throw an error if the URL is invalid
      formData.append("payload", inputData.url);
    } catch (e) {
      console.error("Invalid URL:", inputData.url);
      updateUIStatus("error", "Invalid URL provided. Please enter a valid URL.");
      return;
    }
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

async function pollStatus(token) {
  try {
    const response = await fetch("/status", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Polling status response:", result);

    if (result.status === "running") {
      updateUIStatus("running", "Processing your request...");
      setTimeout(() => pollStatus(token), 5000);  // Poll again in 5 seconds
    } else if (result.status === "idle") {
      updateUIStatus("idle", "Ready for new conversion");
    } else if (result.status === "failed") {
      let errorMessage = result.error || "An error occurred during processing";
      if (errorMessage.includes("YouTube requires authentication")) {
        errorMessage = "YouTube requires authentication for this video. Please try a different video or provide a direct audio file.";
      }
      updateUIStatus("error", errorMessage);
    } else if (result.status === "done") {
      updateUIStatus("done", "Your request has been processed successfully!");
    } else {
      updateUIStatus("error", "Unexpected status response");
    }
  } catch (error) {
    console.error("Error polling status:", error);
    updateUIStatus("error", error.message || "An error occurred while checking status");
  }
}

let processingStageInterval;

function updateProcessingStage() {
  const statusSection = document.getElementById('status-section');
  const processingStage = document.getElementById('processing-stage');

  if (statusSection && !statusSection.classList.contains('hidden') && processingStage) {
    processingStage.textContent = processingStages[currentStageIndex];
    currentStageIndex = (currentStageIndex + 1) % processingStages.length;
  } else {
    console.warn("Status section is hidden or processing stage element not found. Skipping update.");
  }
}

function initializeProcessingStage() {
  updateProcessingStage(); // Initial update
  setInterval(updateProcessingStage, 3000);
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
  console.log("DOM Content Loaded");

  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  const convertButton = document.getElementById('convert-button');
  const donateButton = document.getElementById('donate-button');
  const donateButtonStatus = document.getElementById('donate-button-status');
  const resetButton = document.getElementById('reset-button');
  const resetButtonError = document.getElementById('reset-button-error');
  const testAuthButton = document.getElementById('test-auth-button');

  if (loginButton) {
    loginButton.addEventListener('click', login);
  } else {
    console.warn("Login button not found");
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  } else {
    console.warn("Logout button not found");
  }

  const convertButton = document.getElementById('convert-button');
  if (convertButton) {
    convertButton.addEventListener('click', onConvertClick);
    console.log("Convert button event listener added");
  } else {
    console.warn("Convert button not found");
  }

  if (donateButton) {
    donateButton.addEventListener('click', onDonateClick);
  } else {
    console.warn("Donate button not found");
  }

  if (donateButtonStatus) {
    donateButtonStatus.addEventListener('click', onDonateClick);
  } else {
    console.warn("Donate button status not found");
  }

  if (resetButton) {
    resetButton.addEventListener('click', reset);
  } else {
    console.warn("Reset button not found");
  }

  if (resetButtonError) {
    resetButtonError.addEventListener('click', reset);
  } else {
    console.warn("Reset button error not found");
  }

  if (testAuthButton) {
    testAuthButton.addEventListener('click', testAuth);
    console.log("Test auth button event listener added");
  } else {
    console.warn("Test auth button not found");
  }

  const fileUpload = document.getElementById('file-upload');
  if (fileUpload) {
    fileUpload.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const fileNameElement = document.getElementById('file-name');
        if (fileNameElement) {
          fileNameElement.textContent = file.name;
        } else {
          console.warn("File name element not found");
        }
      }
    });
  } else {
    console.warn("File upload input not found");

  safeUpdateProcessingStage();
  initializeProcessingStage();
  setInterval(safeUpdateProcessingStage, 3000);

  // Initialize Auth0
  initAuth0().catch((error) => console.error("Error initializing app:", error));
});

async function testAuth() {
  console.log("Test Auth function called");
  try {
    if (!auth0Client) {
      throw new Error("Auth0 client not initialized");
    }

    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });
    console.log("Token obtained:", token.substring(0, 10) + "...");

    const response = await fetch("/test-auth", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Auth test result:", data);
    alert("Auth test successful. Check console for details.");
  } catch (error) {
    console.error("Auth test failed:", error);
    alert("Auth test failed. Error: " + error.message);
  }
}

// Ensure all functions are in global scope
window.onConvertClick = onConvertClick;
window.login = login;
window.logout = logout;
window.onDonateClick = onDonateClick;
window.reset = reset;
window.testAuth = testAuth;
window.updateProcessingStage = updateProcessingStage;