let auth0Client = null;
let auth0Initialized = false;
let stripe = null;
let selectedLanguage = 'en'; // Default language
let pollingInterval;
let elements;
let uploadedFile = null;
let selectedOption = 'coffee';
let coffeeCount = 1;
let customPrice = '';
let totalPrice = 5;
let vercelBlobUpload;
let db;
let testMode = false;
let isConversionInProgress = false;
let currentView = 'cells';
let isConversionComplete = false;
let storedFileName = '';

import('https://esm.sh/@vercel/blob@0.23.4').then(module => {
        console.log('Vercel Blob import:', module);
        if (module.put && typeof module.put === 'function') {
          vercelBlobUpload = module.put;
          console.log('Vercel Blob upload function found:', vercelBlobUpload);
        } else {
          console.error('Vercel Blob upload function not found in module');
        }
      }).catch(error => {
        console.error('Error importing Vercel Blob:', error);
      });

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

const placeholders = [
    "Link to a TED talk by Jane Goodall on chimpanzee behavior",
    "URL of a panel discussion on renewable energy from COP26",
    "Zoom recording link of a virtual book club discussing 1984",
    "YouTube video of Neil deGrasse Tyson explaining black holes",
    "Link to a startup pitch from Y Combinator demo day",
    "Link to a lecture on ancient Egyptian architecture",
    "Link to a video of Malala Yousafzai's speech at the UN",
    "Link to a cooking masterclass with Gordon Ramsay",
    "URL of a webinar on ML applications in healthcare"
];

// Function to set a random placeholder
function setRandomPlaceholder() {
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
        const randomIndex = Math.floor(Math.random() * placeholders.length);
        urlInput.placeholder = placeholders[randomIndex];

        // Set focus to the input field
        urlInput.focus();
    }
}

const DOMAIN =
    typeof window !== 'undefined' && window.ENV && window.ENV.NEXT_PUBLIC_URL
      ? window.ENV.NEXT_PUBLIC_URL
      : (typeof window !== 'undefined' && window.location.hostname === 'shrinked.ai'
          ? 'https://shrinked.ai'
          : typeof window !== 'undefined' && window.location.hostname === 'platogram.vercel.app'
            ? 'https://platogram.vercel.app'
            : 'http://localhost:3000');

  console.log('Current DOMAIN:', DOMAIN);

  const isProduction = DOMAIN === 'https://shrinked.ai';

  console.log('Is Production:', isProduction);

function debugLog(message) {
  console.log(`[DEBUG] ${message}`);
}

function enableTestMode() {
    testMode = true;
    console.log("Test mode enabled");
}

// Ensure IndexedDB is initialized
async function ensureDbInitialized() {
    if (!db) {
        await initDB();
    }
}

// Add Intercom update when the page URL changes
window.addEventListener('popstate', function() {
  if (window.Intercom) {
    window.Intercom("update");
  }
});

async function generateIntercomHash(userId) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.warn('Intercom hash generation is not available in development mode');
      return null;
    }

    try {
      const response = await fetch('/api/intercom-hash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate Intercom hash');
      }

      const data = await response.json();
      return data.hash;
    } catch (error) {
      console.error('Error generating Intercom hash:', error);
      return null;
    }
  }

  async function initializeIntercom(user = null) {
    if (window.Intercom) {
      if (user) {
        // User is logged in
        const hash = await generateIntercomHash(user.sub);
        window.Intercom("boot", {
          api_base: "https://api-iam.intercom.io",
          app_id: "i1z51z2x",
          user_id: user.sub,
          name: user.name,
          email: user.email,
          created_at: Math.floor(new Date(user.updated_at).getTime() / 1000),
          user_hash: hash
        });
      } else {
        // User is not logged in
        window.Intercom("boot", {
          api_base: "https://api-iam.intercom.io",
          app_id: "i1z51z2x"
        });
      }
    }
  }

window.updateAuthUI = function(isAuthenticated, user) {
    const loginButton = document.getElementById('login-button');
    const userCircle = document.getElementById('user-circle');
    const logoutTooltip = document.getElementById('logout-tooltip');
    const userEmailElement = document.getElementById('user-email');

    if (isAuthenticated && user) {
        if (loginButton) loginButton.classList.add('hidden');
        if (userCircle) {
          userCircle.classList.remove('hidden');
          userCircle.textContent = getInitials(user.email);
        }
        if (userEmailElement) {
          userEmailElement.textContent = user.email;
        }
      } else {
        if (loginButton) loginButton.classList.remove('hidden');
        if (userCircle) userCircle.classList.add('hidden');
        if (logoutTooltip) logoutTooltip.classList.add('hidden');
        if (userEmailElement) userEmailElement.textContent = '';
      }
    };

function getInitials(email) {
    return email.split('@')[0].substring(0, 2).toUpperCase();
}

// jobID machine

function generateJobId() {
    // Get current timestamp
    const timestamp = Date.now();

    // Take the last 6 digits of the timestamp
    const lastSixDigits = timestamp % 1000000;

    // Pad with zeros to always have 6 digits
    const jobId = String(lastSixDigits).padStart(6, '0');

    return jobId;
}

// Function to update the job ID in the UI
function updateJobIdInUI() {
    const jobIdElement = document.getElementById('job-id');
    if (jobIdElement) {
        jobIdElement.textContent = generateJobId();
    }
}

// coffee counting machine
function updateTotalPrice() {
    if (selectedOption === 'basic') {
        totalPrice = 0;
    } else if (selectedOption === 'coffee') {
        if (customPrice) {
            totalPrice = parseFloat(customPrice);
        } else {
            totalPrice = coffeeCount * 5;
        }
    }
    const totalPriceElement = document.getElementById('total-price');
    const coffeePriceElement = document.getElementById('coffee-price');
    if (totalPriceElement) totalPriceElement.textContent = totalPrice.toFixed(2);
    if (coffeePriceElement) coffeePriceElement.textContent = totalPrice.toFixed(2);
}

function handleOptionClick(option) {
    selectedOption = option;
    const basicButton = document.getElementById('basic-job-button');
    const coffeeButton = document.getElementById('coffee-button');
    const coffee1Button = document.getElementById('coffee-1');
    const coffee2Button = document.getElementById('coffee-2');

    if (basicButton) {
        basicButton.classList.toggle('border-blue-500', option === 'basic');
        basicButton.classList.toggle('bg-blue-50', option === 'basic');
    }
    if (coffeeButton) {
        coffeeButton.classList.toggle('border-blue-500', option === 'coffee');
        coffeeButton.classList.toggle('bg-blue-50', option === 'coffee');
    }
    if (option === 'coffee') {
        coffeeCount = 1;
        customPrice = '';
        const customPriceInput = document.getElementById('custom-price');
        if (customPriceInput) customPriceInput.value = '';
        if (coffee1Button) {
            coffee1Button.style.backgroundColor = '#F9F0E8';
            coffee1Button.classList.add('text-black');
        }
        if (coffee2Button) {
            coffee2Button.style.backgroundColor = '';
            coffee2Button.classList.remove('text-black');
        }
    } else {
        coffeeCount = 0;
        if (coffee1Button) {
            coffee1Button.style.backgroundColor = '';
            coffee1Button.classList.remove('text-black');
        }
        if (coffee2Button) {
            coffee2Button.style.backgroundColor = '';
            coffee2Button.classList.remove('text-black');
        }
    }
    updateTotalPrice();
}

function handleCoffeeCountClick(count) {
    coffeeCount = count;
    customPrice = "";
    selectedOption = "coffee";
    const customPriceInput = document.getElementById("custom-price");
    if (customPriceInput) customPriceInput.value = "";
    const coffee1Button = document.getElementById("coffee-1");
    const coffee2Button = document.getElementById("coffee-2");
    if (coffee1Button) {
      if (count === 1) {
          coffee1Button.style.backgroundColor = '#F9F0E8';
          coffee1Button.classList.add('text-black');
      } else {
          coffee1Button.style.backgroundColor = '';
          coffee1Button.classList.remove('text-black');
      }
    }
    if (coffee2Button) {
      if (count === 2) {
          coffee2Button.style.backgroundColor = '#F9F0E8';
          coffee2Button.classList.add('text-black');
      } else {
          coffee2Button.style.backgroundColor = '';
          coffee2Button.classList.remove('text-black');
      }
    }
    updateTotalPrice();
  }

function handleCustomPriceChange(e) {
    const value = e.target.value;
    if (value === '' || (/^\d{1,3}(\.\d{0,2})?$/.test(value) && parseFloat(value) <= 999)) {
        customPrice = value;
        coffeeCount = 0; // Reset coffee count when custom price is entered
        selectedOption = 'coffee'; // Ensure coffee option is selected
        updateTotalPrice();
    }
}

function toggleConvertButtonState(isActive, button) {
    if (button) {
        button.disabled = !isActive;
        button.classList.toggle('opacity-50', !isActive);
        button.classList.toggle('cursor-not-allowed', !isActive);
    }
}

