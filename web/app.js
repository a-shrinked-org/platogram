let auth0Client = null;
let stripe = null;
let selectedLanguage = 'en'; // Default language
let pollingInterval;
let elements;
let uploadedFile = null;
let selectedOption = 'coffee';
let coffeeCount = 1;
let customPrice = '';
let totalPrice = 5;

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
    }
    updateTotalPrice();
}

function handleCoffeeCountClick(count) {
    coffeeCount = count;
    customPrice = '';
    const customPriceInput = document.getElementById('custom-price');
    if (customPriceInput) customPriceInput.value = '';
    const coffee1Button = document.getElementById('coffee-1');
    const coffee2Button = document.getElementById('coffee-2');
    if (coffee1Button) {
        coffee1Button.classList.toggle('bg-blue-500', count === 1);
        coffee1Button.classList.toggle('text-white', count === 1);
    }
    if (coffee2Button) {
        coffee2Button.classList.toggle('bg-blue-500', count === 2);
        coffee2Button.classList.toggle('text-white', count === 2);
    }
    updateTotalPrice();
}

function handleCustomPriceChange(e) {
    const value = e.target.value;
    if (value === '' || (/^\d{1,3}(\.\d{0,2})?$/.test(value) && parseFloat(value) <= 999)) {
        customPrice = value;
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

function setupPriceUI() {
    const basicJobButton = document.getElementById('basic-job-button');
    if (basicJobButton) basicJobButton.addEventListener('click', () => handleOptionClick('basic'));

    const coffeeButton = document.getElementById('coffee-button');
    if (coffeeButton) coffeeButton.addEventListener('click', () => handleOptionClick('coffee'));

    const coffee1Button = document.getElementById('coffee-1');
    if (coffee1Button) coffee1Button.addEventListener('click', () => handleCoffeeCountClick(1));

    const coffee2Button = document.getElementById('coffee-2');
    if (coffee2Button) coffee2Button.addEventListener('click', () => handleCoffeeCountClick(2));

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
    updateTotalPrice();
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
        uploadedFile = file; // Update the global uploadedFile variable
        const fileNameDisplay = document.getElementById('file-name-display');
        const convertFileButton = document.getElementById('convert-file-button');
        if (fileNameDisplay) {
            fileNameDisplay.textContent = file.name;
        }
        if (convertFileButton) {
            toggleConvertButtonState(true, convertFileButton);
        }
        // Clear URL input if it exists
        const urlInput = document.getElementById('url-input');
        if (urlInput) urlInput.value = "";

        debugLog("File selected via drag & drop: " + file.name);
        debugLog("File size: " + file.size + " bytes");
        debugLog("File type: " + file.type);
    }
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

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

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

function updateUploadProgress(percentage) {
  const progressBar = document.getElementById('upload-progress');
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${Math.round(percentage)}%`;
  }
}

const submitButtonText = document.getElementById('submit-btn-text');
if (submitButtonText) {
    submitButtonText.textContent = "Processing...";
} else {
    console.error('Submit button text element not found');
}

async function handleSubmit(event) {
    if (event) event.preventDefault();
    console.log('handleSubmit called');
    const price = getPriceFromUI();
    const inputData = getInputData();
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

        let fileUrl;
        if (inputData instanceof File) {
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

        // Close the modal
        const modal = document.getElementById("language-modal");
        if (modal) modal.classList.add("hidden");

        updateUIStatus("running", "Starting conversion...");

        if (price > 0) {
            console.log('Non-zero price detected, initiating Stripe checkout');
            await handlePaidConversion(fileUrl, price);
        } else {
            console.log('Free conversion, proceeding with postToConvert');
            await postToConvert(fileUrl, selectedLanguage, null, price);
        }
    } catch (error) {
        console.error('Error in handleSubmit:', error);
        updateUIStatus("error", "Error: " + error.message);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Submit";
        }
    }
}

async function handlePaidConversion(fileUrl, price) {
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
    const result = await stripe.redirectToCheckout({
        sessionId: session.id,
    });

    if (result.error) {
        throw new Error(result.error.message);
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
        debugLog("Input data type: " + (inputData ? (inputData instanceof File ? "File" : "URL") : "null"));
        if (inputData instanceof File) {
            debugLog("File details:", inputData.name, inputData.type, inputData.size);
        } else if (typeof inputData === 'string') {
            debugLog("URL input:", inputData);
        }
        if (!inputData) {
            throw new Error("Please provide a valid URL or upload a file to be converted");
        }
        const price = getPriceFromUI();
        if (await auth0Client.isAuthenticated()) {
            showLanguageSelectionModal(inputData, price);
        } else {
            // Store the input data and price for use after login
            sessionStorage.setItem('pendingConversion', JSON.stringify({ inputData, price }));
            login();
        }
    } catch (error) {
        console.error("Error in onConvertClick:", error);
        updateUIStatus("error", error.message);
    }
}

async function uploadFile(file) {
  console.log('Starting file upload process');
  console.log('File details:', file.name, file.type, file.size);

  try {
    // Step 1: Get the upload URL
    const getUploadUrlResponse = await fetch('/api/upload-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });

    if (!getUploadUrlResponse.ok) {
      throw new Error('Failed to get upload URL');
    }

    const { url, headers } = await getUploadUrlResponse.json();

    // Step 2: Upload the file with progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      Object.keys(headers).forEach(key => xhr.setRequestHeader(key, headers[key]));

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          updateUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const fileUrl = url.split('?')[0];  // Remove query parameters to get the file URL
          console.log('File upload completed. Final URL:', fileUrl);
          resolve(fileUrl);
        } else {
          reject(new Error('Failed to upload file'));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during file upload'));
      };

      xhr.send(file);
    });
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

async function deleteFile(fileUrl) {
  try {
    const response = await fetch('/api/upload-file', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileUrl: fileUrl })
    });

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }

    const result = await response.json();
    console.log('File deleted successfully:', result.message);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
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
          await deleteFile(inputData);
          console.log("Temporary file successfully deleted");
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
    debugLog("getInputData called");
    debugLog("URL input: " + urlInput);
    debugLog("uploadedFile exists: " + !!uploadedFile);
    if (uploadedFile) {
        debugLog("File name: " + uploadedFile.name);
        debugLog("File size: " + uploadedFile.size + " bytes");
        debugLog("File type: " + uploadedFile.type);
    }
    return urlInput || uploadedFile || null;
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
    const fileNameElement = modal.querySelector("#file-name");
    if (fileNameElement) {
        fileNameElement.textContent = inputData instanceof File ? inputData.name : inputData;
        console.log("Setting modal file name to:", fileNameElement.textContent); // Debug log
    }
    const priceElement = modal.querySelector("#modal-price");
    if (priceElement) {
        priceElement.textContent = `$${price.toFixed(2)}`;
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
  setupPriceUI();

  const uploadIcon = document.querySelector(".upload-icon");
    const fileNameElement = document.getElementById("file-name");
    const urlInput = document.getElementById("url-input");
    const convertButton = document.getElementById('convert-button');

  // Set up language selection buttons
    const enButton = document.querySelector('button[onclick="selectLanguage(\'en\')"]');
    const esButton = document.querySelector('button[onclick="selectLanguage(\'es\')"]');
    if (enButton) enButton.onclick = () => selectLanguage('en');
    if (esButton) esButton.onclick = () => selectLanguage('es');

    if (uploadIcon) {
        uploadIcon.addEventListener("click", handleFileUpload);
    }

    if (urlInput) {
        urlInput.addEventListener("input", () => {
            if (fileNameElement) fileNameElement.textContent = "";
            uploadedFile = null;
            if (convertButton) convertButton.disabled = urlInput.value.trim() === "";
        });
    }

    if (convertButton) {
        convertButton.addEventListener("click", onConvertClick);
    }

    initAuth0().catch((error) => console.error("Error initializing app:", error));
});

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
        document.body.appendChild(fileInput);
        debugLog("File input created");
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
window.toggleConvertButtonState = toggleConvertButtonState;
window.toggleSections = toggleSections;
window.setupDragAndDrop = setupDragAndDrop;
window.handleFiles = handleFiles;
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
window.selectLanguage = selectLanguage;
window.setupPriceUI = setupPriceUI;