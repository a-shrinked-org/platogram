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
  const inputSection = document.getElementById("input-section");
  const statusSection = document.getElementById("status-section");
  const errorSection = document.getElementById("error-section");
  const doneSection = document.getElementById("done-section");

  // Check if elements exist before manipulating them
  if (inputSection) inputSection.classList.add("hidden");
  if (statusSection) statusSection.classList.add("hidden");
  if (errorSection) errorSection.classList.add("hidden");
  if (doneSection) doneSection.classList.add("hidden");

  switch (status) {
    case "running":
      if (statusSection) {
        statusSection.classList.remove("hidden");
        const processingStage = document.getElementById("processing-stage");
        if (processingStage) {
          processingStage.textContent = processingStages[currentStageIndex];
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
          errorParagraph.textContent = errorMessage || "An error occurred. Please try again.";
        }
      }
      break;
  }
}

// Update UI based on authentication state
async function updateUI() {
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
    document.getElementById("url-input").value = "";

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
async function onConvertClick() {
  const inputData = getInputData();
  if (await auth0Client.isAuthenticated()) {
    // Create and show the language selection modal
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
  } else {
    login();
  }
}

// Get input data (URL or File)
function getInputData() {
  const urlInput = document.getElementById("url-input").value;
  const fileInput = document.getElementById("file-upload").files[0];
  return urlInput || fileInput;
}

// Login
async function login() {
  try {
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: window.location.origin,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
  }
}

// Logout
async function logout() {
  try {
    await auth0Client.logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  } catch (error) {
    console.error("Error logging out:", error);
  }
}

async function postToConvert(inputData, lang) {
  let body;
  let headers = {};
  const formData = new FormData();
  formData.append('lang', lang);

  if (inputData instanceof File) {
    formData.append('file', inputData);
  } else {
    // Validate URL
    try {
      new URL(inputData);
      formData.append("payload", inputData);
    } catch (e) {
      console.error("Invalid URL:", inputData);
      updateUIStatus("error", "Invalid URL provided. Please enter a valid URL.");
      return;
    }
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
      await pollStatus();
    } else {
      throw new Error("Unexpected response from server");
    }
  } catch (error) {
    console.error("Error in postToConvert:", error);
    updateUIStatus("error", error.message || "An error occurred during conversion");
  }
}

async function pollStatus() {
  try {
    const result = await apiCall("/status");
    console.log("Polling status response:", result);

    if (result.status === "running") {
      updateUIStatus("running", "Processing your request...");
      setTimeout(pollStatus, 5000);  // Poll again in 5 seconds
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
function updateProcessingStage() {
  document.getElementById('processing-stage').textContent = processingStages[currentStageIndex];
  currentStageIndex = (currentStageIndex + 1) % processingStages.length;
}

document.addEventListener('DOMContentLoaded', () => {
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
  }
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }
  if (convertButton) {
    convertButton.addEventListener('click', onConvertClick);
  }
  if (donateButton) {
    donateButton.addEventListener('click', onDonateClick);
  }
  if (donateButtonStatus) {
    donateButtonStatus.addEventListener('click', onDonateClick);
  }
  if (resetButton) {
    resetButton.addEventListener('click', reset);
  }
  if (resetButtonError) {
    resetButtonError.addEventListener('click', reset);
  }
  if (testAuthButton) {
    testAuthButton.addEventListener('click', testAuth);
  }

  setInterval(updateProcessingStage, 3000);
  updateProcessingStage(); // Initial update

 // Initialize Auth0
  initAuth0().catch((error) => console.error("Error initializing app:", error));

  // Set up interval for updating processing stage
  setInterval(() => {
    currentStageIndex = (currentStageIndex + 1) % processingStages.length;
    const processingStage = document.getElementById("processing-stage");
    if (processingStage) {
      processingStage.textContent = processingStages[currentStageIndex];
    }
  }, 3000);
});

// Test Auth function (you might want to add this if it's not already present)
async function testAuth() {
  try {
    const token = await auth0Client.getTokenSilently({
      audience: "https://platogram.vercel.app",
    });
    console.log("Token obtained:", token.substring(0, 10) + "...");

    const response = await fetch("/test-auth", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    console.log("Auth test result:", data);
    alert("Auth test successful. Check console for details.");
  } catch (error) {
    console.error("Auth test failed:", error);
    alert("Auth test failed. Check console for details.");
  }
}

// Add event listener for the test auth button
document.getElementById('test-auth-button').addEventListener('click', testAuth);