function closeLanguageModal() {
    const modal = document.getElementById("language-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

window.changeImage = function(type) {
    const image = document.getElementById('dashboard-image');
    // In a real scenario, you would change the src to different images
    // For this example, we'll just update the alt text
    image.alt = `Dashboard view: ${type}`;

    // Update button styles
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (button.textContent.trim().toLowerCase() === type) {
            button.classList.remove('bg-gray-100', 'text-gray-600');
            button.classList.add('bg-blue-100', 'text-blue-600');
        } else {
            button.classList.remove('bg-blue-100', 'text-blue-600');
            button.classList.add('bg-gray-100', 'text-gray-600');
        }
    });
};


function setupPriceUI() {
    const basicJobButton = document.getElementById('basic-job-button');
    if (basicJobButton) basicJobButton.addEventListener('click', () => handleOptionClick('basic'));

    const coffeeButton = document.getElementById('coffee-button');
    if (coffeeButton) coffeeButton.addEventListener('click', (event) => {

        event.stopPropagation();
        handleOptionClick('coffee');
    });
    const coffee1Button = document.getElementById('coffee-1');
    if (coffee1Button) coffee1Button.addEventListener('click', (event) => {

        event.stopPropagation();
        handleCoffeeCountClick(1);
    });
    const coffee2Button = document.getElementById('coffee-2');
    if (coffee2Button) coffee2Button.addEventListener('click', (event) => {

        event.stopPropagation();
        handleCoffeeCountClick(2);
    });

    const customPriceInput = document.getElementById('custom-price');
    if (customPriceInput) customPriceInput.addEventListener('input', handleCustomPriceChange);

    const cancelButton = document.getElementById('cancel-btn');
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            console.log('Modal closed');
            closeLanguageModal();
        });
    }

    handleOptionClick('coffee');
}

// processing files

function setupDragAndDrop(dropArea, filesHandler) {
    if (!dropArea) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => toggleHighlight(dropArea, true), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => toggleHighlight(dropArea, false), false);
    });

    dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        filesHandler(files);
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function toggleHighlight(dropArea, isActive) {
    dropArea.classList.toggle('border-blue-500', isActive);
    dropArea.classList.toggle('bg-blue-50', isActive);
}

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        uploadedFile = file;
        storedFileName = file.name;
        const fileNameDisplay = document.getElementById('file-name-display');
        const convertFileButton = document.getElementById('convert-file-button');
        const fileUploadPrompt = document.getElementById('file-upload-prompt');
        const fileResetOption = document.getElementById('file-reset-option');

        if (fileNameDisplay) {
            fileNameDisplay.textContent = file.name;
        }
        if (convertFileButton) {
            toggleConvertButtonState(true, convertFileButton);
        }
        if (fileUploadPrompt) {
            fileUploadPrompt.classList.add('hidden');
        }
        if (fileResetOption) {
            fileResetOption.classList.remove('hidden');
        }

        // Clear URL input if it exists
        const urlInput = document.getElementById('url-input');
        if (urlInput) urlInput.value = "";

        debugLog("File selected: " + file.name);
        debugLog("File size: " + file.size + " bytes");
        debugLog("File type: " + file.type);
        debugLog("storedFileName set to: " + storedFileName);
    }
}

function resetFileSelection() {
    uploadedFile = null;
    const fileNameDisplay = document.getElementById('file-name-display');
    const convertFileButton = document.getElementById('convert-file-button');
    const fileUploadPrompt = document.getElementById('file-upload-prompt');
    const fileResetOption = document.getElementById('file-reset-option');
    const fileInput = document.querySelector('input[type="file"]');

    if (fileNameDisplay) {
        fileNameDisplay.textContent = '';
    }
    if (convertFileButton) {
        toggleConvertButtonState(false, convertFileButton);
    }
    if (fileUploadPrompt) {
        fileUploadPrompt.classList.remove('hidden');
    }
    if (fileResetOption) {
        fileResetOption.classList.add('hidden');
    }
    if (fileInput) {
        fileInput.value = ''; // Reset the file input
    }

    debugLog("File selection reset");
}

// Stripe + Auth Init

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
    if (auth0Client) {
        return { client: auth0Client, justHandledRedirect: false };
    }

    try {
        auth0Client = await auth0.createAuth0Client({
            domain: "dev-w0dm4z23pib7oeui.us.auth0.com",
            clientId: "iFAGGfUgqtWx7VuuQAVAgABC1Knn7viR",
            authorizationParams: {
                redirect_uri: DOMAIN,
                audience: "https://platogram.vercel.app/",
                scope: "openid profile email",
            },
            cacheLocation: "localstorage",
        });
        console.log("Auth0 client initialized successfully");

        let justHandledRedirect = false;
        // Handle the redirect flow
        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
            await auth0Client.handleRedirectCallback();
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log("Auth0 redirect handled");
            justHandledRedirect = true;
        }

        auth0Initialized = true;
        return { client: auth0Client, justHandledRedirect };
    } catch (error) {
        console.error("Error initializing Auth0:", error);
        throw error;
    }
}

async function ensureAuth0Initialized() {
    if (!auth0Initialized) {
        await initAuth0();
    }
    if (!auth0Initialized) {
        throw new Error("Failed to initialize Auth0");
    }
}

async function getAuthToken() {
    try {
        await ensureAuth0Initialized();
        if (!auth0Client) {
            throw new Error("Auth0 client not initialized");
        }
        const isAuthenticated = await auth0Client.isAuthenticated();
        if (!isAuthenticated) {
            console.log("User is not authenticated");
            return null;
        }
        const token = await auth0Client.getTokenSilently({
            audience: "https://platogram.vercel.app",
        });
        if (!token) {
            throw new Error("Failed to retrieve token");
        }
        return token;
    } catch (error) {
        console.error("Error getting auth token:", error);
        return null;
    }
}

