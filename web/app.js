let auth0Client = null;

const processingStages = [
  "Byte Whispering", "Qubit Juggling", "Syntax Gymnastics",
  "Pixel Wrangling", "Neuron Tickling", "Algorithm Disco",
  "Data Origami", "Bit Barbecue", "Logic Limbo",
  "Quantum Knitting"
];
let currentStageIndex = 0;

async function initAuth0() {
  console.log("Initializing Auth0...");
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
        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
            await handleRedirectCallback();
        }

        await updateUI();
    } catch (error) {
        console.error("Error initializing Auth0:", error);
        updateUIStatus("error", "Failed to initialize authentication. Please try refreshing the page.");
    }
}

function updateUIStatus(status, errorMessage = "") {
  const sections = {
    "input-section": "idle",
    "status-section": "running",
    "error-section": "error",
    "done-section": "done"
  };

  Object.entries(sections).forEach(([id, sectionStatus]) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.toggle("hidden", status !== sectionStatus);
      if (status === "error" && id === "error-section") {
        const errorElement = element.querySelector("p");
        if (errorElement) {
          errorElement.textContent = errorMessage || "An error occurred. Please try again.";
        }
      }
    }
  });
}

async function handleRedirectCallback() {
    try {
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, "/");
    } catch (error) {
        console.error("Error handling redirect callback:", error);
    }
}

async function updateUI() {
  console.log("Updating UI...");
  const isAuthenticated = await auth0Client.isAuthenticated();
  console.log("Is authenticated:", isAuthenticated);

  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (loginButton) loginButton.style.display = isAuthenticated ? "none" : "block";
  if (logoutButton) logoutButton.style.display = isAuthenticated ? "block" : "none";

  if (isAuthenticated) {
    const user = await auth0Client.getUser();
    console.log("User info:", user);
    try {
      await pollStatus();
    } catch (error) {
      console.error("Error polling status:", error);
    }
    console.log("Logged in as:", user.email);
  } else {
    console.log("User is not authenticated");
  }
}

async function getValidToken() {
  try {
    return await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });
  } catch (error) {
    console.error("Error getting token:", error);
    if (error.error === 'login_required') {
      await login();
    }
    throw error;
  }
}

async function apiCall(url, method = 'GET', body = null) {
  const token = await getValidToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText}\n${errorText}`);
  }
  return response.json();
}

async function reset() {
  try {
    await apiCall("/reset");
    console.log("Reset successful");
    document.getElementById("url-input").value = "";
    document.getElementById("file-upload").value = "";
    document.getElementById("file-name").textContent = "";
    await pollStatus();
  } catch (error) {
    console.error("Error resetting:", error);
    updateUIStatus("error", "Failed to reset. Please try again.");
  }
}

async function onConvertClick() {
  const inputData = getInputData();
  if (await auth0Client.isAuthenticated()) {
    showLanguageSelectionModal(inputData);
  } else {
    login();
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

  const handleLanguageSelection = async (lang) => {
    document.body.removeChild(modal);
    await postToConvert(inputData, lang);
  };

  document.getElementById('en-btn').onclick = () => handleLanguageSelection('en');
  document.getElementById('es-btn').onclick = () => handleLanguageSelection('es');
  document.getElementById('cancel-btn').onclick = () => document.body.removeChild(modal);
}

function getInputData() {
  const urlInput = document.getElementById("url-input").value;
  const fileInput = document.getElementById("file-upload").files[0];
  return urlInput || fileInput;
}

async function login() {
  console.log("Initiating login process...");
  try {
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: window.location.origin,
      },
    });
    console.log("Login with redirect called successfully");
  } catch (error) {
    console.error("Error during login:", error);
    updateUIStatus("error", "Failed to log in. Please try again.");
  }
}

async function logout() {
  try {
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
  try {
    const token = await getValidToken();
    console.log("Obtained token for convert:", token);

    const formData = new FormData();
    formData.append('lang', lang);

    if (inputData instanceof File) {
      formData.append('file', inputData);
    } else {
      formData.append("payload", inputData);
    }

    const response = await fetch("/convert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server error response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.json();
    console.log("Convert response:", result);

    if (result.message === "Conversion started") {
      await pollStatus();
    } else {
      updateUIStatus("error", "Unexpected response from server");
    }
  } catch (error) {
    console.error("Error in postToConvert:", error);
    updateUIStatus("error", error.message);
  }
}

async function pollStatus() {
  try {
    const result = await apiCall("/status");
    console.log("Polling status response:", result);

    if (result.status === "running") {
      updateUIStatus("running");
      setTimeout(pollStatus, 5000);
    } else if (result.status === "idle") {
      updateUIStatus("idle");
    } else if (result.status === "failed") {
      updateUIStatus("failed", result.error);
    } else if (result.status === "done") {
      updateUIStatus("done");
    } else {
      updateUIStatus("error", "Unexpected status response");
    }
  } catch (error) {
    console.error("Error polling status:", error);
    updateUIStatus("error", error.message);
  }
}

function updateProcessingStage() {
  const element = document.getElementById('processing-stage');
  if (element) {
    element.textContent = processingStages[currentStageIndex];
    currentStageIndex = (currentStageIndex + 1) % processingStages.length;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log("DOM fully loaded and parsed");
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  const convertButton = document.getElementById('convert-button');
  const donateButton = document.getElementById('donate-button');
  const donateButtonStatus = document.getElementById('donate-button-status');
  const resetButton = document.getElementById('reset-button');
  const resetButtonError = document.getElementById('reset-button-error');
  const fileUpload = document.getElementById('file-upload');

  if (loginButton) loginButton.addEventListener('click', login);
  if (logoutButton) logoutButton.addEventListener('click', logout);
  if (convertButton) convertButton.addEventListener('click', onConvertClick);
  if (donateButton) donateButton.addEventListener('click', onDonateClick);
  if (donateButtonStatus) donateButtonStatus.addEventListener('click', onDonateClick);
  if (resetButton) resetButton.addEventListener('click', reset);
  if (resetButtonError) resetButtonError.addEventListener('click', reset);
  if (fileUpload) {
    fileUpload.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        document.getElementById('file-name').textContent = file.name;
      }
    });
  }

  setInterval(updateProcessingStage, 3000);
  updateProcessingStage();

  try {
    console.log("Initializing application...");
    await initAuth0();
  } catch (error) {
    console.error("Error during application initialization:", error);
    updateUIStatus("error", "Failed to initialize the application. Please try refreshing the page.");
  }
});

function onDonateClick() {
  console.log("Donation button clicked");
  window.open("https://buy.stripe.com/eVa29p3PK5OXbq84gl", "_blank");
}