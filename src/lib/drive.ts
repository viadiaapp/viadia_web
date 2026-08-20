import { AppData } from '../types';

const FILE_NAME = 'viadia_data.json';

// Find file ID by name
export async function findDataFile(token: string): Promise<string | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q=name='${FILE_NAME}' and trashed=false&fields=files(id,name)`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Drive API query failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error finding file in Google Drive:', error);
    return null;
  }
}

// Download file contents
export async function downloadDataFile(token: string, fileId: string): Promise<AppData | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file from Drive: ${response.statusText}`);
    }

    const data = await response.json();
    return data as AppData;
  } catch (error) {
    console.error('Error downloading file from Google Drive:', error);
    return null;
  }
}

// Create a new data file
export async function createDataFile(token: string, initialData: AppData): Promise<string> {
  try {
    // 1. Create file metadata
    const metadataUrl = 'https://www.googleapis.com/drive/v3/files';
    const metadataResponse = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: FILE_NAME,
        mimeType: 'application/json',
      }),
    });

    if (!metadataResponse.ok) {
      throw new Error(`Failed to create file metadata: ${metadataResponse.statusText}`);
    }

    const fileMeta = await metadataResponse.json();
    const fileId = fileMeta.id;

    // 2. Upload content
    await uploadContent(token, fileId, initialData);

    return fileId;
  } catch (error) {
    console.error('Error creating file in Google Drive:', error);
    throw error;
  }
}

// Upload content to an existing file
async function uploadContent(token: string, fileId: string, data: AppData): Promise<void> {
  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const response = await fetch(uploadUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data, null, 2),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload content to file: ${response.statusText}`);
  }
}

// Save data to Google Drive (creates file if it doesn't exist, otherwise updates)
export async function saveToDrive(token: string, data: AppData): Promise<string> {
  let fileId = await findDataFile(token);
  if (!fileId) {
    fileId = await createDataFile(token, data);
  } else {
    await uploadContent(token, fileId, data);
  }
  return fileId;
}