async function checkOngoingConversion() {
    try {
        const isAuthenticated = await auth0Client.isAuthenticated();
        if (!isAuthenticated) {
            console.log("User not authenticated, skipping ongoing conversion check");
            updateUIStatus("idle");
            return;
        }

        const token = await getAuthToken();
        const response = await fetch("https://temporary.name/status", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 502) {
            console.log("Server is currently unavailable");
            updateUIStatus("turn-off", "Our servers are currently undergoing maintenance. We'll be back soon!");
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("Current conversion status:", result.status);

        if (result.status && result.status !== 'idle') {
            updateUIStatus(result.status, `Shrinking complete. Your context-rich documents await in your inbox!`, storedFileName);
            if (['running', 'processing'].includes(result.status)) {
                pollStatus(token);
            } else if (result.status === 'done') {
                isConversionComplete = true;
                console.log("Conversion complete, UI updated to 'done' state");
            }
        } else {
            updateUIStatus("idle");
        }
    } catch (error) {
        console.error("Error checking ongoing conversion:", error);
        if (error.message.includes("Load failed") || error.message.includes("NetworkError") || error.name === "TypeError") {
            updateUIStatus("turn-off", "We're experiencing technical difficulties. Please try again later.");
        } else {
            updateUIStatus("error", "An unexpected error occurred. Please try again.");
        }
    }
}

async function updateUIStatus(status, message = "") {
    if (isConversionComplete && status !== "done" && status !== "error") {
        console.log("Preventing update to status:", status);
        return; // Prevent updates after completion, except for "done" or "error" statuses
    }

    debugLog(`Updating UI status: ${status}`);
    const inputSection = document.getElementById("input-section");
    const uploadProcessSection = document.getElementById("upload-process-section");
    const statusSection = document.getElementById("status-section");
    const doneSection = document.getElementById("done-section");
    const errorSection = document.getElementById("error-section");
    const turnOffSection = document.getElementById("turn-off-section");

    const pendingConversionDataString = localStorage.getItem('pendingConversionData');
    const pendingConversionData = pendingConversionDataString ? JSON.parse(pendingConversionDataString) : null;
    const displayFileName = storedFileName || pendingConversionData?.fileName || document.getElementById("file-name")?.textContent || "Unknown file";
    debugLog("File name used in updateUIStatus: " + displayFileName);

    // Try to get the latest user email
    let userEmail = "Not logged in";
    try {
        const isAuthenticated = await auth0Client.isAuthenticated();
        if (isAuthenticated) {
            const user = await auth0Client.getUser();
            userEmail = user.email || "Email not available";
        }
        const userEmailElement = document.getElementById("user-email");
        if (userEmailElement) {
            userEmailElement.textContent = userEmail;
        }
    } catch (error) {
        console.error("Error fetching user email:", error);
    }

    // Hide all sections first
    [inputSection, statusSection, uploadProcessSection, doneSection, errorSection, turnOffSection].forEach(section => {
        if (section) section.classList.add("hidden");
    });

    // Show the appropriate section based on status
    switch (status) {
        case "idle":
            if (!isConversionComplete) {
                toggleSection("input-section");
            }
            break;
        case "uploading":
            toggleSection("upload-process-section");
            break;
        case "preparing":
            toggleSection("processing-section");
            const processingStatusText = document.getElementById("processing-status-text");
            if (processingStatusText) {
                if (message.includes("payment confirmed")) {
                    processingStatusText.innerHTML = `
                        <p>File/URL: ${displayFileName}</p>
                        <p>Email: ${userEmail}</p>
                        <p>Status: Payment confirmed, preparing to start conversion</p>
                        <p>${message}</p>
                    `;
                } else {
                    processingStatusText.innerHTML = `
                        <p>File/URL: ${displayFileName}</p>
                        <p>Email: ${userEmail}</p>
                        <p>Status: Preparing to start conversion</p>
                        <p>${message}</p>
                    `;
                }
            }
            break;
        case "processing":
        case "running":
            toggleSection("status-section");
            if (statusSection) {
                statusSection.innerHTML = `
                    <p>File/URL: ${displayFileName}</p>
                    <p>Email: ${userEmail}</p>
                    <p>Status: ${status}</p>
                    <p>${message}</p>
                    <div id="processing-stage"></div>
                `;
                initializeProcessingStage();
            }
            break;
        case "done":
            toggleSection("done-section");
            if (doneSection) {
                doneSection.innerHTML = `
                    <p>File/URL: ${displayFileName}</p>
                    <p>Email: ${userEmail}</p>
                    <p>Status: Completed</p><br>
                    <p>${message || "Shrinking complete. Your context-rich documents await in your inbox!"}</p>
                    <button class="mx-left mt-8 block px-4 py-2 bg-black text-white rounded hover:bg-gray-950" onclick="reset()">Reset</button>
                `;
            }
            clearProcessingStageInterval();
            attachResetButtonListener();
            isConversionComplete = true;
            console.log("Conversion complete, UI updated to 'done' state");
            break;
        case "error":
            toggleSection("error-section");
            if (errorSection) {
                errorSection.innerHTML = `
                    <p>File/URL: ${displayFileName}</p>
                    <p>Email: ${userEmail}</p>
                    <p>Status: Error</p>
                    <p>${message || "An error occurred. Please try again."}</p>
                    <button class="mx-left mt-8 block px-4 py-2 bg-black  text-white rounded hover:bg-gray-950" onclick="reset()">Reset</button>
                `;
            }
            clearProcessingStageInterval();
            attachResetButtonListener();
            break;
        case "turn-off":
            if (turnOffSection) {
                turnOffSection.classList.remove("hidden");
                turnOffSection.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Service Temporarily Unavailable</h2>
                    <p class="mb-4">${message}</p>
                    <p>We apologize for the inconvenience. Please check back later.</p>
                `;
            } else {
                console.error("Turn-off section not found in the DOM");
                // Fallback to error section if turn-off section doesn't exist
                if (errorSection) {
                    errorSection.classList.remove("hidden");
                    errorSection.innerHTML = `
                        <h2 class="text-2xl font-bold mb-4">Service Temporarily Unavailable</h2>
                        <p class="mb-4">${message}</p>
                        <p>We apologize for the inconvenience. Please check back later.</p>
                    `;
                }
            }
            break;
        default:
            console.warn(`Unknown status: ${status}`);
            if (!isConversionComplete) {
                toggleSection("input-section");
            }
    }
}

// Add this function to clear all conversion-related localStorage data
function clearConversionData() {
    localStorage.removeItem('pendingConversionData');
    localStorage.removeItem('successfulPayment');
    console.log("Cleared all conversion-related localStorage data");
}

function attachResetButtonListener() {
    const resetButton = document.querySelector('#done-section button, #error-section button');
    if (resetButton) {
        resetButton.removeEventListener('click', reset);
        resetButton.addEventListener('click', reset);
    }
}

async function updateUI() {
    try {
      const { client } = await initAuth0();
      auth0Client = client;
      const isAuthenticated = await auth0Client.isAuthenticated();
      const loginButton = document.getElementById("login-button");
      const logoutButton = document.getElementById("logout-button");

      if (loginButton) loginButton.classList.toggle("hidden", isAuthenticated);
      if (logoutButton) logoutButton.classList.toggle("hidden", !isAuthenticated);

      if (isAuthenticated) {
        const user = await auth0Client.getUser();
        const userEmailElement = document.getElementById("user-email");
        if (userEmailElement) {
          userEmailElement.textContent = user.email;
        }
        window.updateAuthUI(isAuthenticated, user);

        // Initialize Intercom with user data
        initializeIntercom(user);

        // Only poll status if authenticated and not in idle state
            const currentStatus = getCurrentUIStatus();
            if (currentStatus !== "idle") {
                const token = await auth0Client.getTokenSilently({
                    audience: "https://platogram.vercel.app",
                });
                await pollStatus(token);
            } else {
                updateUIStatus("idle"); // Ensure idle state is set
            }
        } else {
            window.updateAuthUI(false, null);
            updateUIStatus("idle"); // Set to idle state for non-authenticated users

            // Initialize Intercom without user data
            initializeIntercom();
        }
    } catch (error) {
      console.error("Error updating UI:", error);
      updateUIStatus("idle"); // Set to idle state on error
    }
  }

  // Helper function to get current UI status
  function getCurrentUIStatus() {
    const statusSection = document.getElementById("status-section");
    if (statusSection && !statusSection.classList.contains("hidden")) {
      return statusSection.getAttribute("data-status") || "idle";
    }
    return "idle";
  }

async function reset() {
    try {
        console.log("Reset function called");

        if (!auth0Client) {
            console.error("Auth0 client not initialized");
            throw new Error("Auth0 client not initialized");
        }

        const token = await auth0Client.getTokenSilently({
            audience: "https://platogram.vercel.app",
        });

        // Call the server-side reset endpoint
        const response = await fetch("https://temporary.name/reset", {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            console.error("Server reset failed:", response.statusText);
            throw new Error("Failed to reset on server");
        }

        console.log("Server reset successful");

        // Reset UI elements
        const urlInput = document.getElementById("url-input");
        const fileNameElement = document.getElementById("file-name");
        const fileNameDisplay = document.getElementById('file-name-display');
        const convertFileButton = document.getElementById('convert-file-button');
        const fileUploadPrompt = document.getElementById('file-upload-prompt');
        const fileResetOption = document.getElementById('file-reset-option');

        if (urlInput) urlInput.value = "";
        if (fileNameElement) fileNameElement.textContent = "";
        if (fileNameDisplay) fileNameDisplay.textContent = "";
        if (convertFileButton) toggleConvertButtonState(false, convertFileButton);
        if (fileUploadPrompt) fileUploadPrompt.classList.remove('hidden');
        if (fileResetOption) fileResetOption.classList.add('hidden');

        // Reset global variables
        uploadedFile = null;
        storedFileName = '';
        isConversionComplete = false;
        isConversionInProgress = false;

        // Clear any stored conversion data
        clearConversionData();

        // Update UI status to idle
        updateUIStatus("idle");

        console.log("Reset complete, UI updated to idle state");

        // Generate a new job ID
        updateJobIdInUI();

    } catch (error) {
        console.error("Error during reset:", error);
        updateUIStatus("error", "Failed to reset. Please try again.");
    }
}

function getPriceFromUI() {
  const coffeePrice = document.getElementById('coffee-price').textContent;
  const price = parseFloat(coffeePrice.replace('$', ''));
  return price;
}

async function createCheckoutSession(price, lang, saveFlag) {
    const stripeInstance = initStripe();
    if (!stripeInstance) {
      console.error('Stripe has not been initialized');
      return null;
    }

    const domain = DOMAIN;

    try {
      const response = await fetch(`${domain}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
          price,
          lang,
          success_url: `${domain}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${domain}/cancel`,
        }),
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

const CHUNK_SIZE = 1024 * 1024; // 5MB chunks

async function uploadLargeFile(file) {
  const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const chunkArrayBuffer = await chunk.arrayBuffer();
    const chunkBase64 = btoa(String.fromCharCode(...new Uint8Array(chunkArrayBuffer)));

    const response = await fetch('/api/upload-chunk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        chunkIndex,
        chunk: chunkBase64,
        totalChunks,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload chunk ${chunkIndex + 1} of ${totalChunks}`);
    }

    updateUploadProgress((chunkIndex + 1) / totalChunks * 100);
  }

  return fileId;
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

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("FileStorage", 1);
        request.onerror = (event) => reject("IndexedDB error: " + event.target.error);
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore("files", { keyPath: "id" });
        };
    });
}

// Store file in IndexedDB
async function storeFileTemporarily(file) {
    if (!db) {
        await initDB();
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["files"], "readwrite");
        const store = transaction.objectStore("files");
        const id = Date.now().toString();
        const request = store.add({ id: id, file: file });
        request.onerror = (event) => reject("Error storing file: " + event.target.error);
        request.onsuccess = (event) => resolve(id);
    });
}

async function processYoutubeUrl(youtubeUrl) {
    try {
        console.log('Sending request to process YouTube URL:', youtubeUrl);

        // Initial request to start processing
        const response = await fetch('/api/process-youtube', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ youtubeUrl }),
            signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response from server:', response.status, errorText);
            throw new Error(`Failed to process YouTube URL: ${response.status}`);
        }

        const result = await response.json();
        console.log('Initial response:', result);

        if (!result.status || !result.data || !result.data.jobId) {
            throw new Error('Invalid response format from server');
        }

        const jobId = result.data.jobId;
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes polling
        const retryDelay = 5000;

        // Poll for completion
        while (attempts < maxAttempts) {
            console.log(`Polling attempt ${attempts + 1} for job ${jobId}`);

            const statusResponse = await fetch(`/api/process-youtube?jobId=${jobId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!statusResponse.ok) {
                console.error(`Status check failed:`, statusResponse.status);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                attempts++;
                continue;
            }

            const statusResult = await statusResponse.json();
            console.log('Status check result:', statusResult);

            if (statusResult.status === 'finished' && statusResult.data) {
                return {
                    audioBlob: await (await fetch(statusResult.data.audio_url)).blob(),
                    title: statusResult.data.title || 'youtube_audio'
                };
            }

            if (statusResult.status === 'failed') {
                throw new Error('Processing failed');
            }

            await new Promise(resolve => setTimeout(resolve, retryDelay));
            attempts++;
        }

        throw new Error('Processing timed out');
    } catch (error) {
        console.error('Error processing YouTube URL:', error);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        throw error;
    }
}

async function downloadYoutubeAudio(audioData) {
    try {
        console.log('Parsed audioData:', audioData);

        if (audioData.audio_url) {
            const chunks = [];
            let start = 0;
            let end = CHUNK_SIZE - 1;
            let contentLength = 0;

            while (true) {
                const url = new URL('/api/download-audio', window.location.origin);
                url.searchParams.append('url', audioData.audio_url);
                url.searchParams.append('title', audioData.title || 'youtube_audio');
                url.searchParams.append('start', start);
                url.searchParams.append('end', end);

                const response = await fetch(url, {
                    method: 'GET',
                });

                if (!response.ok) {
                    throw new Error(`Failed to download audio chunk: ${response.statusText}`);
                }

                const chunk = await response.arrayBuffer();
                chunks.push(chunk);

                const rangeHeader = response.headers.get('Content-Range');
                if (rangeHeader) {
                    contentLength = parseInt(rangeHeader.split('/')[1]);
                }

                const receivedLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
                console.log(`Download progress: ${Math.round((receivedLength / contentLength) * 100)}%`);

                if (receivedLength >= contentLength) {
                    console.log('Download completed');
                    break;
                }

                start = end + 1;
                end = start + CHUNK_SIZE - 1;
            }

            const blob = new Blob(chunks, { type: 'audio/mp4' });
            return blob;
        } else {
            throw new Error('No audio URL found in the response');
        }
    } catch (error) {
        console.error('Error downloading YouTube audio:', error);
        throw error;
    }
}

// Retrieve file from IndexedDB
async function retrieveFileFromTemporaryStorage(id) {
    await ensureDbInitialized();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["files"], "readonly");
        const store = transaction.objectStore("files");
        const request = store.get(id);
        request.onerror = (event) => reject("Error retrieving file: " + event.target.error);
        request.onsuccess = (event) => resolve(event.target.result.file);
    });
}

