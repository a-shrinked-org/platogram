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

        const isAuthenticated = await auth0Client.isAuthenticated();
        console.log("Is authenticated after initialization:", isAuthenticated);

        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
            console.log("Authentication code detected, handling callback...");
            await handleRedirectCallback();
        } else {
            console.log("No authentication code detected, updating UI...");
            await updateUI();
        }
    } catch (error) {
        console.error("Error initializing Auth0:", error);
        updateUIStatus("error", "Failed to initialize authentication. Please try refreshing the page.");
    }
}

async function handleRedirectCallback() {
    console.log("Handling redirect callback...");
    try {
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
            console.log("Authentication code detected, processing...");
            await auth0Client.handleRedirectCallback();
            console.log("Redirect callback processed");
            window.history.replaceState({}, document.title, window.location.pathname);
            await updateUI();
            console.log("UI updated after redirect callback");
        } else {
            console.log("No authentication code detected in URL");
        }
    } catch (error) {
        console.error("Error handling redirect callback:", error);
        updateUIStatus("error", "Failed to complete authentication. Please try logging in again.");
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
        element.classList.toggle("hidden", status !== sectionStatus);
        if (status === "error" && id === "error-section") {
            element.querySelector("p").textContent = errorMessage || "An error occurred. Please try again.";
        }
    });
}

async function updateUI() {
    console.log("Updating UI...");
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
    // ... (keep this function as is)
}

function getInputData() {
    const urlInput = document.getElementById("url-input").value;
    const fileInput = document.getElementById("file-upload").files[0];
    return urlInput || fileInput;
}

async function login() {
    console.log("Initiating login process...");
    try {
        await auth0Client.loginWithPopup({
            authorizationParams: {
                redirect_uri: window.location.origin,
            },
        });
        console.log("Login successful");
        await updateUI();
    } catch (error) {
        console.error("Error during login:", error);
        if (error.error === 'popup_closed_by_user') {
            console.log("Login popup was closed by the user");
        } else {
            updateUIStatus("error", "Failed to log in. Please try again.");
        }
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
        console.log("Initializing application...");
        await initAuth0();
        // Remove the duplicate check here, as it's already handled in initAuth0
    } catch (error) {
        console.error("Error during application initialization:", error);
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

function onDonateClick() {
    console.log("Donation button clicked");
    // Implement donation logic here
}