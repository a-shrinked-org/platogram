// Ensure this variable is declared only once
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

        // Handle the redirect callback
        await handleRedirectCallback();

        // Update the UI
        await updateUI();
    } catch (error) {
        console.error("Error initializing Auth0:", error);
        updateUIStatus("error", "Failed to initialize authentication. Please try refreshing the page.");
    }
}

// Add this new function to handle the redirect callback
async function handleRedirectCallback() {
    try {
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
            await auth0Client.handleRedirectCallback();
            window.history.replaceState({}, document.title, "/");
        }
    } catch (error) {
        console.error("Error handling redirect callback:", error);
    }
}

function updateUIStatus(status, errorMessage = "") {
    const inputSection = document.getElementById("input-section");
    const statusSection = document.getElementById("status-section");
    const errorSection = document.getElementById("error-section");
    const doneSection = document.getElementById("done-section");

    inputSection.classList.add("hidden");
    statusSection.classList.add("hidden");
    errorSection.classList.add("hidden");
    doneSection.classList.add("hidden");

    switch (status) {
        case "running":
            statusSection.classList.remove("hidden");
            break;
        case "done":
            doneSection.classList.remove("hidden");
            break;
        case "idle":
            inputSection.classList.remove("hidden");
            break;
        case "error":
            errorSection.classList.remove("hidden");
            errorSection.querySelector("p").textContent =
                errorMessage || "An error occurred. Please try again.";
            break;
    }
}

async function updateUI() {
    const isAuthenticated = await auth0Client.isAuthenticated();
    console.log("Is authenticated:", isAuthenticated);

    const loginButton = document.getElementById("login-button");
    const logoutButton = document.getElementById("logout-button");

    if (loginButton) {
        loginButton.classList.toggle("hidden", isAuthenticated);
        console.log("Login button visibility:", !isAuthenticated);
    }
    if (logoutButton) {
        logoutButton.classList.toggle("hidden", !isAuthenticated);
        console.log("Logout button visibility:", isAuthenticated);
    }

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
        if (error.error === 'login_required') {
            await auth0Client.loginWithRedirect();
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
    try {
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

async function handleRedirectCallback() {
    try {
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
            await auth0Client.handleRedirectCallback();
            window.history.replaceState({}, document.title, "/");
            await updateUI();  // Make sure to call updateUI here
            console.log("Redirect callback handled successfully");
        }
    } catch (error) {
        console.error("Error handling redirect callback:", error);
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
    let body;
    let headers = {
        Authorization: `Bearer ${await auth0Client.getTokenSilently({
            audience: "https://platogram.vercel.app",
        })}`,
    };

    const formData = new FormData();
    formData.append('lang', lang);

    if (inputData instanceof File) {
        formData.append('file', inputData);
    } else {
        formData.append("payload", inputData);
    }

    body = formData;

    try {
        const token = await auth0Client.getTokenSilently({
            audience: "https://platogram.vercel.app",
        });
        console.log("Obtained token for convert:", token);

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
            await pollStatus(token);
        } else {
            updateUIStatus("error", "Unexpected response from server");
        }
    } catch (error) {
        console.error("Error in postToConvert:", error);
        updateUIStatus("error", error.message);
    }
}

const debouncedPollStatus = debounce(pollStatus, 5000);

async function pollStatus() {
    try {
        const result = await apiCall("/status");
        console.log("Polling status response:", result);

        if (result.status === "running") {
            updateUIStatus("running");
            debouncedPollStatus();
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
    document.getElementById('processing-stage').textContent = processingStages[currentStageIndex];
    currentStageIndex = (currentStageIndex + 1) % processingStages.length;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
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
    const testAuthButton = document.getElementById('test-auth-button');
    const fileUpload = document.getElementById('file-upload');

    if (loginButton) loginButton.addEventListener('click', login);
    if (logoutButton) logoutButton.addEventListener('click', logout);
    if (convertButton) convertButton.addEventListener('click', onConvertClick);
    if (donateButton) donateButton.addEventListener('click', onDonateClick);
    if (donateButtonStatus) donateButtonStatus.addEventListener('click', onDonateClick);
    if (resetButton) resetButton.addEventListener('click', reset);
    if (resetButtonError) resetButtonError.addEventListener('click', reset);
    if (testAuthButton) testAuthButton.addEventListener('click', testAuth);
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
        await initAuth0();

        // Check if we're returning from an authentication redirect
        if (window.location.search.includes("code=")) {
            console.log("Detected authentication code in URL, handling callback");
            await handleRedirectCallback();
        } else {
            console.log("No authentication code detected, updating UI");
            await updateUI();
        }
    } catch (error) {
        console.error("Error initializing app:", error);
        updateUIStatus("error", "Failed to initialize the application. Please try refreshing the page.");
    }
});

async function testAuth() {
    try {
        const result = await apiCall("/test-auth");
        console.log("Auth test result:", result);
        alert("Auth test successful. Check console for details.");
    } catch (error) {
        console.error("Auth test failed:", error);
        alert("Auth test failed. Check console for details.");
    }
}

// Note: onDonateClick function is not provided in the original code
// You may want to implement this function if it's needed
function onDonateClick() {
    // Implement donation logic here
    console.log("Donation button clicked");
}