// Test that IndexedDB works
async function testIndexedDB() {
    const testFile = new File(["test content"], "test.mp3", { type: "audio/mpeg" });
    const fileId = await storeFileTemporarily(testFile);
    debugLog("File stored with ID", fileId);

    const retrievedFile = await retrieveFileFromTemporaryStorage(fileId);
    debugLog("File retrieved", { name: retrievedFile.name, size: retrievedFile.size, type: retrievedFile.type });

    if (testFile.name === retrievedFile.name && testFile.size === retrievedFile.size && testFile.type === retrievedFile.type) {
        console.log("IndexedDB test passed");
    } else {
        console.error("IndexedDB test failed");
    }
}

function checkSessionStorage() {
    console.log('Current sessionStorage content:');
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        console.log(`${key}: ${sessionStorage.getItem(key)}`);
    }
}

async function handleSubmit(event) {
    if (event) event.preventDefault();
    console.log('handleSubmit called');
    const price = getPriceFromUI();
    let inputData = getInputData();
    const submitButton = document.getElementById('submit-btn');

    if (!inputData) {
        console.error('No input data provided');
        updateUIStatus("error", "Please provide a URL or upload a file before submitting.");
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Processing...";
        }

        closeLanguageModal();

        const userEmailElement = document.getElementById("user-email");
        const userEmail = userEmailElement ? userEmailElement.textContent : '';

        const saveCheckbox = document.getElementById('save-checkbox');
        const saveFlag = (userEmail === "hollow666metal@gmail.com" || userEmail === "cherepukhin@damn.vc") && saveCheckbox && saveCheckbox.checked;

        await storeConversionData(inputData, selectedLanguage, price, false, saveFlag);

        if (price > 0) {
            console.log('Non-zero price detected, initiating paid conversion');
            await handlePaidConversion(inputData, price);
        } else {
            if (inputData instanceof File) {
                updateUIStatus("uploading", "Uploading file...");
                const uploadedUrl = await uploadFile(inputData);
                inputData = uploadedUrl;
            } else if (inputData.includes('youtube.com') || inputData.includes('youtu.be')) {
                console.log('Processing YouTube URL:', inputData);
                updateUIStatus("processing", "Extracting audio and unstructured data from YouTube. This process involves isolating the audio stream, identifying conversations, and preparing the content for analysis. Please keep this window open to ensure successful data transfer.");
                const { audioBlob, title } = await processYoutubeUrl(inputData);
                console.log('Audio blob received:', audioBlob);
                const file = new File([audioBlob], `${title || 'youtube_audio'}.mp4`, { type: 'audio/mp4' });
                updateUIStatus("uploading", "Uploading processed YouTube audio ..");
                const uploadedUrl = await uploadFile(file);
                console.log('Uploaded URL:', uploadedUrl);
                inputData = uploadedUrl;
            }

            updateJobIdInUI();
        }

        await postToConvert(inputData, selectedLanguage, null, price, false, saveFlag);
        updateUIStatus("processing", "The audio is being shrinked, extracting key information, and organizing the data into a structured format. You may close this window if you wish - we'll email you once it's processed.");

    } catch (error) {
        console.error('Error in handleSubmit:', error);
        updateUIStatus("error", `Error: ${error.message}`);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Submit";
        }
    }
}

async function handlePaidConversion(inputData, price) {
    console.log('handlePaidConversion called', { price });
    try {
        const user = await auth0Client.getUser();
        const email = user.email || user["https://platogram.com/user_email"];
        if (!email) {
            throw new Error('User email not available');
        }
        console.log('User email retrieved', { email });

        // Store the conversion data before creating the checkout session
        await storeConversionData(inputData, selectedLanguage, price, false);

        const pendingConversionDataString = localStorage.getItem('pendingConversionData');
        if (!pendingConversionDataString) {
            throw new Error('Failed to store conversion data');
        }

        const conversionData = JSON.parse(pendingConversionDataString);
        console.log('Stored pendingConversionData:', conversionData);

        if (!conversionData || !conversionData.inputData) {
            throw new Error('Invalid conversion data');
        }

        if (testMode) {
            console.log("Test mode: Simulating Stripe checkout");
            await simulateStripeCheckout(conversionData);
            return;
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
                inputData: conversionData.inputData,
                save: conversionData.save
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to create checkout session');
        }

        const session = await response.json();
        const result = await stripe.redirectToCheckout({
            sessionId: session.id,
        });

        if (result.error) {
            throw new Error(result.error.message);
        }
    } catch (error) {
        console.error('Error in handlePaidConversion:', error);
        updateUIStatus("error", `Error: ${error.message}`);
    }
}

async function simulateStripeCheckout(conversionData) {
    console.log("Simulating Stripe checkout in test mode");
    updateUIStatus("processing", "Simulating payment...");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate payment processing
    await handleStripeSuccess(null, true);
}

async function storeConversionData(inputData, lang, price, isAuth = false) {
    let conversionData;
    try {
      const saveCheckbox = document.getElementById('save-checkbox');
      const saveFlag = saveCheckbox && !saveCheckbox.classList.contains('hidden') && saveCheckbox.checked;
        if (inputData instanceof File) {
            const fileId = await storeFileTemporarily(inputData);
            conversionData = {
                inputData: fileId,
                isFile: true,
                fileName: inputData.name,
                lang: lang,
                price: price,
                isAuth: isAuth,
                save: saveFlag
            };
        } else {
            conversionData = {
                inputData: inputData,
                isFile: false,
                fileName: inputData, // For URLs, the fileName is the URL itself
                lang: lang,
                price: price,
                isAuth: isAuth,
                save: saveFlag
            };
        }
        localStorage.setItem('pendingConversionData', JSON.stringify(conversionData));
        console.log("Stored conversion data:", conversionData);
    } catch (error) {
        console.error("Error storing conversion data:", error);
        throw error;
    }
}

