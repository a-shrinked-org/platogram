async function uploadFile(file) {
    console.log('Starting file upload process');
    const formData = new FormData();
    formData.append('file', file);

    console.log('File details:', file.name, file.type, file.size);

    try {
        console.log('Sending file to upload endpoint');
        const response = await fetch('/api/upload-file', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            console.error('File upload failed. Status:', response.status);
            throw new Error('File upload failed');
        }

        const result = await response.json();
        console.log('File upload successful. Received URL:', result.fileUrl);
        return result.fileUrl;
    } catch (error) {
        console.error('Error during file upload:', error);
        throw error;
    }
}