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
  formData.append("payload", inputData);

  try {
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
      if (inputData.startsWith("https://vercel.platogram.app/")) {
        try {
          console.log("Attempting to delete temporary file");
          const cleanupResponse = await fetch('/api/blob-upload', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await auth0Client.getTokenSilently()}`
            },
            body: JSON.stringify({ fileUrl: inputData })
          });

          if (cleanupResponse.ok) {
            console.log("Temporary file successfully deleted");
          } else {
            console.error("Failed to delete temporary file");
          }
        } catch (cleanupError) {
          console.error("Error during file cleanup:", cleanupError);
        }
      }
    } else {
      updateUIStatus("error", "Unexpected response from server");
    }
  } catch (error) {
    console.error("Error:", error);
    updateUIStatus("error", error.message);
  }
}