// async function handleSuccessfulPayment() {
//     try {
//         await ensureAuth0Initialized();
//         const successfulPayment = sessionStorage.getItem('successfulPayment');
//         if (!successfulPayment) {
//             console.log('No successful payment data found, skipping payment processing');
//             return; // Exit if no payment data is found
//         }

//         const { session_id } = JSON.parse(successfulPayment);
//         sessionStorage.removeItem('successfulPayment');  // Clear the stored data

//         const pendingConversionDataString = localStorage.getItem('pendingConversionData');
//         if (!pendingConversionDataString) {
//             console.log('No pending conversion data found, skipping payment processing');
//             return; // Exit if no conversion data is found
//         }

//         const pendingConversionData = JSON.parse(pendingConversionDataString);
//         localStorage.removeItem('pendingConversionData');

//         console.log('Processing successful payment with data:', pendingConversionData);

//         updateUIStatus("processing", "Processing successful payment...");
//         const isTestMode = pendingConversionData.isTestMode || session_id.startsWith('test_');
//         const token = isTestMode ? 'test_token' : await getAuthToken();
//         await processConversion(pendingConversionData, session_id, isTestMode, token);
//     } catch (error) {
//         console.error('Error processing payment:', error);
//         updateUIStatus("error", `Error processing payment: ${error.message}`);
//     }
// }

// async function processConversion(conversionData, sessionId, isTestMode, token) {
//     const { inputData, lang, price } = conversionData;
//     let processedInputData = inputData;
//     if (conversionData.isFile) {
//         updateUIStatus("uploading", "Retrieving and uploading file...");
//         const file = await retrieveFileFromTemporaryStorage(inputData);
//         processedInputData = await uploadFile(file, token, isTestMode);
//    }
//    updateUIStatus("preparing", "Starting conversion...");
//    await postToConvert(processedInputData, lang, sessionId, price, isTestMode);
//    updateUIStatus("processing", "Conversion started. You will be notified when it's complete.");
//}

function handleStripeRedirect() {
    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);

    if (currentPath === '/success') {
        const sessionId = urlParams.get('session_id');
        if (sessionId) {
            console.log('Payment successful. Processing...');
            sessionStorage.setItem('successfulPayment', JSON.stringify({ session_id: sessionId }));
            updateUIStatus("success", "Payment successful! Redirecting...");
            setTimeout(() => {
                window.location.href = DOMAIN;
            }, 6000);
        } else {
            console.error('Success route accessed without session ID');
            updateUIStatus("error", "Invalid success parameters");
        }
    } else if (currentPath === '/cancel') {
        console.log('Payment cancelled by user');
        updateUIStatus("cancelled", "Payment was cancelled. You can try again when you're ready.");
        setTimeout(() => {
            window.location.href = DOMAIN;
        }, 6000);
    }
}

async function handleAuthReturn() {
    console.log("Handling auth return");
    const pendingConversionDataString = localStorage.getItem('pendingConversionData');
    console.log("Pending conversion data:", pendingConversionDataString);

     // if (pendingStripeSession) {
    //     console.log("Found pending Stripe session, handling success");
    //     localStorage.removeItem('pendingStripeSession');
    //     await handleStripeSuccess(pendingStripeSession);
    // } else {
    //     // ... rest of the function
    // }

    // Instead, directly process the pendingConversionData
    if (pendingConversionDataString) {
        const pendingConversionData = JSON.parse(pendingConversionDataString);
        console.log("Parsed pending conversion data:", pendingConversionData);

        if (pendingConversionData && pendingConversionData.isAuth) {
            localStorage.removeItem('pendingConversionData');
            let inputData = pendingConversionData.inputData;
            const price = pendingConversionData.price;

            console.log("Retrieved pending conversion data:", pendingConversionData);

            // Restore the input data to the UI
            if (pendingConversionData.isFile) {
                console.log("Retrieving file from temporary storage");
                const file = await retrieveFileFromTemporaryStorage(inputData);
                if (file) {
                    inputData = file;
                    handleFiles([file]);
                }
            } else {
                console.log("Setting URL input");
                const urlInput = document.getElementById('url-input');
                if (urlInput) urlInput.value = inputData;
            }

            // Show the language selection modal
            console.log("Showing language selection modal");
            showLanguageSelectionModal(inputData, price);
        } else {
            console.log("No auth-related pending conversion data found");
        }
    } else {
        console.log("No pending conversion data found");
    }
}

function handleStripeCancel() {
  updateUIStatus('idle');
}

//if (window.location.pathname === '/success') {
//  handleStripeSuccess();
//} else if (window.location.pathname === '/cancel') {
//  handleStripeCancel();
//}

async function onConvertClick(event) {
    if (event) event.preventDefault();
    console.log('Convert button clicked');
    try {
        if (!auth0Client) throw new Error("Auth0 client not initialized");
        const inputData = getInputData();
        if (!inputData) {
            throw new Error("Please provide a valid URL or upload a file to be converted");
        }
        console.log("Input data type:", inputData instanceof File ? "File" : "URL");
        if (inputData instanceof File) {
            console.log("File details:", inputData.name, inputData.type, inputData.size);
        } else {
            console.log("URL input:", inputData);
        }
        const price = getPriceFromUI();
        console.log("Price:", price);

        const isAuthenticated = await auth0Client.isAuthenticated();
        console.log("User is authenticated:", isAuthenticated);

        if (isAuthenticated) {
            console.log("Showing language selection modal");
            showLanguageSelectionModal(inputData, price);
        } else {
            console.log("User not authenticated. Preparing for login...");
            await storeConversionData(inputData, selectedLanguage, price, true);
            console.log("Conversion data stored. Initiating login process...");
            login();
        }
    } catch (error) {
        console.error("Error in onConvertClick:", error);
        updateUIStatus("error", error.message);
    }
}

  function sanitizeFileName(fileName) {
      // Remove any character that isn't a word character, number, or safe punctuation
      let sanitized = fileName.replace(/[^\w\d.-]/g, '_');

      // Replace multiple consecutive underscores with a single one
      sanitized = sanitized.replace(/_+/g, '_');

      // Remove leading and trailing underscores
      sanitized = sanitized.replace(/^_|_$/g, '');

      // Ensure the file name isn't too long (e.g., limit to 100 characters)
      sanitized = sanitized.slice(0, 100);

      // If the sanitized name is empty, provide a default name
      if (sanitized === '') {
        sanitized = 'unnamed_file';
      }

      // Preserve the original file extension
      const originalExtension = fileName.split('.').pop();
      const sanitizedExtension = sanitized.split('.').pop();

      if (originalExtension !== sanitizedExtension) {
        sanitized += '.' + originalExtension;
      }

      return sanitized;
    }

    async function uploadFile(file) {
        console.log('Starting file upload process');
        console.log('File details:', file.name, file.type, file.size);

        const sanitizedFileName = sanitizeFileName(file.name);
        console.log('Sanitized file name:', sanitizedFileName);

        try {
            closeLanguageModal();
            updateUIStatus("uploading", "Uploading file...");

            // Get the Auth0 token
            let token;
            try {
                token = await auth0Client.getTokenSilently({
                    audience: "https://platogram.vercel.app",
                });
                console.log('Auth token obtained');
            } catch (authError) {
                console.error('Error getting Auth0 token:', authError);
                throw new Error('Authentication failed. Please try logging in again.');
            }

            // Get the Blob token
            let blobToken;
            try {
                const blobTokenResponse = await fetch('/api/upload-file', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-Vercel-Blob-Token-Request': 'true'
                    }
                });
                if (!blobTokenResponse.ok) {
                    const errorText = await blobTokenResponse.text();
                    throw new Error(`Failed to get Blob token: ${blobTokenResponse.status} ${errorText}`);
                }
                ({ token: blobToken } = await blobTokenResponse.json());
            } catch (blobTokenError) {
                console.error('Error getting Blob token:', blobTokenError);
                throw new Error('Failed to initialize file upload. Please try again.');
            }

            console.log('Initiating Vercel Blob upload');
            if (typeof vercelBlobUpload !== 'function') {
                throw new Error('Vercel Blob upload function not available');
            }

            const blob = await vercelBlobUpload(sanitizedFileName, file, {
                access: 'public',
                token: blobToken,
                handleUploadUrl: '/api/upload-file',
                onUploadProgress: (progress) => {
                    console.log(`Upload progress: ${progress}%`);
                    updateUploadProgress(progress);
                },
            });

            console.log('Blob metadata:', blob);

            if (!blob.url) {
                throw new Error('Invalid response from upload file endpoint: missing URL');
            }

            console.log('File uploaded successfully. URL:', blob.url);
            updateUIStatus("running", "File uploaded, starting conversion...");
            return blob.url;
        } catch (error) {
            console.error('Error uploading file:', error);
            console.error('Error stack:', error.stack);
            updateUIStatus("error", error.message || 'An unknown error occurred during file upload');
            throw error;
        }
    }

