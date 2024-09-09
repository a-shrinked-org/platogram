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

window.updateAuthUI = function(isAuthenticated, user) {
    const loginButton = document.getElementById('login-button');
    const userCircle = document.getElementById('user-circle');
    const logoutTooltip = document.getElementById('logout-tooltip');
    if (isAuthenticated && user) {
        if (loginButton) loginButton.classList.add('hidden');
        if (userCircle) {
            userCircle.classList.remove('hidden');
            userCircle.textContent = getInitials(user.email);
        }
    } else {
        if (loginButton) loginButton.classList.remove('hidden');
        if (userCircle) userCircle.classList.add('hidden');
        if (logoutTooltip) logoutTooltip.classList.add('hidden');
    }
};

function getInitials(email) {
    return email.split('@')[0].substring(0, 2).toUpperCase();
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
            coffee1Button.classList.add('bg-blue-500', 'text-white');
        }
        if (coffee2Button) {
            coffee2Button.classList.remove('bg-blue-500', 'text-white');
        }
    } else {
        coffeeCount = 0;
        if (coffee1Button) {
            coffee1Button.classList.remove('bg-blue-500', 'text-white');
        }
        if (coffee2Button) {
            coffee2Button.classList.remove('bg-blue-500', 'text-white');
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
        coffee1Button.classList.add("bg-blue-500", "text-white");
      } else {
        coffee1Button.classList.remove("bg-blue-500", "text-white");
      }
    }
    if (coffee2Button) {
      if (count === 2) {
        coffee2Button.classList.add("bg-blue-500", "text-white");
      } else {
        coffee2Button.classList.remove("bg-blue-500", "text-white");
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

        debugLog("File selected: " + file.name);
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
    const uploadProcessSection = document.getElementById("upload-process-section");
    const statusSection = document.getElementById("status-section");
    const doneSection = document.getElementById("done-section");
    const errorSection = document.getElementById("error-section");

    const fileName = document.getElementById("file-name")?.textContent || "Unknown file";
    const userEmail = document.getElementById("user-email")?.textContent || "Unknown email";

    // Hide all sections first
    [inputSection, statusSection, uploadProcessSection, doneSection, errorSection].forEach(section => {
        if (section) section.classList.add("hidden");
    });

    // Show the appropriate section based on status
    switch (status) {
        case "idle":
            toggleSection("input-section");
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
                        <p>File/URL: ${fileName}</p>
                        <p>Email: ${userEmail}</p>
                        <p>Status: Payment confirmed, preparing to start conversion</p>
                        <p>${message}</p>
                    `;
                } else {
                    processingStatusText.innerHTML = `
                        <p>File/URL: ${fileName}</p>
                        <p>Email: ${userEmail}</p>
                        <p>Status: Preparing to start conversion</p>
                        <p>${message}</p>
                    `;
                }
            }
            break;
        case "running":
            toggleSection("status-section");
            if (statusSection) {
                statusSection.innerHTML = `
                    <p>File/URL: ${fileName}</p>
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
                    <p>File/URL: ${fileName}</p>
                    <p>Email: ${userEmail}</p>
                    <p>Status: Completed</p>
                    ${message ? `<p>${message}</p>` : ''}
                    <button class="mx-auto block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" onclick="reset()">Reset</button>
                `;
            }
            clearProcessingStageInterval();
            break;
        case "error":
            toggleSection("error-section");
            if (errorSection) {
                errorSection.innerHTML = `
                    <p>File/URL: ${fileName}</p>
                    <p>Email: ${userEmail}</p>
                    <p>Status: Error</p>
                    <p>${message || "An error occurred. Please try again."}</p>
                    <button class="mx-auto block px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" onclick="reset()">Reset</button>
                `;
            }
            clearProcessingStageInterval();
            break;
        default:
            console.warn(`Unknown status: ${status}`);
            toggleSection("input-section");
    }
}
  
async function updateUI() {
    if (!auth0Client) {
      console.error("Auth0 client not initialized");
      updateUIStatus("idle"); // Set default state to idle
      return;
    }

    try {
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
        const userEmailElement = document.getElementById("user-email");
        if (userEmailElement) {
          userEmailElement.textContent = user.email;
        }
        await pollStatus(token);
        debugLog("Logged in as: " + user.email);

        window.updateAuthUI(isAuthenticated, user);
      } else {
        window.updateAuthUI(false, null);
        updateUIStatus("idle"); // Set to idle state for non-authenticated users
      }
    } catch (error) {
      console.error("Error updating UI:", error);
      updateUIStatus("idle"); // Set to idle state on error
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

    updateUIStatus("idle");  // Set status to idle after reset
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

        if (price > 0) {
            console.log('Non-zero price detected, initiating paid conversion');
            await handlePaidConversion(inputData, price);
        } else {
            // For free conversions, proceed with upload/conversion
            if (inputData instanceof File) {
                updateUIStatus("uploading", "Uploading file...");
                const uploadedUrl = await uploadFile(inputData);
                inputData = uploadedUrl;
            }
            updateUIStatus("preparing", "File uploaded, preparing to start conversion...");
            await postToConvert(inputData, selectedLanguage, null, price, false);
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

async function handlePaidConversion(inputData, price) {
    console.log('handlePaidConversion called', { price });
    const user = await auth0Client.getUser();
    const email = user.email || user["https://platogram.com/user_email"];
    if (!email) {
        throw new Error('User email not available');
    }
    console.log('User email retrieved', { email });

    let fileId = null;
    if (inputData instanceof File) {
        fileId = await storeFileTemporarily(inputData);
        console.log('File stored temporarily with ID:', fileId);
    }

    const conversionData = {
        inputData: fileId || inputData,
        isFile: !!fileId,
        lang: selectedLanguage,
        price: price
    };

    sessionStorage.setItem('pendingConversionData', JSON.stringify(conversionData));
    console.log('Stored pendingConversionData:', conversionData);

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
            inputData: fileId || inputData
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

async function simulateStripeCheckout(conversionData) {
    console.log("Simulating Stripe checkout in test mode");
    updateUIStatus("processing", "Simulating payment...");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate payment processing
    await handleStripeSuccess(null, true);
}

async function handleStripeSuccess(sessionId, isTestMode = false) {
    try {
        await ensureDbInitialized();
        const pendingConversionDataString = sessionStorage.getItem('pendingConversionData');
        console.log("Retrieved pendingConversionDataString:", pendingConversionDataString);

        if (!pendingConversionDataString) {
            updateUIStatus('error', 'Invalid success parameters');
            return;
        }

        const pendingConversionData = JSON.parse(pendingConversionDataString);
        let inputData = pendingConversionData.inputData;
        const lang = pendingConversionData.lang;
        const price = pendingConversionData.price;

        try {
            if (pendingConversionData.isFile) {
                console.log("Retrieving file from temporary storage:", inputData);
                updateUIStatus("uploading", "Retrieving and uploading file...");
                const file = await retrieveFileFromTemporaryStorage(inputData);
                if (!file) {
                    throw new Error("Failed to retrieve file from temporary storage");
                }
                console.log("File retrieved, uploading to Blob storage");
                inputData = await uploadFile(file);
                console.log("File uploaded successfully, URL:", inputData);
            } else {
                console.log("URL input detected, using directly:", inputData);
            }

            // Start the conversion process
            updateUIStatus("preparing", "Payment confirmed, preparing to start conversion...");
            await postToConvert(inputData, lang, sessionId, price, isTestMode);

            // Clear the pending conversion data
            sessionStorage.removeItem('pendingConversionData');

        } catch (error) {
            console.error('Error in handleStripeSuccess:', error);
            updateUIStatus("error", "Error starting conversion after payment: " + error.message);
        }
    } catch (error) {
        console.error('Error in handleStripeSuccess:', error);
        updateUIStatus("error", "Error: " + error.message);
    }
}

function handleStripeRedirect() {
    const query = new URLSearchParams(window.location.search);
    if (query.get('success')) {
        console.log('Payment successful! Redirecting to success page...');
        // Instead of updating UI status here, redirect to the success page
        window.location.href = `/success?session_id=${query.get('session_id')}`;
    } else if (query.get('canceled')) {
        console.log('Order canceled -- continue to shop around and checkout when you are ready.');
        updateUIStatus('idle', 'Order canceled. You can try again when you are ready.');
    } else {
        console.log('Unknown Stripe redirect status');
        updateUIStatus('error', 'Unknown payment status. Please contact support if you believe this is an error.');
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
        throw new Error("Please provide a valid URL or upload a file to be converted");
      }
      debugLog("Input data type: " + (inputData instanceof File ? "File" : "URL"));
      if (inputData instanceof File) {
        debugLog("File details:", inputData.name, inputData.type, inputData.size);
      } else {
        debugLog("URL input:", inputData);
      }
      const price = getPriceFromUI();
      if (await auth0Client.isAuthenticated()) {
        showLanguageSelectionModal(inputData, price);
      } else {
        sessionStorage.setItem('pendingConversion', JSON.stringify({ inputData: inputData instanceof File ? inputData.name : inputData, price }));
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

  async function postToConvert(inputData, lang, sessionId, price, isTestMode = false) {
    debugLog("postToConvert called", { inputData, lang, sessionId, price, isTestMode });
    let headers = {};

    try {
        if (!auth0Client) {
            console.log("Auth0 client not initialized, attempting to initialize...");
            await initAuth0();
        }
        const token = await auth0Client.getTokenSilently({
            audience: "https://platogram.vercel.app",
        });
        headers.Authorization = `Bearer ${token}`;
    } catch (error) {
        console.error("Error getting auth token:", error);
        throw new Error("Authentication failed. Please try logging in again.");
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

    try {
        console.log("Sending data to Platogram for conversion:", Object.fromEntries(formData));
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
            return await pollStatus(await auth0Client.getTokenSilently(), isTestMode);
        } else {
            updateUIStatus("error", "Unexpected response from server");
            throw new Error("Unexpected response from server");
        }
    } catch (error) {
        console.error("Error in postToConvert:", error);
        updateUIStatus("error", error.message);
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

function pollStatus(token, isTestMode = false) {
    return new Promise((resolve, reject) => {
        let pollingInterval;
        let attemptCount = 0;
        const maxAttempts = 60; // 5 minutes of polling at 5-second intervals

        async function checkStatus() {
            if (attemptCount >= maxAttempts) {
                clearInterval(pollingInterval);
                updateUIStatus("error", "Conversion timed out. Please try again.");
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

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                console.log("Polling status response:", result);

                updateUIStatus(result.status, `Conversion ${result.status}...`);

                if (result.status === "done" || result.status === "failed" || result.status === "error") {
                    clearInterval(pollingInterval);
                    resolve(result);
                } else if (result.status === "idle") {
                    console.log("Received idle status, continuing to poll...");
                }
            } catch (error) {
                console.error("Error polling status:", error);
                updateUIStatus("error", `An error occurred while checking status: ${error.message}`);
                clearInterval(pollingInterval);
                reject(error);
            }
        }

        pollingInterval = setInterval(checkStatus, 5000);
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

document.addEventListener("DOMContentLoaded", async () => {
    await initDB();
    await testIndexedDB();

    // Add this line to handle Stripe success redirect
    if (window.location.pathname === '/success') {
        await handleStripeSuccessRedirect();
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('session_id')) {
        await handleStripeSuccess(urlParams.get('session_id'));
    }
});

document.addEventListener("DOMContentLoaded", () => {
    debugLog("DOM Content Loaded");
    initStripe();
    handleStripeRedirect();
    setupPriceUI();

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
        convertFileButton: document.getElementById('convert-file-button'),
        loginButton: document.getElementById('login-button'),
        logoutButton: document.getElementById('logout-button'),
        userCircle: document.getElementById('user-circle'),
        logoutTooltip: document.getElementById('logout-tooltip'),
    };

    // Add event listener for userCircle
    if (elements.userCircle && elements.logoutTooltip) {
        elements.userCircle.addEventListener('click', (event) => {
            console.log('User circle clicked');
            event.preventDefault();
            event.stopPropagation();
            elements.logoutTooltip.classList.toggle('hidden');
            console.log('Tooltip hidden class toggled');
            console.log('Tooltip is now ' + (elements.logoutTooltip.classList.contains('hidden') ? 'hidden' : 'visible'));
            console.log('Tooltip classes:', elements.logoutTooltip.className);
        });

        // Add click event listener to document to close tooltip when clicking outside
        document.addEventListener('click', (event) => {
            if (!elements.userCircle.contains(event.target) && !elements.logoutTooltip.contains(event.target)) {
                elements.logoutTooltip.classList.add('hidden');
            }
        });
    }

    // Set up language selection buttons
    const enButton = document.querySelector('button[onclick="selectLanguage(\'en\')"]');
    const esButton = document.querySelector('button[onclick="selectLanguage(\'es\')"]');
    if (enButton) enButton.onclick = () => selectLanguage('en');
    if (esButton) esButton.onclick = () => selectLanguage('es');

    if (elements.uploadIcon) {
        elements.uploadIcon.addEventListener("click", handleFileUpload);
    }

    if (elements.urlInput) {
        elements.urlInput.addEventListener("input", () => {
            if (elements.fileNameElement) elements.fileNameElement.textContent = "";
            uploadedFile = null;
            if (elements.convertButton) elements.convertButton.disabled = elements.urlInput.value.trim() === "";
        });
    }

    if (elements.convertButton) {
        elements.convertButton.addEventListener("click", onConvertClick);
    }

    if (elements.uploadFileButton) {
        elements.uploadFileButton.addEventListener('click', () => {
            toggleSections(elements.inputSection, elements.fileUploadSection);
        });
    }

    if (elements.backToUrlButton) {
        elements.backToUrlButton.addEventListener('click', () => {
            toggleSections(elements.fileUploadSection, elements.inputSection);
        });
    }

    if (elements.fileDropArea) {
        setupDragAndDrop(elements.fileDropArea, handleFiles);
    }

    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', (event) => {
            handleFiles(event.target.files);
        });
    }

    if (elements.convertFileButton) {
        elements.convertFileButton.addEventListener('click', onConvertClick);
    }

    if (elements.loginButton) {
        elements.loginButton.addEventListener('click', (event) => {
            event.preventDefault();
            login();
        });
    }

    if (elements.logoutButton) {
        elements.logoutButton.addEventListener('click', (event) => {
            event.preventDefault();
            logout();
        });
    }

    initAuth0()
        .then(() => updateUI())
        .catch((error) => {
            console.error("Error initializing app:", error);
            updateUIStatus("idle"); // Set to idle state if initialization fails
        });
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
window.storeFileTemporarily = storeFileTemporarily;