//function updateUploadProgress(progress) {
//  const uploadProgressBar = document.getElementById('upload-progress-bar');
//  const uploadProgressText = document.getElementById('upload-progress-text');
//  if (uploadProgressBar && uploadProgressText) {
//    uploadProgressBar.style.width = `${progress}%`;
 //   uploadProgressText.textContent = `Uploading: ${progress.toFixed(2)}%`;
//  } else {
 //   console.error('Progress bar or text element not found');
//  }
//}

async function deleteFile(fileUrl) {
    try {
      console.log('Attempting to delete file:', fileUrl);
      const response = await fetch('/api/upload-file', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: fileUrl }) // Change 'fileUrl' to 'url'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete file: ${response.status} ${response.statusText}. ${errorText}`);
      }

      const result = await response.json();
      console.log('File deleted successfully:', result.message);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  async function postToConvert(inputData, lang, sessionId, price, isTestMode = false, saveFlag = false) {
    debugLog("postToConvert called", { inputData, lang, sessionId, price, isTestMode, saveFlag, fileName: storedFileName });
    let headers = {};

    try {
        const token = await getAuthToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    } catch (error) {
        console.error("Error getting auth token:", error);
        // Continue without the token if there's an error
    }

    const formData = new FormData();
    formData.append("lang", lang);
    if (sessionId) {
        formData.append('session_id', sessionId);
    } else {
        formData.append('price', price);
    }
    formData.append("payload", inputData);
    if (isTestMode) {
        formData.append('test_mode', 'true');
    }
    formData.append("save", saveFlag);

    console.log("Sending data to Platogram for conversion:", Object.fromEntries(formData));

    try {
        updateUIStatus("processing", "Sending conversion request...");
        const response = await fetch("https://temporary.name/convert", {
            method: "POST",
            headers: headers,
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log("Full error response:", errorText);
            throw new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        }

        const result = await response.json();
        console.log("Conversion API response:", result);

        if (result.message === "Conversion started" || result.status === "processing") {
            updateUIStatus("processing", "Conversion in progress...");
            return await pollStatus(await getAuthToken(), isTestMode);
        } else {
            updateUIStatus("error", "Unexpected response from server");
            throw new Error("Unexpected response from server");
        }
    } catch (error) {
        console.error("Error in postToConvert:", error);
        updateUIStatus("error", "Failed to start conversion. Please try again later.");
        throw error;
    }
}

function handleConversionStatus(status, inputData) {
    switch (status.status) {
        case 'idle':
            updateUIStatus("idle", "Ready for new conversion");
            break;
        case 'done':
            updateUIStatus("done", "Conversion completed successfully");
            break;
        case 'failed':
            updateUIStatus("error", status.error || "Conversion failed");
            break;
        default:
            updateUIStatus("error", "Unknown status: " + status.status);
    }

    // Check if the inputData is a Blob URL and trigger cleanup
    if (typeof inputData === 'string' && inputData.includes('.public.blob.vercel-storage.com/')) {
        try {
            console.log("Conversion complete. Attempting to delete temporary file");
            deleteFile(inputData).then(() => {
                console.log("Temporary file successfully deleted");
            }).catch((cleanupError) => {
                console.error("Error during file cleanup:", cleanupError);
            });
        } catch (cleanupError) {
            console.error("Error during file cleanup:", cleanupError);
        }
    }
}

function getInputData() {
    const urlInput = document.getElementById("url-input").value.trim();
    debugLog("getInputData called");
    debugLog("URL input: " + urlInput);

    if (uploadedFile) {
        debugLog("File input found: " + uploadedFile.name);
        return uploadedFile;
    }

    if (urlInput) {
        debugLog("URL input found: " + urlInput);
        return urlInput;
    }

    debugLog("No input data found");
    return null;
}

async function login() {
    try {
        console.log("Initializing login process...");
        await initAuth0();
        console.log("Auth0 initialized. Preparing for redirect...");

        sessionStorage.setItem('isAuthenticating', 'true');
        console.log("isAuthenticating flag set in sessionStorage");

        console.log("Current pendingConversionData:", localStorage.getItem('pendingConversionData'));

        console.log("Redirecting to Auth0 login page...");
        await auth0Client.loginWithRedirect({
            appState: { returnTo: `${DOMAIN}${window.location.pathname}`, pendingConversion: true }
        });

        // Update Intercom after successful login
        const user = await auth0Client.getUser();
        initializeIntercom(user);
    } catch (error) {
        console.error("Error in login process:", error);
        updateUIStatus("error", "Failed to initiate login. Please try again.");
    }
}

async function logout() {
    try {
        await initAuth0();
        await auth0Client.logout({
            logoutParams: { returnTo: DOMAIN },
        });

        // Update Intercom after logout
        initializeIntercom();
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
    const fileNameElement = modal.querySelector("#file-name");
    if (fileNameElement) {
        fileNameElement.textContent = inputData instanceof File ? inputData.name : inputData;
        console.log("Setting modal file name to:", fileNameElement.textContent); // Debug log
    }
    const priceElement = modal.querySelector("#modal-price");
    if (priceElement) {
        priceElement.textContent = `$${price.toFixed(2)}`;
    }
    const userEmailElement = document.getElementById("user-email");
    const userEmail = userEmailElement ? userEmailElement.textContent : '';
    const saveOption = document.getElementById('save-option');
    if (userEmail === "hollow666metal@gmail.com" || userEmail === "cherepukhin@damn.vc") {
        saveOption.classList.remove('hidden');
    } else {
        saveOption.classList.add('hidden');
    }

    const submitBtn = document.getElementById("submit-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    if (submitBtn) {
        submitBtn.onclick = handleSubmit;
        console.log("Submit button listener added in modal"); // Debug log
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            debugLog("Language selection cancelled");
            modal.classList.add("hidden");
        };
    }
    if (!submitBtn || !cancelBtn) {
        console.error("One or more modal buttons not found");
    }

    // Set up language dropdown
    const languageDropdown = document.getElementById("language-dropdown");
    const languageOptions = document.getElementById("language-options");
    if (languageDropdown && languageOptions) {
        languageDropdown.onclick = () => {
            languageOptions.classList.toggle("hidden");
        };
    }
}

// Add this function to handle language selection
function selectLanguage(lang) {
    selectedLanguage = lang;
    console.log("Selected language:", lang);
    const flagElement = document.getElementById("selected-language-flag");
    const langElement = document.getElementById("selected-language");
    if (flagElement && langElement) {
        if (lang === 'en') {
            flagElement.textContent = '🇺🇸';
            langElement.textContent = 'En';
        } else if (lang === 'es') {
            flagElement.textContent = '🇪🇸';
            langElement.textContent = 'Es';
        }
    }
    document.getElementById("language-options").classList.add("hidden");
}

function pollStatus(token, isTestMode = false, fileName = "") {
    return new Promise((resolve, reject) => {
        let attemptCount = 0;
        const maxAttempts = 120; // 10 minutes of polling at 5-second intervals

        async function checkStatus() {
            if (isConversionComplete) {
                clearInterval(pollingInterval);
                resolve();
                return;
            }

            if (attemptCount >= maxAttempts) {
                clearInterval(pollingInterval);
                updateUIStatus("error", "Conversion timed out. Please check your email for results.", fileName);
                reject(new Error("Polling timed out"));
                return;
            }
            attemptCount++;

            try {
                const response = await fetch("https://temporary.name/status", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(isTestMode ? { 'X-Test-Mode': 'true' } : {})
                    },
                });

                if (response.status === 502) {
                    console.log("Server is currently unavailable");
                    updateUIStatus("turn-off", "Our servers are currently undergoing maintenance. We'll be back soon!");
                    clearInterval(pollingInterval);
                    reject(new Error("Server unavailable"));
                    return;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                let result = await response.json();
                console.log("Status update received:", result.status);

                if (result.status === "done") {
                    isConversionComplete = true;
                    clearInterval(pollingInterval);
                    clearProcessingStageInterval();
                    updateUIStatus("done", "Shrinking complete. Your context-rich documents await in your inbox!");
                    console.log("Conversion complete, UI updated to 'done' state");
                    resolve(result);
                } else if (result.status === "failed" || result.status === "error") {
                    isConversionComplete = true;
                    clearInterval(pollingInterval);
                    clearProcessingStageInterval();
                    updateUIStatus("error", result.error || "An error occurred during conversion");
                    console.log("Conversion failed, UI updated to 'error' state");
                    reject(new Error(result.error || "Conversion failed"));
                } else if (["idle", "running", "processing"].includes(result.status)) {
                    updateUIStatus(result.status, `Conversion ${result.status}...`, storedFileName);
                    console.log(`Conversion still in progress (${result.status}), continuing to poll...`);
                } else {
                    console.warn("Unknown status received:", result.status);
                }
            } catch (error) {
                console.error("Error polling status:", error);
                updateUIStatus("error", `An error occurred while checking status: ${error.message}`);
                clearInterval(pollingInterval);
                clearProcessingStageInterval();
                reject(error);
            }
        }

        const pollingInterval = setInterval(checkStatus, 5000);
        checkStatus(); // Start the polling process immediately
    });
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

//function updateUIStatus(status, message = "") {
//  debugLog(`Updating UI status: ${status}`);
 // const statusSection = document.getElementById("status-section");
 // const fileName = document.getElementById("file-name").textContent;
 // const userEmail = document.getElementById("user-email").textContent;
//
 // if (statusSection) {
//    statusSection.innerHTML = `
 //     <p>File: ${fileName}</p>
 //     <p>Email: ${userEmail}</p>
 //     <p>Status: ${status}</p>
 //     ${message ? `<p>${message}</p>` : ''}
 //   `;
 // }

 // toggleSection(status === "running" ? "status-section" :
 //               status === "done" ? "done-section" :
 //               status === "error" ? "error-section" : "input-section");
//}

//function toggleSection(sectionToShow) {
 // const sections = [
//    "input-section",
 //   "file-upload-section",
//    "status-section",
//    "error-section",
//    "done-section"
//  ];
//
//  sections.forEach(sectionId => {
//    const section = document.getElementById(sectionId);
//    if (section) {
//      section.classList.toggle("hidden", sectionId !== sectionToShow);
//    } else {
//      console.warn(`Section not found: ${sectionId}`);
 //   }
//  });
//}

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

async function handleConversion(inputData, lang, sessionId, price, isTestMode, saveFlag) {
    try {
        isConversionComplete = false; // Reset the flag at the start of conversion
        updateUIStatus("preparing", "Payment confirmed, preparing to start conversion...", storedFileName);

        let token = isTestMode ? 'test_token' : await auth0Client.getTokenSilently();

        if (typeof inputData === 'string' && inputData.startsWith('file:')) {
            // This is a file ID, retrieve the file
            const fileId = inputData.split(':')[1];
            const file = await retrieveFileFromTemporaryStorage(fileId);
            if (!file) {
                throw new Error("Failed to retrieve file from temporary storage");
            }

            updateUIStatus("uploading", "Uploading file...", storedFileName);
            inputData = await uploadFile(file, token, isTestMode);
        }

        await postToConvert(inputData, lang, sessionId, price, isTestMode, saveFlag, token);
        updateUIStatus("processing", "Conversion started. You will be notified when it's complete.", storedFileName);

        // Start polling for status
        try {
            await pollStatus(token, isTestMode);
            // If pollStatus resolves successfully, the conversion is done
            updateUIStatus("done", "Conversion completed successfully. Check your email for results.", storedFileName);
        } catch (pollError) {
            console.error("Error during status polling:", pollError);
            updateUIStatus("error", "An error occurred during conversion. Please try again.", storedFileName);
        }
    } catch (error) {
        console.error('Error in handleConversion:', error);
        updateUIStatus("error", "Error: " + error.message, storedFileName);
    } finally {
        isConversionComplete = true; // Ensure flag is set even if an error occurs
    }
}

async function handleStripeSuccess(sessionId) {
    console.log("handleStripeSuccess called with sessionId:", sessionId);
    try {
      await ensureAuth0Initialized();

      const isAuthenticated = await auth0Client.isAuthenticated();
      if (!isAuthenticated) {
        console.log("User not authenticated, initiating login process");
        await auth0Client.loginWithRedirect({
          appState: { returnTo: `${DOMAIN}${window.location.pathname}`, pendingConversion: true }
        });
        return;
      }

      const user = await auth0Client.getUser();
      console.log("User authenticated:", user.email);

      // Update UI with user email
      const userEmailElement = document.getElementById("user-email");
      if (userEmailElement) {
        userEmailElement.textContent = user.email;
      }

      const successfulPaymentString = localStorage.getItem('successfulPayment');
      console.log("Retrieved successfulPayment:", successfulPaymentString);

      if (!successfulPaymentString) {
        throw new Error('No successful payment data found');
      }

      const { session_id, pendingConversionData: pendingConversionDataString } = JSON.parse(successfulPaymentString);
      console.log("Parsed session_id:", session_id);
      console.log("Parsed pendingConversionDataString:", pendingConversionDataString);

      if (!pendingConversionDataString) {
        throw new Error('No pending conversion data found');
      }

      const pendingConversionData = JSON.parse(pendingConversionDataString);
      console.log("Parsed pendingConversionData:", pendingConversionData);

      let { inputData, lang, price, isFile, isTestMode, save } = pendingConversionData;

      storedFileName = pendingConversionData.fileName || inputData;

      localStorage.removeItem('successfulPayment');

      console.log('Processing successful payment with data:', pendingConversionData);

      updateUIStatus("processing", "Processing successful payment...");

      let token = isTestMode ? 'test_token' : await getAuthToken();

      if (inputData.includes('youtube.com') || inputData.includes('youtu.be')) {
        console.log('Processing YouTube URL:', inputData);
        updateUIStatus("processing", "Extracting audio and unstructured data from YouTube. This process involves isolating the audio stream, identifying conversations, and preparing the content for analysis.");
        const { audioBlob, title } = await processYoutubeUrl(inputData);
        console.log('Audio blob received:', audioBlob);
        const file = new File([audioBlob], `${title || 'youtube_audio'}.mp4`, { type: 'audio/mp4' });
        updateUIStatus("uploading", "Uploading processed YouTube audio...");
        inputData = await uploadFile(file, token, isTestMode);
        console.log('Uploaded URL:', inputData);
    } else if (isFile) {
        console.log("File input detected, proceeding to file upload");
        updateUIStatus("uploading", "Retrieving and uploading file...");
        const file = await retrieveFileFromTemporaryStorage(inputData);
        if (!file) {
            throw new Error("Failed to retrieve file from temporary storage");
        }
        inputData = await uploadFile(file, token, isTestMode);
        console.log("File uploaded successfully, URL:", inputData);
    } else {
        console.log("Non-YouTube URL input detected, using directly:", inputData);
    }
      
      updateUIStatus("preparing", "Payment confirmed, preparing to start conversion...");
      await postToConvert(inputData, lang, session_id, price, isTestMode, save);

      updateUIStatus("processing", "Conversion started. You will be notified when it's complete.");

    } catch (error) {
      console.error('Error in handleStripeSuccess:', error);
      updateUIStatus("error", "Error: " + error.message);
      clearConversionData();
    }
  }

function initializeProcessingStage() {
    if (isConversionComplete) return; // Don't initialize if conversion is complete

    debugLog("Initializing processing stage");
    const processingStage = document.getElementById("processing-stage");
    if (!processingStage) {
      debugLog("Processing stage element not found. Skipping initialization.");
      return;
    }
    updateProcessingStage();
    if (!processingStageInterval) {
      processingStageInterval = setInterval(updateProcessingStage, 3000);
    }
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

document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM Content Loaded, starting initialization");

    try {
        await initDB();
        console.log("DB initialized");

        await testIndexedDB();
        console.log("IndexedDB tested");

        const { client, justHandledRedirect } = await initAuth0();
        auth0Client = client;
        console.log("Auth0 initialized, justHandledRedirect:", justHandledRedirect);

        updateUIStatus("idle"); // Set initial state to idle
        initStripe();
        setupPriceUI();

        // Initialize Lucide icons
        lucide.createIcons();
        console.log('Lucide in');

        if (justHandledRedirect) {
            console.log("Just returned from Auth0, handling auth return");
            await handleAuthReturn();
        } else {
            // Check if we're returning from a successful Stripe payment
            const successfulPayment = localStorage.getItem('successfulPayment');
            console.log("Checking for successfulPayment in localStorage:", successfulPayment);

            if (successfulPayment) {
                console.log("Detected successful payment");
                const { session_id } = JSON.parse(successfulPayment);
                console.log("Parsed session_id:", session_id);
                await handleStripeSuccess(session_id);
            } else {
                console.log("No successful payment detected");
                const isAuthenticated = await auth0Client.isAuthenticated();
                console.log("User authenticated:", isAuthenticated);

                if (isAuthenticated) {
                    console.log("Checking ongoing conversion");
                    await checkOngoingConversion();
                } else {
                    console.log("User not authenticated, skipping ongoing conversion check");
                    updateUIStatus("idle");
                }
            }
        }

        // Generate initial job ID
        updateJobIdInUI();

        // Set up UI elements and event listeners
        setupUIElements();

        // Update UI
        await updateUI();

        console.log("Initialization and checks complete");
    } catch (error) {
        console.error("Error during initialization or payment processing:", error);
        updateUIStatus("idle"); // Set to idle state if initialization fails
    }
});

function setupUIElements() {
    const elements = {
        uploadIcon: document.querySelector(".upload-icon"),
        fileNameElement: document.getElementById("file-name"),
        urlInput: document.getElementById("url-input"),
        convertButton: document.getElementById('convert-button'),
        uploadFileButton: document.getElementById('upload-file-button'),
        fileUploadSection: document.getElementById('file-upload-section'),
        inputSection: document.getElementById('input-section'),
        backToUrlButton: document.getElementById('back-to-url'),
        fileDropArea: document.getElementById('file-drop-area'),
        fileInput: document.querySelector('input[type="file"]'),
        resetFileLink: document.getElementById('reset-file-link'),
        convertFileButton: document.getElementById('convert-file-button'),
        loginButton: document.getElementById('login-button'),
        logoutButton: document.getElementById('logout-button'),
        userCircle: document.getElementById('user-circle'),
        logoutTooltip: document.getElementById('logout-tooltip'),
        cellsButton: document.getElementById('cells-button'),
        chartsButton: document.getElementById('charts-button'),
        aiSummaryButton: document.getElementById('ai-summary-button'),
        tablesButton: document.getElementById('tables-button'),
        filtersButton: document.getElementById('filters-button'),
        dashboardImage: document.getElementById('dashboard-image')
    };

    // Set up event listeners for UI elements
    if (elements.userCircle && elements.logoutTooltip) {
        elements.userCircle.addEventListener('click', handleUserCircleClick);
        document.addEventListener('click', handleOutsideClick);
    }

    if (elements.cellsButton) elements.cellsButton.addEventListener('click', () => changeImage('cells'));
    if (elements.chartsButton) elements.chartsButton.addEventListener('click', () => changeImage('charts'));
    if (elements.aiSummaryButton) elements.aiSummaryButton.addEventListener('click', () => changeImage('ai-summary'));
    if (elements.tablesButton) elements.tablesButton.addEventListener('click', () => changeImage('tables'));
    if (elements.filtersButton) elements.filtersButton.addEventListener('click', () => changeImage('filters'));

    // Set up language selection buttons
    const enButton = document.querySelector('button[onclick="selectLanguage(\'en\')"]');
    const esButton = document.querySelector('button[onclick="selectLanguage(\'es\')"]');
    if (enButton) enButton.onclick = () => selectLanguage('en');
    if (esButton) esButton.onclick = () => selectLanguage('es');

    if (elements.uploadIcon) elements.uploadIcon.addEventListener("click", handleFileUpload);
    if (elements.resetFileLink) elements.resetFileLink.addEventListener('click', handleResetFileLink);
    if (elements.urlInput) elements.urlInput.addEventListener("input", handleUrlInput);
    if (elements.convertButton) elements.convertButton.addEventListener("click", onConvertClick);
    if (elements.uploadFileButton) elements.uploadFileButton.addEventListener('click', handleUploadFileButton);
    if (elements.backToUrlButton) elements.backToUrlButton.addEventListener('click', handleBackToUrlButton);
    if (elements.fileDropArea) setupDragAndDrop(elements.fileDropArea, handleFiles);
    if (elements.fileInput) elements.fileInput.addEventListener('change', handleFileInputChange);
    if (elements.convertFileButton) elements.convertFileButton.addEventListener('click', onConvertClick);
    if (elements.loginButton) elements.loginButton.addEventListener('click', handleLoginButton);
    if (elements.logoutButton) elements.logoutButton.addEventListener('click', handleLogoutButton);

    // Initialize the default view
    changeImage(currentView);
}

// Add the missing changeImage function
function changeImage(type) {
    const image = document.getElementById('dashboard-image');
    const viewImages = {
        cells: './web/static/Assets/Abstract-image.png',
        charts: './web/static/Assets/Chapters-image.png',
        'ai-summary': './web/static/Assets/Contributors-image.png',
        tables: './web/static/Assets/Introduction-image.png',
        filters: './web/static/Assets/Conclusion-image.png'
    };

    if (image) {
        image.src = viewImages[type] || '';
        image.alt = `Dashboard view: ${type}`;
    }

    // Update button styles
    ['cells', 'charts', 'ai-summary', 'tables', 'filters'].forEach(viewType => {
        const button = document.getElementById(`${viewType}-button`);
        if (button) {
            if (viewType === type) {
                button.classList.remove('bg-gray-100', 'text-gray-600');
                button.classList.add('bg-blue-100', 'text-blue-600');
            } else {
                button.classList.remove('bg-blue-100', 'text-blue-600');
                button.classList.add('bg-gray-100', 'text-gray-600');
            }
        }
    });

    currentView = type;
}

// Ensure all functions are in global scope
if (typeof window !== 'undefined') {
    // ... (keep your existing global assignments)
    window.changeImage = changeImage;
}

// Add these handler functions
function handleUserCircleClick(event) {
    console.log('User circle clicked');
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('logout-tooltip').classList.toggle('hidden');
}

function handleOutsideClick(event) {
    const userCircle = document.getElementById('user-circle');
    const logoutTooltip = document.getElementById('logout-tooltip');
    if (userCircle && logoutTooltip && !userCircle.contains(event.target) && !logoutTooltip.contains(event.target)) {
        logoutTooltip.classList.add('hidden');
    }
}

function handleResetFileLink(event) {
    event.preventDefault();
    resetFileSelection();
}

function handleUrlInput() {
    const fileNameElement = document.getElementById("file-name");
    const convertButton = document.getElementById('convert-button');
    if (fileNameElement) fileNameElement.textContent = "";
    uploadedFile = null;
    if (convertButton) convertButton.disabled = this.value.trim() === "";
}

function handleUploadFileButton() {
    toggleSections(document.getElementById('input-section'), document.getElementById('file-upload-section'));
}

function handleBackToUrlButton() {
    resetFileSelection();
    toggleSections(document.getElementById('file-upload-section'), document.getElementById('input-section'));
}

function handleFileInputChange(event) {
    handleFiles(event.target.files);
}

function handleLoginButton(event) {
    event.preventDefault();
    login();
}

function handleLogoutButton(event) {
    event.preventDefault();
    logout();
}

let fileInput;

function handleFileUpload() {
    debugLog("handleFileUpload called");
    const fileNameElement = document.getElementById("file-name");
    const urlInput = document.getElementById("url-input");

    if (!fileInput) {
        fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".srt,.wav,.ogg,.vtt,.mp3,.mp4,.m4a";
        fileInput.style.display = "none";
        // Check if document.body exists before appending
        if (document.body) {
            document.body.appendChild(fileInput);
            debugLog("File input created and appended to body");
        } else {
            debugLog("Document body not available, file input not appended");
            return; // Exit the function if we can't append the input
        }
    }

    fileInput.onchange = (event) => {
        debugLog("File input change event triggered");
        const file = event.target.files[0];
        if (file) {
            uploadedFile = file;
            if (fileNameElement) fileNameElement.textContent = file.name;
            if (urlInput) urlInput.value = "";
            debugLog("File selected: " + file.name);
            debugLog("File size: " + file.size + " bytes");
            debugLog("File type: " + file.type);
            // Enable convert button
            const convertButton = document.getElementById('convert-button');
            if (convertButton) convertButton.disabled = false;
        } else {
            uploadedFile = null;
            if (fileNameElement) fileNameElement.textContent = "";
            debugLog("No file selected");
        }
    };

    debugLog("Triggering file input click");
    fileInput.click();
}

// Function to check for pending conversion after login
// function checkPendingConversion() {
  //  const pendingConversion = sessionStorage.getItem('pendingConversion');
   // if (pendingConversion) {
   //     const { inputData, price } = JSON.parse(pendingConversion);
   //     sessionStorage.removeItem('pendingConversion');
   //     showLanguageSelectionModal(inputData, price);
   // }
//}

//function initializeProcessingStage() {
 // debugLog("Initializing processing stage");
 // const processingStage = document.getElementById("processing-stage");
//  if (!processingStage) {
//    debugLog("Processing stage element not found. Skipping initialization.");
 //   return;
//  }
//  updateProcessingStage();
//  processingStageInterval = setInterval(updateProcessingStage, 3000);
// }

// Ensure all functions are in global scope
if (typeof window !== 'undefined') {
    window.toggleConvertButtonState = toggleConvertButtonState;
    window.toggleSections = toggleSections;
    window.setupDragAndDrop = setupDragAndDrop;
    window.handleFiles = handleFiles;
    window.onConvertClick = onConvertClick;
    window.getInputData = getInputData;
    window.login = login;
    window.logout = logout;
    window.reset = reset;
    window.handleSubmit = handleSubmit;
    window.initializeProcessingStage = initializeProcessingStage;
    window.updateProcessingStage = updateProcessingStage;
    window.handleStripeRedirect = handleStripeRedirect;
    window.handleStripeSuccess = handleStripeSuccess;
    window.handleStripeCancel = handleStripeCancel;
    window.selectLanguage = selectLanguage;
    window.setupPriceUI = setupPriceUI;
    window.storeFileTemporarily = storeFileTemporarily;
    window.retrieveFileFromTemporaryStorage = retrieveFileFromTemporaryStorage;
    window.uploadFile = uploadFile;
    window.postToConvert = postToConvert;
    window.handleAuthReturn = handleAuthReturn;
    window.setRandomPlaceholder = setRandomPlaceholder;
}

window.addEventListener('load', setRandomPlaceholder);